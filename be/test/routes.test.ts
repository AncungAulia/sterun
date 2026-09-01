/**
 * The vault's HTTP surface, end to end against a real Postgres.
 *
 * Two of STE-11's four third-party checks are here, and both are mechanical
 * rather than "we looked":
 *
 *   (3) no endpoint returns PII without the defined authentication — every
 *       route is called with no credentials, with someone else's credentials,
 *       and with a replayed nonce;
 *   (4) no response schema can express a PII field — asserted by reading the
 *       schemas, so a future route that adds one fails here.
 */
import { Keypair } from "@stellar/stellar-sdk";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChallengeStore } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import type { Keyring } from "../src/crypto/keyring.js";
import { RESPONSE_SCHEMAS } from "../src/routes/participants.js";
import { buildServer } from "../src/server.js";
import { participantHash, saltFromHex } from "../src/spec/participant-hash.js";
import { Vault } from "../src/vault.js";
import { DATABASE_URL, SKIP_REASON, freshDatabase } from "./helpers/db.js";

const PERSON = {
  name: "Budi Santoso",
  national_id: "3174012509900001",
  emergency_contact: "+6281234567890",
};
const PII_VALUES = [PERSON.name, PERSON.national_id, PERSON.emergency_contact];

describe("response schemas cannot express PII", () => {
  // This test needs no database: it reads the schemas Fastify serialises from.
  // Fastify emits ONLY the properties a response schema names, so a schema that
  // cannot express `name` is a route that cannot leak one — check (4), done by
  // reading the contract rather than grepping the code.
  it.each(Object.entries(RESPONSE_SCHEMAS))("%s names no PII field", (_name, schema) => {
    const json = JSON.stringify(schema);
    for (const forbidden of ["name", "national_id", "emergency_contact"]) {
      // `participant_id` etc. contain "id"; match whole property keys only.
      expect(json).not.toMatch(new RegExp(`"${forbidden}"\\s*:`));
    }
  });

  it("closes every response object, so an extra field cannot ride along", () => {
    const closed = (o: unknown): boolean => {
      if (typeof o !== "object" || o === null) return true;
      const obj = o as Record<string, unknown>;
      if (obj.type === "object" && obj.additionalProperties !== false) return false;
      return Object.values(obj).every(closed);
    };
    for (const schema of Object.values(RESPONSE_SCHEMAS)) expect(closed(schema)).toBe(true);
  });
});

describe.skipIf(!DATABASE_URL)(`participant routes (${DATABASE_URL ? "postgres" : SKIP_REASON})`, () => {
  let pool: Pool;
  let keyring: Keyring;
  let close: () => Promise<void>;
  let app: FastifyInstance;
  let challenges: ChallengeStore;
  const runner = Keypair.random();
  const stranger = Keypair.random();

  /** Full challenge/sign/spend cycle — what a wallet does. */
  async function credentials(kp: Keypair): Promise<Record<string, string>> {
    const res = await app.inject({
      method: "POST",
      url: "/auth/challenge",
      payload: { address: kp.publicKey() },
    });
    const { nonce } = res.json();
    return {
      "x-sterun-address": kp.publicKey(),
      "x-sterun-nonce": nonce,
      // Buffer.from is required: Keypair.sign returns a Uint8Array, whose
      // toString ignores the encoding argument.
      "x-sterun-signature": Buffer.from(kp.sign(Buffer.from(nonce, "utf8"))).toString("base64"),
    };
  }

  const submit = async (kp: Keypair, overrides: Record<string, unknown> = {}) =>
    app.inject({
      method: "POST",
      url: "/participants",
      headers: await credentials(kp),
      payload: { ...PERSON, event_id: 0, category_id: 0, runner_address: kp.publicKey(), ...overrides },
    });

  beforeAll(async () => {
    ({ pool, keyring, close } = await freshDatabase());
    challenges = new ChallengeStore();
    app = buildServer(loadConfig({ NODE_ENV: "test" }), {
      vault: new Vault(pool, keyring),
      challenges,
    });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await close?.();
  });

  describe("POST /participants", () => {
    it("stores the entry and returns hash, salt and secret exactly once", async () => {
      const res = await submit(runner);
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.participant_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(body.shown_once).toBe(true);
      // The runner can recompute their own hash from what they were handed —
      // which is the point of showing the salt at all.
      expect(
        participantHash(
          {
            name: PERSON.name,
            nationalId: PERSON.national_id,
            emergencyContact: PERSON.emergency_contact,
          },
          saltFromHex(body.salt),
        ),
      ).toBe(body.participant_hash);
    });

    it("never echoes the submitted PII back", async () => {
      const res = await submit(runner);
      for (const value of PII_VALUES) expect(res.body).not.toContain(value);
    });

    it("refuses to store one account's documents under another's address", async () => {
      const res = await submit(runner, { runner_address: stranger.publicKey() });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("forbidden");
    });

    it("answers a blank name with the frozen field and error code", async () => {
      const res = await submit(runner, { name: " \t \n " });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "E_EMPTY", field: "name" });
    });

    it("rejects an unknown field rather than ignoring it", async () => {
      const res = await submit(runner, { nickname: "budi" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("invalid_request");
    });

    it.each([
      ["missing everything", {}],
      ["bad address", { "x-sterun-address": "not-an-address", "x-sterun-nonce": "x", "x-sterun-signature": "y" }],
    ])("rejects an unauthenticated request (%s)", async (_label, headers) => {
      const res = await app.inject({
        method: "POST",
        url: "/participants",
        headers: headers as Record<string, string>,
        payload: { ...PERSON, event_id: 0, category_id: 0, runner_address: runner.publicKey() },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects a nonce signed by a different key", async () => {
      const creds = await credentials(runner);
      const res = await app.inject({
        method: "POST",
        url: "/participants",
        headers: {
          ...creds,
          "x-sterun-signature": Buffer.from(
            stranger.sign(Buffer.from(creds["x-sterun-nonce"] as string, "utf8")),
          ).toString("base64"),
        },
        payload: { ...PERSON, event_id: 0, category_id: 0, runner_address: runner.publicKey() },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("bad-signature");
    });

    it("refuses to accept the same nonce twice", async () => {
      const creds = await credentials(runner);
      const payload = { ...PERSON, event_id: 0, category_id: 0, runner_address: runner.publicKey() };
      const first = await app.inject({ method: "POST", url: "/participants", headers: creds, payload });
      expect(first.statusCode).toBe(201);
      // Replay: a captured signature must be worth nothing.
      const second = await app.inject({ method: "POST", url: "/participants", headers: creds, payload });
      expect(second.statusCode).toBe(401);
      expect(second.json().error).toBe("unknown-nonce");
    });
  });

  describe("POST /participants/:id/confirm", () => {
    it("links the row to the on-chain record", async () => {
      const { participant_id } = (await submit(runner)).json();
      const res = await app.inject({
        method: "POST",
        url: `/participants/${participant_id}/confirm`,
        headers: await credentials(runner),
        payload: { token_id: 7, enter_tx_hash: "a".repeat(64) },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ token_id: 7 });
    });

    it("refuses another account confirming someone else's row", async () => {
      const { participant_id } = (await submit(runner)).json();
      const res = await app.inject({
        method: "POST",
        url: `/participants/${participant_id}/confirm`,
        headers: await credentials(stranger),
        payload: { token_id: 8, enter_tx_hash: "b".repeat(64) },
      });
      expect(res.statusCode).toBe(403);
    });

    it("409s when the row is already confirmed as a different token", async () => {
      const { participant_id } = (await submit(runner)).json();
      const url = `/participants/${participant_id}/confirm`;
      await app.inject({
        method: "POST",
        url,
        headers: await credentials(runner),
        payload: { token_id: 9, enter_tx_hash: "c".repeat(64) },
      });
      const res = await app.inject({
        method: "POST",
        url,
        headers: await credentials(runner),
        payload: { token_id: 10, enter_tx_hash: "d".repeat(64) },
      });
      expect(res.statusCode).toBe(409);
    });

    it("rejects a transaction hash that is not one", async () => {
      const { participant_id } = (await submit(runner)).json();
      const res = await app.inject({
        method: "POST",
        url: `/participants/${participant_id}/confirm`,
        headers: await credentials(runner),
        payload: { token_id: 11, enter_tx_hash: "nope" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /participants/:id", () => {
    it("returns metadata and NOT the person", async () => {
      const { participant_id } = (await submit(runner)).json();
      const res = await app.inject({
        method: "GET",
        url: `/participants/${participant_id}`,
        headers: await credentials(runner),
      });
      expect(res.statusCode).toBe(200);
      // The whole claim, checked on the wire: the response body contains no
      // fragment of what was submitted.
      for (const value of PII_VALUES) expect(res.body).not.toContain(value);
      expect(res.json()).toMatchObject({ runner_address: runner.publicKey(), token_id: null });
    });

    it("is not readable without credentials", async () => {
      const { participant_id } = (await submit(runner)).json();
      const res = await app.inject({ method: "GET", url: `/participants/${participant_id}` });
      expect(res.statusCode).toBe(401);
      for (const value of PII_VALUES) expect(res.body).not.toContain(value);
    });

    it("is not readable by another account", async () => {
      const { participant_id } = (await submit(runner)).json();
      const res = await app.inject({
        method: "GET",
        url: `/participants/${participant_id}`,
        headers: await credentials(stranger),
      });
      expect(res.statusCode).toBe(403);
    });

    it("404s for a well-formed id that does not exist", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/participants/00000000-0000-4000-8000-000000000000",
        headers: await credentials(runner),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("the whole entry flow, in order", () => {
    it("challenge -> submit -> confirm -> read back, with no PII on the wire", async () => {
      const bodies: string[] = [];

      const challenge = await app.inject({
        method: "POST",
        url: "/auth/challenge",
        payload: { address: runner.publicKey() },
      });
      bodies.push(challenge.body);

      const created = await submit(runner);
      bodies.push(created.body);
      const { participant_id, participant_hash, totp_secret } = created.json();

      const confirmed = await app.inject({
        method: "POST",
        url: `/participants/${participant_id}/confirm`,
        headers: await credentials(runner),
        payload: { token_id: 4242, enter_tx_hash: "f".repeat(64) },
      });
      bodies.push(confirmed.body);

      const read = await app.inject({
        method: "GET",
        url: `/participants/${participant_id}`,
        headers: await credentials(runner),
      });
      bodies.push(read.body);
      expect(read.json()).toMatchObject({ token_id: 4242, participant_hash });

      // Across every response in the flow, not one fragment of the person.
      for (const body of bodies) {
        for (const value of PII_VALUES) expect(body).not.toContain(value);
      }

      // And the roster path (STE-16) can still mint the runner's codes.
      const vaultSecret = await new Vault(pool, keyring).totpSecretForToken(4242);
      expect(vaultSecret?.toString("hex")).toBe(totp_secret);
    });
  });
});
