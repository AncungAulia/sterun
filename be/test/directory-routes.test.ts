/**
 * STE-16 — the fast-path read endpoints, against a real Postgres.
 *
 * These are the queries the web app makes instead of a dozen RPC round trips
 * per page, so what matters is that they are honest about being a cache: every
 * row carries `last_ledger`, a miss says "not indexed" rather than "does not
 * exist", and no numeric value that could exceed 2^53 crosses the wire as a
 * JSON number.
 */
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChainReader } from "../src/chain/reader.js";
import { loadConfig } from "../src/config.js";
import { Indexer } from "../src/indexer/indexer.js";
import { buildServer } from "../src/server.js";
import { ADDRESSES, ORGANISER, RUNNER, RUNNER_B, STRANGER } from "./helpers/addresses.js";
import { FakeChain } from "./helpers/fake-chain.js";
import {
  FakeEventSource,
  categoryAdded,
  eventCreated,
  eventStatusChanged,
  mint,
  racepackClaimed,
  recordEntered,
  recordFinished,
  slotReserved,
  toidCursor,
} from "./helpers/fake-events.js";
import { DATABASE_URL, SKIP_REASON, freshDatabase } from "./helpers/db.js";

const registry = { contractId: ADDRESSES.eventRegistry };
const raceRecord = { contractId: ADDRESSES.raceRecord };

describe.skipIf(!DATABASE_URL)(`directory routes (${DATABASE_URL ? "postgres" : SKIP_REASON})`, () => {
  let pool: Pool;
  let close: () => Promise<void>;
  let app: FastifyInstance;
  let chain: FakeChain;

  beforeEach(async () => {
    ({ pool, close } = await freshDatabase());
    chain = new FakeChain(ADDRESSES);
    const reader = new ChainReader(chain, ADDRESSES);

    chain.addEvent({ eventId: 0, organiser: ORGANISER, name: "Jakarta Run", status: "Completed" });
    chain.addCategory({
      eventId: 0,
      categoryId: 0,
      code: "10K",
      distanceM: 10_000,
      quota: 50,
      priceStroops: 50_000_000n,
      enteredCount: 2,
    });
    chain.addRecord({
      tokenId: 0,
      eventId: 0,
      owner: RUNNER,
      bibNo: 1,
      state: "Finished",
      enteredAt: 1_800_000_500n,
      claimedAt: 1_800_000_600n,
      finishTimeS: 3_600,
      resultAt: 1_800_000_700n,
    });
    chain.addRecord({ tokenId: 1, eventId: 0, owner: RUNNER_B, bibNo: 2 });

    const events = [
      eventCreated({ ...registry, ledger: 100 }, 0, ORGANISER),
      categoryAdded({ ...registry, ledger: 100 }, 0, 0, 50, 50_000_000n),
      eventStatusChanged({ ...registry, ledger: 101 }, 0, "Open"),
      slotReserved({ ...registry, ledger: 102 }, 0, 0, 0),
      mint({ ...raceRecord, ledger: 102 }, RUNNER, 0),
      recordEntered({ ...raceRecord, ledger: 102 }, RUNNER, 0, 0, 1),
      slotReserved({ ...registry, ledger: 103 }, 0, 0, 1),
      mint({ ...raceRecord, ledger: 103 }, RUNNER_B, 1),
      recordEntered({ ...raceRecord, ledger: 103 }, RUNNER_B, 0, 1, 2),
      racepackClaimed({ ...raceRecord, ledger: 120 }, 0, 0, ORGANISER),
      recordFinished({ ...raceRecord, ledger: 140 }, 0, 0, 3_600),
    ];
    await new Indexer(pool, reader, new FakeEventSource([events]), ADDRESSES).pollOnce();

    app = buildServer(loadConfig({ NODE_ENV: "test" }), { pool });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await close();
  });

  describe("GET /events", () => {
    it("lists what the index holds", async () => {
      const res = await app.inject({ method: "GET", url: "/events" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        count: 1,
        events: [{ event_id: 0, event_name: "Jakarta Run", status: "Open", organiser: ORGANISER }],
      });
    });

    it("sends starts_at as a string — a u64 is not safe as a JSON number", async () => {
      const [event] = (await app.inject({ method: "GET", url: "/events" })).json().events;
      expect(event.starts_at).toBe("1800000000");
    });

    it("filters by status", async () => {
      expect((await app.inject({ url: "/events?status=Open" })).json().count).toBe(1);
      expect((await app.inject({ url: "/events?status=Draft" })).json().count).toBe(0);
    });

    it("rejects a status that is not one of the four", async () => {
      const res = await app.inject({ url: "/events?status=Cancelled" });
      expect(res.statusCode).toBe(400);
    });

    it("rejects an unknown query parameter instead of ignoring it", async () => {
      // removeAdditional is off (be/CLAUDE.md rule 6): a typo'd filter must not
      // become a request that silently returns everything.
      expect((await app.inject({ url: "/events?stat=Open" })).statusCode).toBe(400);
    });

    it("bounds the page size", async () => {
      expect((await app.inject({ url: "/events?limit=1000" })).statusCode).toBe(400);
      expect((await app.inject({ url: "/events?limit=0" })).statusCode).toBe(400);
      expect((await app.inject({ url: "/events?offset=-1" })).statusCode).toBe(400);
    });
  });

  describe("GET /events/:eventId", () => {
    it("returns the event with its categories", async () => {
      const body = (await app.inject({ url: "/events/0" })).json();
      // 101 is the status change — the last ledger that touched THIS row. The
      // later record events moved records, not the event, and a `last_ledger`
      // that crept forward on unrelated writes would say nothing about
      // freshness.
      expect(body.event).toMatchObject({ event_id: 0, last_ledger: 101 });
      expect(body.categories).toEqual([
        {
          category_id: 0,
          code: "10K",
          distance_m: 10_000,
          quota: 50,
          // A price is money: string on the wire, always.
          price_stroops: "50000000",
          entered_count: 2,
        },
      ]);
    });

    it("says NOT INDEXED rather than NOT FOUND", async () => {
      // The cache cannot know whether the chain has this event, and answering
      // "does not exist" would be a claim it is not entitled to make.
      const res = await app.inject({ url: "/events/99" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: "not_indexed" });
      expect(res.json().message).toMatch(/may exist on-chain/);
    });

    it("rejects a non-numeric event id", async () => {
      expect((await app.inject({ url: "/events/abc" })).statusCode).toBe(400);
    });
  });

  describe("GET /events/:eventId/records", () => {
    it("lists the event's records in bib order", async () => {
      const body = (await app.inject({ url: "/events/0/records" })).json();
      expect(body.count).toBe(2);
      expect(body.records.map((r: { bib_no: number }) => r.bib_no)).toEqual([1, 2]);
    });

    it("pages", async () => {
      const page = (await app.inject({ url: "/events/0/records?limit=1&offset=1" })).json();
      expect(page.records).toHaveLength(1);
      expect(page.records[0].bib_no).toBe(2);
    });

    it("returns an empty list for an event with no records", async () => {
      const body = (await app.inject({ url: "/events/99/records" })).json();
      expect(body).toEqual({ records: [], count: 0 });
    });
  });

  describe("GET /records/:tokenId", () => {
    it("returns the record with its lifecycle history", async () => {
      const body = (await app.inject({ url: "/records/0" })).json();
      expect(body.record).toMatchObject({
        token_id: 0,
        bib_no: 1,
        state: "Finished",
        finish_time_s: 3_600,
        runner_address: RUNNER,
        // Public on-chain: a commitment identifies nobody without the salt.
        participant_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(body.record.entered_at).toBe("1800000500");
      expect(body.transitions.map((t: { to_state: string }) => t.to_state)).toEqual([
        "Entered",
        "RacepackClaimed",
        "Finished",
      ]);
      expect(body.transitions[0].tx_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("keeps nulls as nulls rather than dropping the field", async () => {
      const body = (await app.inject({ url: "/records/1" })).json();
      expect(body.record.claimed_at).toBeNull();
      expect(body.record.finish_time_s).toBeNull();
      expect(body.record.result_at).toBeNull();
    });

    it("says not_indexed for a token the index does not have", async () => {
      expect((await app.inject({ url: "/records/42" })).statusCode).toBe(404);
    });
  });

  describe("GET /runners/:address/records", () => {
    it("returns one runner's history", async () => {
      const body = (await app.inject({ url: `/runners/${RUNNER}/records` })).json();
      expect(body.count).toBe(1);
      expect(body.records[0]).toMatchObject({ token_id: 0, runner_address: RUNNER });
    });

    it("returns an empty history for an address with none", async () => {
      const body = (await app.inject({ url: `/runners/${STRANGER}/records` })).json();
      expect(body).toEqual({ records: [], count: 0 });
    });

    it("rejects an address that is not a Stellar account", async () => {
      expect((await app.inject({ url: "/runners/not-an-address/records" })).statusCode).toBe(400);
      // A contract address is a valid strkey and still not a runner.
      expect(
        (await app.inject({ url: `/runners/${ADDRESSES.raceRecord}/records` })).statusCode,
      ).toBe(400);
    });
  });

  describe("GET /indexer/status", () => {
    it("reports the cursor and the row counts", async () => {
      const body = (await app.inject({ url: "/indexer/status" })).json();
      expect(body).toMatchObject({
        stream: "contracts",
        cursor: toidCursor(1_000),
        // 1000, not 140: RPC served everything through its latest ledger and
        // there was simply nothing after the last event. `last_ledger` is how
        // far the index has READ, not when it last found something.
        last_ledger: 1_000,
        counts: { events: 1, categories: 1, records: 2, record_transitions: 4 },
      });
    });

    it("answers on an empty index instead of 404-ing", async () => {
      // The endpoint people hit when nothing is showing up. It has to work
      // precisely when there is nothing to show.
      await pool.query("TRUNCATE records, events, chain_events, indexer_cursor CASCADE");
      const body = (await app.inject({ url: "/indexer/status" })).json();
      expect(body).toMatchObject({ cursor: null, last_ledger: 0, counts: { records: 0 } });
    });

    it("does not touch the network", async () => {
      // A status page that calls RPC reports someone else's outage as ours.
      // FakeChain records every call it is asked to make.
      const before = chain.calls.length;
      await app.inject({ url: "/indexer/status" });
      expect(chain.calls.length).toBe(before);
    });
  });

  describe("mounting", () => {
    it("does not mount the read endpoints without a pool", async () => {
      const bare = buildServer(loadConfig({ NODE_ENV: "test" }), {});
      await bare.ready();
      expect((await bare.inject({ url: "/events" })).statusCode).toBe(404);
      expect((await bare.inject({ url: "/config" })).json().indexer).toEqual({ enabled: false });
      await bare.close();
    });

    it("reports itself in /config", async () => {
      expect((await app.inject({ url: "/config" })).json().indexer).toEqual({ enabled: true });
    });
  });
});
