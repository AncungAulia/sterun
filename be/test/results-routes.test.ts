/**
 * STE-20 — the results upload endpoint, end to end against a real Postgres.
 *
 * Two things are being checked here that the pure tests cannot reach: that only
 * the event's organiser can upload, read from the CHAIN rather than from the
 * index; and that the response Fastify actually serialises is the one the
 * schema promises — including the sha256 that makes the published results
 * tamper-evident.
 */
import { Keypair } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChallengeStore } from "../src/auth.js";
import { ChainReader } from "../src/chain/reader.js";
import { loadConfig } from "../src/config.js";
import { Indexer } from "../src/indexer/indexer.js";
import { buildServer } from "../src/server.js";
import { ADDRESSES, keypairFor } from "./helpers/addresses.js";
import { FakeChain } from "./helpers/fake-chain.js";
import { FakeEventSource } from "./helpers/fake-events.js";
import { DATABASE_URL, SKIP_REASON, freshDatabase } from "./helpers/db.js";

const organiserKp = keypairFor("organiser");
const scannerKp = keypairFor("scanner");
const strangerKp = keypairFor("stranger");
const runnerKp = keypairFor("runner-a");

describe.skipIf(!DATABASE_URL)(`results upload (${DATABASE_URL ? "postgres" : SKIP_REASON})`, () => {
  let pool: Pool;
  let close: () => Promise<void>;
  let app: FastifyInstance;

  beforeEach(async () => {
    ({ pool, close } = await freshDatabase());
    const chain = new FakeChain(ADDRESSES);
    const reader = new ChainReader(chain, ADDRESSES);

    chain.addEvent({
      eventId: 0,
      organiser: organiserKp.publicKey(),
      scanners: [scannerKp.publicKey()],
    });
    // Two categories, both numbering bibs from 1 — which is what the contract
    // does, and what makes a bare bib ambiguous.
    chain.addCategory({ eventId: 0, categoryId: 0, distanceM: 10_000 });
    chain.addCategory({ eventId: 0, categoryId: 1, distanceM: 5_000 });
    chain.addRecord({
      tokenId: 0,
      eventId: 0,
      categoryId: 0,
      owner: runnerKp.publicKey(),
      bibNo: 1,
      state: "RacepackClaimed",
    });
    chain.addRecord({
      tokenId: 1,
      eventId: 0,
      categoryId: 0,
      owner: keypairFor("runner-b").publicKey(),
      bibNo: 2,
      state: "Entered",
    });
    chain.addRecord({
      tokenId: 2,
      eventId: 0,
      categoryId: 1,
      owner: keypairFor("stranger").publicKey(),
      bibNo: 1,
      state: "RacepackClaimed",
    });

    await new Indexer(pool, reader, new FakeEventSource([]), ADDRESSES).rebuild();

    app = buildServer(loadConfig({ NODE_ENV: "test" }), {
      pool,
      reader,
      challenges: new ChallengeStore(),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await close();
  });

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

  const upload = async (csv: string, kp = organiserKp, eventId = 0) =>
    app.inject({
      method: "POST",
      url: `/events/${eventId}/results/preview`,
      headers: { ...(await credentials(kp)), "content-type": "text/csv" },
      payload: csv,
    });

  describe("who may upload", () => {
    it("lets the organiser through", async () => {
      const res = await upload("bib_no,category_id,finish_time\n1,0,3161\n");
      expect(res.statusCode).toBe(200);
    });

    it("refuses an allowlisted scanner", async () => {
      // A scanner may check people in; publishing results is the organiser's.
      const res = await upload("bib_no,category_id,finish_time\n1,0,3161\n", scannerKp);
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("forbidden");
    });

    it("refuses a stranger", async () => {
      const res = await upload("bib_no,category_id,finish_time\n1,0,3161\n", strangerKp);
      expect(res.statusCode).toBe(403);
    });

    it("refuses an unsigned request", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/events/0/results/preview",
        headers: { "content-type": "text/csv" },
        payload: "bib_no,finish_time\n1,3161\n",
      });
      expect(res.statusCode).toBe(401);
    });

    it("refuses a replayed nonce", async () => {
      const creds = await credentials(organiserKp);
      const send = () =>
        app.inject({
          method: "POST",
          url: "/events/0/results/preview",
          headers: { ...creds, "content-type": "text/csv" },
          payload: "bib_no,category_id,finish_time\n1,0,3161\n",
        });
      expect((await send()).statusCode).toBe(200);
      expect((await send()).statusCode).toBe(401);
    });

    it("answers a missing event the same way to everyone", async () => {
      // Probing for events you do not organise should reveal nothing that is
      // not already public on-chain.
      const res = await upload("bib_no,finish_time\n1,3161\n", organiserKp, 99);
      expect(res.statusCode).toBe(404);
    });
  });

  describe("the preview", () => {
    it("hashes the exact bytes uploaded", async () => {
      // Tamper evidence: the hash has to identify the organiser's file, so it
      // is taken before parsing and before any normalisation.
      const csv = "bib_no,category_id,finish_time\n1,0,3161\n";
      const res = await upload(csv);
      expect(res.json().source_sha256).toBe(
        createHash("sha256").update(Buffer.from(csv, "utf8")).digest("hex"),
      );
      expect(res.json().source_bytes).toBe(Buffer.byteLength(csv));
    });

    it("returns a different hash for a file differing by one byte", async () => {
      const a = await upload("bib_no,category_id,finish_time\n1,0,3161\n");
      const b = await upload("bib_no,category_id,finish_time\n1,0,3162\n");
      expect(a.json().source_sha256).not.toBe(b.json().source_sha256);
    });

    it("resolves bibs to token ids and lists what is publishable", async () => {
      const res = await upload("bib_no,category_id,finish_time\n1,0,52:41\n2,0,3200\n");
      const body = res.json();
      expect(body.counts).toMatchObject({ total: 2, publishable: 1, not_claimed: 1 });
      expect(body.publishable).toEqual([
        { token_id: 0, finish_time_s: 3161, bib_no: 1, category_id: 0 },
      ]);
    });

    it("flags the ambiguous bib rather than guessing a category", async () => {
      // bib 1 exists in category 0 and category 1. Guessing would publish one
      // runner's time onto the other's record, permanently.
      const res = await upload("bib_no,finish_time\n1,3161\n");
      const row = res.json().rows[0];
      expect(row.anomalies[0].kind).toBe("ambiguous_bib");
      expect(row.anomalies[0].severity).toBe("wrong");
      expect(row.token_id).toBeNull();
      expect(res.json().publishable).toEqual([]);
    });

    it("names the event so the organiser can see they picked the right one", async () => {
      const res = await upload("bib_no,category_id,finish_time\n1,0,3161\n");
      expect(res.json().event_id).toBe(0);
      expect(typeof res.json().event_name).toBe("string");
    });

    it("reports every anomaly kind in the counts, including the zeroes", async () => {
      // A client rendering a summary should not have to guess whether a missing
      // key means zero or means the server is an older version.
      const res = await upload("bib_no,category_id,finish_time\n1,0,3161\n");
      expect(Object.keys(res.json().counts).sort()).toEqual([
        "already_final",
        "ambiguous_bib",
        "duplicate_bib",
        "impossible_time",
        "malformed_row",
        "not_claimed",
        "publishable",
        "total",
        "unknown_bib",
      ]);
    });
  });

  describe("bad input", () => {
    it("rejects an empty body with an instruction", async () => {
      const res = await upload("");
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/--data-binary/);
    });

    it("rejects a file whose header names no bib column", async () => {
      const res = await upload("runner,time\nA,3161\n");
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("malformed-csv");
    });

    it("still returns 200 for a file whose ROWS are bad", async () => {
      // A bad row is a result to show the organiser, not a failed request.
      const res = await upload("bib_no,finish_time\nxx,3161\n");
      expect(res.statusCode).toBe(200);
      expect(res.json().rows[0].anomalies[0].kind).toBe("malformed_row");
    });

    it("rejects a non-integer event id at the schema", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/events/abc/results/preview",
        headers: { ...(await credentials(organiserKp)), "content-type": "text/csv" },
        payload: "bib_no,finish_time\n1,3161\n",
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("the response carries nothing it should not", () => {
    it("has no runner address, no name and no secret anywhere in it", async () => {
      // Fastify serialises strictly from the schema, so this is checking that
      // the schema is right rather than that the handler is careful.
      const res = await upload("bib_no,category_id,finish_time\n1,0,3161\n");
      const body = res.payload;
      expect(body).not.toContain(runnerKp.publicKey());
      for (const forbidden of ["totp_secret", "salt", "national_id", "emergency_contact"]) {
        expect(body).not.toContain(forbidden);
      }
    });
  });
});
