/**
 * STE-16 — the roster bundle, the most sensitive response Sterun serves.
 *
 * It hands a scanner every check-in secret for one event at once, so most of
 * this file is about who does not get one. Three gates, tested separately
 * because each fails differently:
 *
 *   a wallet signature, single-use and time-bound (shared with the vault);
 *   the CHAIN's answer to "is this address a scanner for this event", re-read
 *   on every request rather than cached here;
 *   one event per request, with no wildcard.
 *
 * The positive path checks the other half: the bundle a scanner PWA can
 * actually work a desk from — token, bib, state, secret, TOTP parameters — and
 * that it contains no name, no national id and no contact.
 */
import { Keypair } from "@stellar/stellar-sdk";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChallengeStore } from "../src/auth.js";
import { ChainReader } from "../src/chain/reader.js";
import { loadConfig } from "../src/config.js";
import type { Keyring } from "../src/crypto/keyring.js";
import { Indexer } from "../src/indexer/indexer.js";
import { buildServer } from "../src/server.js";
import { codeAt, secretFromHex } from "../src/spec/totp.js";
import { Vault } from "../src/vault.js";
import { ADDRESSES, keypairFor } from "./helpers/addresses.js";
import { FakeChain } from "./helpers/fake-chain.js";
import { FakeEventSource } from "./helpers/fake-events.js";
import { DATABASE_URL, SKIP_REASON, freshDatabase } from "./helpers/db.js";

const organiserKp = keypairFor("organiser");
const scannerKp = keypairFor("scanner");
const strangerKp = keypairFor("stranger");
const runnerKp = keypairFor("runner-a");
const runnerBKp = keypairFor("runner-b");

const PERSON = {
  name: "Budi Santoso",
  nationalId: "3174012509900001",
  emergencyContact: "+6281234567890",
};

describe.skipIf(!DATABASE_URL)(`roster bundle (${DATABASE_URL ? "postgres" : SKIP_REASON})`, () => {
  let pool: Pool;
  let keyring: Keyring;
  let close: () => Promise<void>;
  let app: FastifyInstance;
  let vault: Vault;
  let chain: FakeChain;

  beforeEach(async () => {
    ({ pool, keyring, close } = await freshDatabase());
    chain = new FakeChain(ADDRESSES);
    const reader = new ChainReader(chain, ADDRESSES);
    vault = new Vault(pool, keyring);

    chain.addEvent({
      eventId: 0,
      organiser: organiserKp.publicKey(),
      scanners: [scannerKp.publicKey()],
    });
    chain.addCategory({ eventId: 0, categoryId: 0 });
    chain.addRecord({ tokenId: 0, eventId: 0, owner: runnerKp.publicKey(), bibNo: 1 });
    chain.addRecord({
      tokenId: 1,
      eventId: 0,
      owner: runnerBKp.publicKey(),
      bibNo: 2,
      state: "RacepackClaimed",
      claimedAt: 1_800_000_600n,
    });
    // A second event, so "scoped to one event" is a claim with something to
    // leak into if it were false.
    chain.addEvent({ eventId: 1, organiser: organiserKp.publicKey() });
    chain.addRecord({ tokenId: 2, eventId: 1, owner: runnerKp.publicKey(), bibNo: 1 });

    await new Indexer(pool, reader, new FakeEventSource([]), ADDRESSES).rebuild();

    app = buildServer(loadConfig({ NODE_ENV: "test" }), {
      pool,
      vault,
      reader,
      challenges: new ChallengeStore(),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await close();
  });

  /** Submit and confirm one entry, the way the STE-11 flow does. */
  async function enrol(
    kp: Keypair,
    eventId: number,
    tokenId: number,
    name = PERSON.name,
  ): Promise<{ participantId: string; totpSecretHex: string }> {
    const submitted = await vault.submit({
      ...PERSON,
      name,
      eventId,
      categoryId: 0,
      runnerAddress: kp.publicKey(),
    });
    await vault.confirm(submitted.participantId, tokenId, "ab".repeat(32));
    return { participantId: submitted.participantId, totpSecretHex: submitted.totpSecretHex };
  }

  /** The full challenge/sign/spend cycle a wallet performs. */
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
      "x-sterun-signature": Buffer.from(kp.sign(Buffer.from(nonce, "utf8"))).toString("base64"),
    };
  }

  const fetchRoster = async (kp: Keypair, eventId = 0) =>
    app.inject({ method: "GET", url: `/events/${eventId}/roster`, headers: await credentials(kp) });

  describe("who may download it", () => {
    it("gives the bundle to an allowlisted scanner", async () => {
      await enrol(runnerKp, 0, 0);
      const res = await fetchRoster(scannerKp);
      expect(res.statusCode).toBe(200);
      expect(res.json().count).toBe(1);
    });

    it("gives the bundle to the organiser", async () => {
      await enrol(runnerKp, 0, 0);
      expect((await fetchRoster(organiserKp)).statusCode).toBe(200);
    });

    it("refuses an address the chain does not list", async () => {
      const res = await fetchRoster(strangerKp);
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("forbidden");
    });

    it("refuses the runner whose own secret is in the bundle", async () => {
      // Being in the roster is not permission to read the roster: one runner
      // would hold every other runner's check-in secret.
      await enrol(runnerKp, 0, 0);
      expect((await fetchRoster(runnerKp)).statusCode).toBe(403);
    });

    it("re-reads the allowlist from the chain on every request", async () => {
      await enrol(runnerKp, 0, 0);
      expect((await fetchRoster(scannerKp)).statusCode).toBe(200);

      // Revoked on-chain — no cache to invalidate, no revocation list to
      // forget. The next request is simply refused.
      chain.events.get(0)!.scanners = [];
      expect((await fetchRoster(scannerKp)).statusCode).toBe(403);
    });

    it("does not let a scanner for one event read another event's roster", async () => {
      await enrol(runnerKp, 1, 2);
      // scannerKp is allowlisted on event 0 only.
      expect((await fetchRoster(scannerKp, 1)).statusCode).toBe(403);
    });

    it("answers 404 for an event that does not exist on-chain", async () => {
      // get_organiser reverts EventNotFound; answering "forbidden" would send
      // someone hunting a permissions problem that is not there.
      const res = await fetchRoster(scannerKp, 9);
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("not_found");
    });
  });

  describe("authentication", () => {
    it("refuses a request with no credentials at all", async () => {
      const res = await app.inject({ method: "GET", url: "/events/0/roster" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("missing-credentials");
    });

    it("refuses a replayed nonce — one signature, one download", async () => {
      await enrol(runnerKp, 0, 0);
      const creds = await credentials(scannerKp);
      expect((await app.inject({ url: "/events/0/roster", headers: creds })).statusCode).toBe(200);
      const replay = await app.inject({ url: "/events/0/roster", headers: creds });
      expect(replay.statusCode).toBe(401);
      expect(replay.json().error).toBe("unknown-nonce");
    });

    it("refuses a signature from a different key than the nonce was issued to", async () => {
      const creds = await credentials(scannerKp);
      const forged = {
        ...creds,
        "x-sterun-signature": Buffer.from(
          strangerKp.sign(Buffer.from(creds["x-sterun-nonce"] as string, "utf8")),
        ).toString("base64"),
      };
      expect((await app.inject({ url: "/events/0/roster", headers: forged })).statusCode).toBe(401);
    });

    it("refuses someone else's address with their own nonce", async () => {
      const creds = await credentials(strangerKp);
      const swapped = { ...creds, "x-sterun-address": scannerKp.publicKey() };
      expect((await app.inject({ url: "/events/0/roster", headers: swapped })).statusCode).toBe(401);
    });

    it("names the Uint8Array.toString trap when the signature is the wrong length", async () => {
      const creds = await credentials(scannerKp);
      const broken = {
        ...creds,
        // What `kp.sign(msg).toString("base64")` actually produces.
        "x-sterun-signature": Buffer.from(
          scannerKp.sign(Buffer.from(creds["x-sterun-nonce"] as string, "utf8")).toString(),
          "base64",
        ).toString("base64"),
      };
      const res = await app.inject({ url: "/events/0/roster", headers: broken });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("malformed-signature");
    });
  });

  describe("what the bundle contains", () => {
    it("carries what a desk needs and nothing else", async () => {
      const { totpSecretHex } = await enrol(runnerKp, 0, 0);
      const body = (await fetchRoster(scannerKp)).json();

      expect(body).toMatchObject({
        event_id: 0,
        count: 1,
        missing_from_index: 0,
        totp: { digits: 6, step_seconds: 30, tolerance_steps: 1 },
      });
      expect(body.entries[0]).toEqual({
        token_id: 0,
        bib_no: 1,
        category_id: 0,
        state: "Entered",
        name_fragment: "Budi S.",
        totp_secret: totpSecretHex,
      });
    });

    it("carries the secret the runner's device is actually computing codes from", async () => {
      // The end-to-end property the whole design rests on: the scanner
      // recomputes the same six digits offline, from this bundle alone.
      const { totpSecretHex } = await enrol(runnerKp, 0, 0);
      const fromBundle = (await fetchRoster(scannerKp)).json().entries[0].totp_secret;
      const at = 1_800_000_123;
      expect(codeAt(secretFromHex(fromBundle), at)).toBe(codeAt(secretFromHex(totpSecretHex), at));
    });

    it("contains no name, national id or contact anywhere in the response body", async () => {
      await enrol(runnerKp, 0, 0);
      const raw = (await fetchRoster(scannerKp)).body;
      for (const secret of [PERSON.name, PERSON.nationalId, PERSON.emergencyContact, "Santoso"]) {
        expect(raw).not.toContain(secret);
      }
    });

    it("reduces the name to a fragment that is not the name", async () => {
      await enrol(runnerKp, 0, 0, "Siti Nurhaliza Rahmawati");
      const body = (await fetchRoster(scannerKp)).json();
      expect(body.entries[0].name_fragment).toBe("Siti N. R.");
    });

    it("reports the snapshot ledger, so a stale bundle is visible", async () => {
      await enrol(runnerKp, 0, 0);
      const body = (await fetchRoster(scannerKp)).json();
      expect(body.snapshot_ledger).toBeGreaterThan(0);
      expect(Date.parse(body.generated_at)).not.toBeNaN();
    });

    it("carries the on-chain state, not just the entry", async () => {
      // A scanner reading `RacepackClaimed` locally is what stops the second
      // desk before the transaction gets there.
      await enrol(runnerBKp, 0, 1);
      const body = (await fetchRoster(scannerKp)).json();
      expect(body.entries[0]).toMatchObject({ token_id: 1, state: "RacepackClaimed" });
    });

    it("holds only this event's entries", async () => {
      await enrol(runnerKp, 0, 0);
      await enrol(runnerKp, 1, 2);
      const body = (await fetchRoster(scannerKp)).json();
      expect(body.entries.map((e: { token_id: number }) => e.token_id)).toEqual([0]);
    });

    it("is empty, not an error, before anyone has entered", async () => {
      const body = (await fetchRoster(scannerKp)).json();
      expect(body).toMatchObject({ count: 0, entries: [], missing_from_index: 0 });
    });
  });

  describe("entries the index has not caught up to", () => {
    it("counts them instead of dropping them silently", async () => {
      // A bundle quietly missing runners is a desk turning people away.
      await enrol(runnerKp, 0, 0);
      const submitted = await vault.submit({
        ...PERSON,
        eventId: 0,
        categoryId: 0,
        runnerAddress: runnerBKp.publicKey(),
      });
      await vault.confirm(submitted.participantId, 77, "cd".repeat(32));

      const body = (await fetchRoster(scannerKp)).json();
      expect(body.count).toBe(1);
      expect(body.missing_from_index).toBe(1);
    });

    it("excludes an entry that was submitted but never confirmed on-chain", async () => {
      // No token id means it never entered, and a scanner cannot check in
      // something the chain has never heard of.
      await vault.submit({
        ...PERSON,
        eventId: 0,
        categoryId: 0,
        runnerAddress: runnerKp.publicKey(),
      });
      const body = (await fetchRoster(scannerKp)).json();
      expect(body).toMatchObject({ count: 0, missing_from_index: 0 });
    });
  });

  describe("mounting", () => {
    it("is not mounted without a vault", async () => {
      const noVault = buildServer(loadConfig({ NODE_ENV: "test" }), {
        pool,
        reader: new ChainReader(chain, ADDRESSES),
      });
      await noVault.ready();
      expect((await noVault.inject({ url: "/events/0/roster" })).statusCode).toBe(404);
      expect((await noVault.inject({ url: "/config" })).json().roster).toEqual({ enabled: false });
      await noVault.close();
    });

    it("is not mounted without a chain reader — there would be no way to check the allowlist", async () => {
      const noReader = buildServer(loadConfig({ NODE_ENV: "test" }), { pool, vault });
      await noReader.ready();
      expect((await noReader.inject({ url: "/events/0/roster" })).statusCode).toBe(404);
      await noReader.close();
    });

    it("reports itself in /config", async () => {
      expect((await app.inject({ url: "/config" })).json().roster).toEqual({ enabled: true });
    });
  });
});
