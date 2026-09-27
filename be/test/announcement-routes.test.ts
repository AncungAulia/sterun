/**
 * STE-40 — publishing and reading signed announcements, against Postgres and a
 * fake chain.
 *
 * Most of this file is refusals, because the whole value of an announcement is
 * that it cannot be forged, back-dated, edited or removed. The positive path
 * checks the property the design exists for: what the API returns is enough to
 * re-verify an announcement without trusting the API.
 */
import { Keypair } from "@stellar/stellar-sdk";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { announcementMessage, verifyAnnouncementSignature } from "../src/announcements.js";
import { ChallengeStore } from "../src/auth.js";
import { ChainReader } from "../src/chain/reader.js";
import { loadConfig } from "../src/config.js";
import * as store from "../src/indexer/store.js";
import { buildServer } from "../src/server.js";
import { ADDRESSES } from "./helpers/addresses.js";
import { FakeChain } from "./helpers/fake-chain.js";
import { DATABASE_URL, SKIP_REASON, freshDatabase } from "./helpers/db.js";

const organiser = Keypair.random();
const stranger = Keypair.random();

describe.skipIf(!DATABASE_URL)(`event announcements (${DATABASE_URL ? "postgres" : SKIP_REASON})`, () => {
  const config = loadConfig({ NODE_ENV: "test" });
  let pool: Pool;
  let close: () => Promise<void>;
  let app: FastifyInstance;
  let chain: FakeChain;

  beforeEach(async () => {
    ({ pool, close } = await freshDatabase());
    chain = new FakeChain(ADDRESSES);
    chain.addEvent({ eventId: 0, organiser: organiser.publicKey() });
    app = buildServer(config, {
      pool,
      reader: new ChainReader(chain, ADDRESSES),
      challenges: new ChallengeStore(),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await close();
  });

  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

  /** What an organiser's wallet (SEP-53) or a script (raw ed25519) sends. */
  function signed(
    kp: Keypair,
    body: string,
    opts: {
      eventId?: number;
      publishedAt?: string;
      scheme?: "sep53" | "ed25519";
      eventRegistry?: string;
      signedBody?: string;
    } = {},
  ) {
    const publishedAt = opts.publishedAt ?? new Date().toISOString();
    const message = announcementMessage({
      networkPassphrase: config.network.passphrase,
      eventRegistry: opts.eventRegistry ?? config.addresses.eventRegistry,
      eventId: opts.eventId ?? 0,
      publishedAt,
      body: opts.signedBody ?? body,
    });
    const signature =
      opts.scheme === "ed25519"
        ? Buffer.from(kp.sign(Buffer.from(message, "utf8"))).toString("base64")
        : Buffer.from(kp.signMessage(message)).toString("base64");
    return { published_at: publishedAt, body, signer: kp.publicKey(), signature };
  }

  const publish = (payload: Record<string, unknown>, eventId = 0) =>
    app.inject({ method: "POST", url: `/events/${eventId}/announcements`, payload });
  const list = (eventId = 0) => app.inject({ method: "GET", url: `/events/${eventId}/announcements` });
  const stored = async () =>
    Number((await pool.query<{ n: string }>("SELECT count(*) AS n FROM event_announcements")).rows[0]?.n);

  describe("publishing", () => {
    it("accepts the organiser's wallet signature (SEP-53) and returns what it signed", async () => {
      const payload = signed(organiser, "Start moved to Lapangan Banteng. Schedule unchanged.");

      const res = await publish(payload);

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({
        event_id: 0,
        published_at: payload.published_at,
        body: payload.body,
        signer: organiser.publicKey(),
        signature: payload.signature,
        scheme: "sep53",
        network_passphrase: config.network.passphrase,
        event_registry: config.addresses.eventRegistry,
      });
      expect(body.message).toBe(
        announcementMessage({
          networkPassphrase: config.network.passphrase,
          eventRegistry: config.addresses.eventRegistry,
          eventId: 0,
          publishedAt: payload.published_at,
          body: payload.body,
        }),
      );
    });

    it("accepts a script's raw ed25519 signature too", async () => {
      const res = await publish(signed(organiser, "Race pack pickup opens at 08:00.", { scheme: "ed25519" }));
      expect(res.statusCode).toBe(201);
      expect(res.json().scheme).toBe("ed25519");
    });

    it("keeps text exactly as signed: Indonesian, line breaks, punctuation", async () => {
      const text = "Karena izin venue, start dipindah.\nJadwal tetap — sampai jumpa!";
      const res = await publish(signed(organiser, text));
      expect(res.statusCode).toBe(201);
      expect((await list()).json().announcements[0].body).toBe(text);
    });

    it("treats the same signed announcement sent twice as one announcement", async () => {
      const payload = signed(organiser, "Parking at gate 3.");
      const first = await publish(payload);
      const again = await publish(payload);

      expect(first.statusCode).toBe(201);
      expect(again.statusCode).toBe(200);
      expect(again.json().id).toBe(first.json().id);
      expect(await stored()).toBe(1);
    });
  });

  describe("refusing", () => {
    it("403s a correctly signed announcement from a wallet that is not the organiser", async () => {
      const res = await publish(signed(stranger, "The race is cancelled."));
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("forbidden");
      expect(await stored()).toBe(0);
    });

    it("401s a signature over different text, so nobody can swap the body", async () => {
      const res = await publish(signed(organiser, "The race is cancelled.", { signedBody: "Parking at gate 3." }));
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("bad-signature");
      expect(await stored()).toBe(0);
    });

    it("401s a signature made for another registry, so it cannot be replayed across deployments", async () => {
      const res = await publish(
        signed(organiser, "Parking at gate 3.", {
          eventRegistry: "CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW",
        }),
      );
      expect(res.statusCode).toBe(401);
    });

    it("401s a signature made for another event of the same organiser", async () => {
      chain.addEvent({ eventId: 1, organiser: organiser.publicKey() });
      const res = await publish(signed(organiser, "Parking at gate 3.", { eventId: 1 }), 0);
      expect(res.statusCode).toBe(401);
    });

    it.each([
      ["eleven minutes ago", () => minutesAgo(11)],
      ["eleven minutes ahead", () => minutesAgo(-11)],
    ])("400s an announcement dated %s, so nothing can be back-dated", async (_when, at) => {
      const res = await publish(signed(organiser, "Parking at gate 3.", { publishedAt: at() }));
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("stale-announcement");
      expect(await stored()).toBe(0);
    });

    it("accepts one signed nine minutes ago", async () => {
      const res = await publish(signed(organiser, "Parking at gate 3.", { publishedAt: minutesAgo(9) }));
      expect(res.statusCode).toBe(201);
    });

    it.each([
      ["a time without milliseconds", "2026-09-16T00:00:00Z", "invalid-request"],
      ["a local offset", "2026-09-16T07:00:00.000+07:00", "invalid-request"],
      ["a date that does not exist", "2026-02-30T00:00:00.000Z", "invalid-published-at"],
    ])("400s %s: exactly one spelling of a time is signed", async (_what, publishedAt, code) => {
      const res = await publish({ ...signed(organiser, "x"), published_at: publishedAt });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe(code);
    });

    it.each([
      ["only whitespace", "   \n\t "],
      ["a control character", "Start moved\u0007 to the north gate."],
    ])("400s a body that is %s", async (_what, text) => {
      const res = await publish(signed(organiser, text));
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("invalid-announcement");
    });

    it("400s a body longer than 2000 characters", async () => {
      const res = await publish(signed(organiser, "a".repeat(2001)));
      expect(res.statusCode).toBe(400);
    });

    it("401s a signature that is not 64 bytes, naming the problem", async () => {
      const res = await publish({ ...signed(organiser, "x"), signature: Buffer.alloc(63).toString("base64") });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("malformed-signature");
    });

    it("404s an event the chain does not know", async () => {
      const res = await publish(signed(organiser, "Parking at gate 3.", { eventId: 9 }), 9);
      expect(res.statusCode).toBe(404);
    });
  });

  describe("reading", () => {
    it("lists an event's announcements newest first, without credentials", async () => {
      await publish(signed(organiser, "older", { publishedAt: minutesAgo(5) }));
      await publish(signed(organiser, "newer", { publishedAt: minutesAgo(1) }));

      const res = await list();

      expect(res.statusCode).toBe(200);
      expect(res.json().count).toBe(2);
      expect(res.json().announcements.map((a: { body: string }) => a.body)).toEqual(["newer", "older"]);
    });

    it("returns enough to re-verify every announcement without trusting the API", async () => {
      await publish(signed(organiser, "Start moved to Lapangan Banteng."));
      await publish(signed(organiser, "Race pack pickup opens at 08:00.", { scheme: "ed25519" }));

      const onChainOrganiser = await new ChainReader(chain, ADDRESSES).getOrganiser(0);
      for (const a of (await list()).json().announcements) {
        const rebuilt = announcementMessage({
          networkPassphrase: a.network_passphrase,
          eventRegistry: a.event_registry,
          eventId: a.event_id,
          publishedAt: a.published_at,
          body: a.body,
        });
        expect(rebuilt).toBe(a.message);
        expect(verifyAnnouncementSignature(rebuilt, a.signer, Buffer.from(a.signature, "base64"))).toBe(a.scheme);
        expect(a.signer).toBe(onChainOrganiser);
      }
    });

    it("answers an empty list for an event with none", async () => {
      expect((await list(5)).json()).toEqual({ event_id: 5, announcements: [], count: 0 });
    });

    it("never mixes events", async () => {
      chain.addEvent({ eventId: 1, organiser: organiser.publicKey() });
      await publish(signed(organiser, "for event 1", { eventId: 1 }), 1);
      expect((await list(0)).json().count).toBe(0);
      expect((await list(1)).json().count).toBe(1);
    });
  });

  describe("append-only, enforced by the database", () => {
    beforeEach(async () => {
      expect((await publish(signed(organiser, "Parking at gate 3."))).statusCode).toBe(201);
    });

    it.each([
      ["UPDATE", "UPDATE event_announcements SET body = 'rewritten'"],
      ["DELETE", "DELETE FROM event_announcements"],
      ["TRUNCATE", "TRUNCATE event_announcements"],
    ])("refuses %s", async (_what, sql) => {
      await expect(pool.query(sql)).rejects.toThrow(/append-only/);
      expect(await stored()).toBe(1);
    });

    it("survives an index rebuild, which truncates the tables that can be rebuilt", async () => {
      await store.clearMaterialisedTables(pool);
      expect(await stored()).toBe(1);
    });
  });
});
