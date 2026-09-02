/**
 * STE-16 — the indexer, end to end against a real Postgres and a fake chain.
 *
 * Two claims are checked here, and they are the two the ticket makes:
 *
 *   **Following works.** A full event lifecycle — create, categorise, open,
 *   allowlist, reserve, enter, claim, finish, DNF — lands as rows with the
 *   right values and the right provenance, and replaying the same page changes
 *   nothing.
 *
 *   **The index is a cache and can be rebuilt.** `TRUNCATE` everything, replay
 *   from contract STATE alone, and `doctor` agrees with the chain again. That
 *   is the scenario check in the ticket ("drop tabel -> rebuild -> data
 *   kembali") and the reason the design does not depend on RPC event retention.
 *
 * Everything below the seam is real: real SQL, real constraints, real
 * decoders. The only fake is the network.
 */
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChainReader } from "../src/chain/reader.js";
import { Indexer, IndexerConsistencyError, reconstructTransitions } from "../src/indexer/indexer.js";
import * as store from "../src/indexer/store.js";
import { FakeChain } from "./helpers/fake-chain.js";
import {
  FakeEventSource,
  categoryAdded,
  eventCreated,
  eventStatusChanged,
  mint,
  racepackClaimed,
  recordDnf,
  recordEntered,
  recordFinished,
  scannerAdded,
  scannerRemoved,
  slotReserved,
  toidCursor,
} from "./helpers/fake-events.js";
import { DATABASE_URL, SKIP_REASON, freshDatabase } from "./helpers/db.js";

import {
  ADDRESSES,
  ORGANISER,
  RUNNER,
  RUNNER_B,
  SCANNER,
  SUSD_SAC as SAC,
} from "./helpers/addresses.js";

const registry = { contractId: ADDRESSES.eventRegistry };
const raceRecord = { contractId: ADDRESSES.raceRecord };

describe.skipIf(!DATABASE_URL)(`indexer (${DATABASE_URL ? "postgres" : SKIP_REASON})`, () => {
  let pool: Pool;
  let close: () => Promise<void>;
  let chain: FakeChain;
  let reader: ChainReader;
  const warnings: string[] = [];

  beforeEach(async () => {
    ({ pool, close } = await freshDatabase());
    chain = new FakeChain(ADDRESSES);
    reader = new ChainReader(chain, ADDRESSES);
    warnings.length = 0;
  });

  afterEach(async () => {
    await close();
  });

  const build = (source: FakeEventSource): Indexer =>
    new Indexer(pool, reader, source, ADDRESSES, {
      log: (level, message) => {
        if (level === "warn") warnings.push(message);
      },
    });

  /**
   * A full event with one paid category, two entries, one finished and one DNF.
   * The chain state and the event stream are built together so they agree — the
   * indexer cross-checks them, and a fixture where they disagree would be
   * testing the cross-check rather than the flow.
   */
  function seedFullRace(): { events: ReturnType<typeof eventCreated>[] } {
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
    chain.addRecord({
      tokenId: 1,
      eventId: 0,
      owner: RUNNER_B,
      bibNo: 2,
      state: "Dnf",
      enteredAt: 1_800_000_505n,
      resultAt: 1_800_000_800n,
    });

    return {
      events: [
        eventCreated({ ...registry, ledger: 100 }, 0, ORGANISER),
        categoryAdded({ ...registry, ledger: 100 }, 0, 0, 50, 50_000_000n),
        eventStatusChanged({ ...registry, ledger: 101 }, 0, "Open"),
        scannerAdded({ ...registry, ledger: 101 }, 0, SCANNER),
        slotReserved({ ...registry, ledger: 102 }, 0, 0, 0),
        mint({ ...raceRecord, ledger: 102 }, RUNNER, 0),
        recordEntered({ ...raceRecord, ledger: 102 }, RUNNER, 0, 0, 1),
        slotReserved({ ...registry, ledger: 103 }, 0, 0, 1),
        mint({ ...raceRecord, ledger: 103 }, RUNNER_B, 1),
        recordEntered({ ...raceRecord, ledger: 103 }, RUNNER_B, 0, 1, 2),
        racepackClaimed({ ...raceRecord, ledger: 120 }, 0, 0, SCANNER),
        recordFinished({ ...raceRecord, ledger: 140 }, 0, 0, 3_600),
        recordDnf({ ...raceRecord, ledger: 141 }, 1, 0),
      ],
    };
  }

  describe("following the event stream", () => {
    it("materialises a whole race from create to result", async () => {
      const { events } = seedFullRace();
      const source = new FakeEventSource([events]);
      const result = await build(source).pollOnce();

      expect(result.applied).toBe(events.length);
      expect(result.orphans).toBe(0);
      expect(result.ignored).toBe(0);

      const event = await store.getEvent(pool, 0);
      expect(event).toMatchObject({
        eventId: 0,
        organiser: ORGANISER,
        name: "Jakarta Run",
        // Open, from the status event — NOT Completed, which is what the
        // contract says today and what a naive hydration would have written.
        status: "Open",
        source: "event",
      });

      const [category] = await store.listCategories(pool, 0);
      expect(category).toMatchObject({
        code: "10K",
        distanceM: 10_000,
        quota: 50,
        priceStroops: 50_000_000n,
        // Two slot_reserved events, seq 0 and 1 -> two entries.
        enteredCount: 2,
      });

      const finished = await store.getRecord(pool, 0);
      expect(finished).toMatchObject({
        tokenId: 0,
        eventId: 0,
        bibNo: 1,
        runnerAddress: RUNNER,
        state: "Finished",
        finishTimeS: 3_600,
        source: "event",
      });
      // Ledger 120 closed at 1_800_000_000 + 120*5 = 1_800_000_600.
      expect(finished?.claimedAt).toBe(1_800_000_600n);
      expect(finished?.resultAt).toBe(1_800_000_700n);

      const dnf = await store.getRecord(pool, 1);
      expect(dnf).toMatchObject({ state: "Dnf", runnerAddress: RUNNER_B, finishTimeS: null });
      // A no-show never claimed a pack, so claimed_at stays null.
      expect(dnf?.claimedAt).toBeNull();
    });

    it("records one transition per state reached, with ledger and transaction", async () => {
      const { events } = seedFullRace();
      await build(new FakeEventSource([events])).pollOnce();

      const transitions = await store.listTransitions(pool, 0);
      expect(transitions.map((t) => [t.fromState, t.toState])).toEqual([
        [null, "Entered"],
        ["Entered", "RacepackClaimed"],
        ["RacepackClaimed", "Finished"],
      ]);
      for (const transition of transitions) {
        expect(transition.source).toBe("event");
        expect(transition.ledger).not.toBeNull();
        expect(transition.txHash).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it("records the two-step history of a DNF that never claimed a pack", async () => {
      const { events } = seedFullRace();
      await build(new FakeEventSource([events])).pollOnce();
      expect((await store.listTransitions(pool, 1)).map((t) => t.toState)).toEqual([
        "Entered",
        "Dnf",
      ]);
    });

    it("mirrors the scanner allowlist, and marks a removal rather than deleting it", async () => {
      const { events } = seedFullRace();
      const source = new FakeEventSource([events]);
      const indexer = build(source);
      await indexer.pollOnce();

      source.push([scannerRemoved({ ...registry, ledger: 200 }, 0, SCANNER)]);
      await indexer.pollOnce();

      const { rows } = await pool.query<{ scanner_address: string; removed_ledger: number | null }>(
        "SELECT scanner_address, removed_ledger FROM event_scanners WHERE event_id = 0",
      );
      // Kept with a removal ledger: "was allowed until 200" is a different
      // fact from "was never allowed", and the second one loses history.
      expect(rows).toEqual([{ scanner_address: SCANNER, removed_ledger: 200 }]);
    });

    it("keeps every event in the raw log, including the ones that materialise nothing", async () => {
      const { events } = seedFullRace();
      await build(new FakeEventSource([events])).pollOnce();
      const { rows } = await pool.query<{ name: string; n: string }>(
        "SELECT name, count(*)::text AS n FROM chain_events GROUP BY name ORDER BY name",
      );
      const byName = Object.fromEntries(rows.map((r) => [r.name, Number(r.n)]));
      // `mint` materialises nothing — record_entered carries the same facts —
      // but it is still evidence, and INTERFACE.md §2.3 freezes it.
      expect(byName.mint).toBe(2);
      expect(byName.record_entered).toBe(2);
      expect(byName.slot_reserved).toBe(2);
    });
  });

  describe("pagination and replay", () => {
    it("starts from the RPC retention floor and then follows the cursor", async () => {
      const source = new FakeEventSource([[], []]);
      source.oldestLedger = 55;
      const indexer = build(source);

      await indexer.pollOnce();
      expect(source.requests[0]).toEqual({ startLedger: 55, limit: 200 });

      await indexer.pollOnce();
      // The second poll continues where the first left off rather than
      // re-reading the same window.
      expect(source.requests[1]).toEqual({ cursor: toidCursor(1_000), limit: 200 });
    });

    it("never asks for a ledger older than RPC retains", async () => {
      const source = new FakeEventSource([[]]);
      source.oldestLedger = 900;
      await new Indexer(pool, reader, source, ADDRESSES, { startLedger: 1 }).pollOnce();
      // startLedger 1 would be an error from RPC, not an empty page.
      expect(source.requests[0]).toEqual({ startLedger: 900, limit: 200 });
    });

    it("takes its progress from the cursor, not from the latest ledger", async () => {
      // RPC scans a bounded window per request and answers with an empty page
      // and a cursor when nothing in that window matched. Reporting
      // latestLedger here would claim the index was current while it was still
      // a dozen requests behind — which is what it did until a run against live
      // testnet showed the gap.
      const source = new FakeEventSource([[]]);
      source.latestLedger = 4_469_746;
      source.cursorLedger = 4_358_786;
      const result = await build(source).pollOnce();
      expect(result.lastLedger).toBe(4_358_786);
      expect(result.latestLedger).toBe(4_469_746);
    });

    it("reports caught up once the cursor reaches the latest ledger", async () => {
      const source = new FakeEventSource([[]]);
      source.latestLedger = 4_321;
      const result = await build(source).pollOnce();
      expect(result.lastLedger).toBe(4_321);
    });

    it("never reports progress past the ledger RPC says is latest", async () => {
      const source = new FakeEventSource([[]]);
      source.latestLedger = 100;
      source.cursorLedger = 999_999;
      expect((await build(source).pollOnce()).lastLedger).toBe(100);
    });

    it("applies a replayed page exactly once", async () => {
      const { events } = seedFullRace();
      const source = new FakeEventSource([events]);
      const indexer = build(source);

      const first = await indexer.pollOnce();
      source.replayLast();
      const second = await indexer.pollOnce();

      expect(first.applied).toBe(events.length);
      // Recognised by RPC event id and skipped: this is what makes
      // "save the cursor only after committing" free rather than expensive.
      expect(second.applied).toBe(0);
      expect(second.duplicates).toBe(events.length);

      // And nothing doubled up.
      expect(await store.listTransitions(pool, 0)).toHaveLength(3);
      expect((await store.counts(pool)).records).toBe(2);
      const [category] = await store.listCategories(pool, 0);
      expect(category?.enteredCount).toBe(2);
    });

    it("does not move the cursor when a page fails", async () => {
      // A record_entered whose bib disagrees with the contract: the page throws
      // and the transaction rolls back, so the next poll retries the same page
      // instead of stepping over it.
      chain.addEvent({ eventId: 0, organiser: ORGANISER });
      chain.addRecord({ tokenId: 0, eventId: 0, owner: RUNNER, bibNo: 9 });
      const page = [
        eventCreated({ ...registry, ledger: 100 }, 0, ORGANISER),
        recordEntered({ ...raceRecord, ledger: 101 }, RUNNER, 0, 0, 1),
      ];
      const indexer = build(new FakeEventSource([page]));

      await expect(indexer.pollOnce()).rejects.toBeInstanceOf(IndexerConsistencyError);
      expect(await store.getCursor(pool)).toBeNull();
      // The event row from earlier in the same page is gone too — one page,
      // one transaction.
      expect(await store.getEvent(pool, 0)).toBeNull();
      expect((await store.counts(pool)).chain_events).toBe(0);
    });

    it("refuses a record_entered whose event_id disagrees with the contract", async () => {
      chain.addEvent({ eventId: 0, organiser: ORGANISER });
      chain.addRecord({ tokenId: 0, eventId: 7, owner: RUNNER, bibNo: 1 });
      const page = [
        eventCreated({ ...registry, ledger: 100 }, 0, ORGANISER),
        recordEntered({ ...raceRecord, ledger: 101 }, RUNNER, 0, 0, 1),
      ];
      await expect(build(new FakeEventSource([page])).pollOnce()).rejects.toThrow(
        /record 0: event says event_id=0/,
      );
    });

    it("refuses a category_added whose quota disagrees with the contract", async () => {
      chain.addEvent({ eventId: 0, organiser: ORGANISER });
      chain.addCategory({ eventId: 0, categoryId: 0, quota: 100, priceStroops: 50_000_000n });
      const page = [
        eventCreated({ ...registry, ledger: 100 }, 0, ORGANISER),
        categoryAdded({ ...registry, ledger: 100 }, 0, 0, 50, 50_000_000n),
      ];
      await expect(build(new FakeEventSource([page])).pollOnce()).rejects.toThrow(/quota=50/);
    });
  });

  describe("events that are not ours", () => {
    it("ignores another contract's events without counting them as applied", async () => {
      chain.addEvent({ eventId: 0, organiser: ORGANISER });
      const page = [
        eventCreated({ ...registry, ledger: 100 }, 0, ORGANISER),
        // The SAC's transfer rides along in the same transaction as `enter`.
        recordEntered({ contractId: SAC, ledger: 100 }, RUNNER, 0, 99, 1),
      ];
      const result = await build(new FakeEventSource([page])).pollOnce();
      expect(result.applied).toBe(1);
      expect(result.ignored).toBe(1);
      expect(await store.getRecord(pool, 99)).toBeNull();
    });
  });

  describe("gaps — an index that started late", () => {
    it("counts a lifecycle event for an unknown record as an orphan, not a crash", async () => {
      const page = [racepackClaimed({ ...raceRecord, ledger: 120 }, 42, 0, SCANNER)];
      const result = await build(new FakeEventSource([page])).pollOnce();

      expect(result.orphans).toBe(1);
      expect(result.applied).toBe(1);
      expect(warnings).toContain("lifecycle event for a record that is not indexed");
      // The cursor still moved: refusing to advance would wedge the poller on a
      // gap that only `rebuild` can close.
      expect((await store.getCursor(pool))?.cursor).toBe(toidCursor(1_000));
    });

    it("counts a category for an unknown event as an orphan instead of failing its foreign key", async () => {
      chain.addEvent({ eventId: 0, organiser: ORGANISER });
      chain.addCategory({ eventId: 0, categoryId: 0 });
      const result = await build(
        new FakeEventSource([[categoryAdded({ ...registry, ledger: 100 }, 0, 0, 100, 50_000_000n)]]),
      ).pollOnce();
      expect(result.orphans).toBe(1);
      expect(await store.listCategories(pool, 0)).toEqual([]);
    });

    it("counts a status change for an unknown event as an orphan", async () => {
      const result = await build(
        new FakeEventSource([[eventStatusChanged({ ...registry, ledger: 100 }, 3, "Open")]]),
      ).pollOnce();
      expect(result.orphans).toBe(1);
      expect(warnings).toContain("status change for an event that is not indexed");
    });

    it("counts a slot_reserved for an unknown category as an orphan", async () => {
      const result = await build(
        new FakeEventSource([[slotReserved({ ...registry, ledger: 100 }, 0, 0, 0)]]),
      ).pollOnce();
      expect(result.orphans).toBe(1);
    });
  });

  describe("rebuild from contract state", () => {
    it("reconstructs everything from state alone, with no events at all", async () => {
      seedFullRace();
      const source = new FakeEventSource([]);
      source.latestLedger = 5_000;

      const result = await build(source).rebuild();
      expect(result).toMatchObject({ events: 1, categories: 1, records: 2, fromLedger: 5_000 });

      const event = await store.getEvent(pool, 0);
      // From state, this IS the current status — there is no event stream to
      // say otherwise, and the chain is the authority.
      expect(event).toMatchObject({ status: "Completed", source: "state" });
      expect(await store.getRecord(pool, 0)).toMatchObject({
        state: "Finished",
        runnerAddress: RUNNER,
        source: "state",
      });
    });

    it("reconstructs a transition history from the contract's own timestamps", async () => {
      seedFullRace();
      await build(new FakeEventSource([])).rebuild();

      const transitions = await store.listTransitions(pool, 0);
      expect(transitions.map((t) => [t.toState, t.occurredAt])).toEqual([
        ["Entered", 1_800_000_500n],
        ["RacepackClaimed", 1_800_000_600n],
        ["Finished", 1_800_000_700n],
      ]);
      // True, but with no provenance: state says WHEN, never in which
      // transaction. Saying so is better than inventing a ledger number.
      for (const transition of transitions) {
        expect(transition.source).toBe("state");
        expect(transition.ledger).toBeNull();
        expect(transition.txHash).toBeNull();
      }
    });

    it("drop -> rebuild -> the index matches the chain again", async () => {
      // The ticket's scenario check, in one test.
      const { events } = seedFullRace();
      const source = new FakeEventSource([events]);
      const indexer = build(source);
      await indexer.pollOnce();
      const before = await store.counts(pool);

      await pool.query("TRUNCATE records, events RESTART IDENTITY CASCADE");
      expect((await store.counts(pool)).records).toBe(0);

      await indexer.rebuild();

      const after = await store.counts(pool);
      expect(after.events).toBe(before.events);
      expect(after.categories).toBe(before.categories);
      expect(after.records).toBe(before.records);
      expect(after.record_transitions).toBe(before.record_transitions);
      expect((await indexer.doctor()).ok).toBe(true);
    });

    it("keeps the raw event log through a rebuild", async () => {
      // chain_events is the only local evidence of what the chain said at the
      // time, and RPC will not hand it back after its retention window.
      const { events } = seedFullRace();
      const indexer = build(new FakeEventSource([events]));
      await indexer.pollOnce();
      await indexer.rebuild();
      expect((await store.counts(pool)).chain_events).toBe(events.length);
    });

    it("clears the cursor and resumes from where the walk started", async () => {
      seedFullRace();
      const source = new FakeEventSource([[], []]);
      source.latestLedger = 7_000;
      const indexer = build(source);

      await indexer.rebuild();
      const cursor = await store.getCursor(pool);
      expect(cursor).toMatchObject({ cursor: null, lastLedger: 7_000 });

      await indexer.pollOnce();
      // Resumes at the ledger AFTER the one the walk started from. Reading the
      // ledger first and resuming there means a change that landed mid-walk is
      // replayed, which is idempotent — missing it would not be.
      expect(source.requests[0]).toEqual({ startLedger: 7_001, limit: 200 });
    });

    it("is atomic — a walk that fails leaves the previous index in place", async () => {
      const { events } = seedFullRace();
      const indexer = build(new FakeEventSource([events]));
      await indexer.pollOnce();

      // Break the chain between the count and the read: total_supply says 2,
      // record 1 is gone.
      chain.records.delete(1);
      const brokenSupply = new ChainReader(
        {
          simulate: async (contractId, method, args) => {
            if (method === "total_supply") return { value: 2, readOnlyKeys: [], latestLedger: 1 };
            return chain.simulate(contractId, method, args);
          },
        },
        ADDRESSES,
      );
      const broken = new Indexer(pool, brokenSupply, new FakeEventSource([]), ADDRESSES);

      await expect(broken.rebuild()).rejects.toThrow();
      // Still whole: the truncate and the reinsert are one transaction, and the
      // reads happen before it opens.
      expect((await store.counts(pool)).records).toBe(2);
      expect(await store.getRecord(pool, 1)).not.toBeNull();
    });
  });

  describe("doctor", () => {
    it("agrees with the chain after a clean follow", async () => {
      const { events } = seedFullRace();
      const indexer = build(new FakeEventSource([events]));
      await indexer.pollOnce();

      // The follow wrote Open (from the status event) while the fake chain's
      // current status is Completed, which doctor correctly reports as a
      // difference — bring them in line first so the rest is meaningful.
      chain.events.get(0)!.status = "Open";
      expect(await indexer.doctor()).toMatchObject({ ok: true, findings: [] });
    });

    it("reports a record whose state has drifted from the chain", async () => {
      seedFullRace();
      const indexer = build(new FakeEventSource([]));
      await indexer.rebuild();

      await pool.query("UPDATE records SET state = 'Entered' WHERE token_id = 0");
      const report = await indexer.doctor();
      expect(report.ok).toBe(false);
      expect(report.findings).toContainEqual({
        kind: "record-differs",
        detail: "record 0: state Entered != Finished",
      });
    });

    it("reports a record the chain has and the index does not", async () => {
      seedFullRace();
      const indexer = build(new FakeEventSource([]));
      await indexer.rebuild();

      await pool.query("DELETE FROM records WHERE token_id = 1");
      const report = await indexer.doctor();
      expect(report.findings).toContainEqual({
        kind: "record-count-mismatch",
        detail: "chain has 2 records, index has 1",
      });
      expect(report.findings).toContainEqual({
        kind: "record-missing",
        detail: "record 1 is not indexed",
      });
    });

    it("reports an event whose status has drifted", async () => {
      seedFullRace();
      const indexer = build(new FakeEventSource([]));
      await indexer.rebuild();

      await pool.query("UPDATE events SET status = 'Draft' WHERE event_id = 0");
      const report = await indexer.doctor();
      expect(report.findings).toContainEqual({
        kind: "event-differs",
        detail: "event 0: status Draft != Completed",
      });
    });

    it("is clean on an empty chain and an empty index", async () => {
      expect(await build(new FakeEventSource([])).doctor()).toMatchObject({
        ok: true,
        chain: { events: 0, records: 0 },
        index: { events: 0, records: 0 },
      });
    });
  });
});

/** Pure, so it needs no database. */
describe("reconstructTransitions", () => {
  const base = {
    tokenId: 5,
    eventId: 0,
    categoryId: 0,
    bibNo: 1,
    participantHash: "ab".repeat(32),
    enteredAt: 100n,
    claimedAt: null,
    finishTimeS: null,
    resultAt: null,
  };

  it("gives an entered record one step", () => {
    expect(reconstructTransitions({ ...base, state: "Entered" })).toEqual([
      { tokenId: 5, fromState: null, toState: "Entered", occurredAt: 100n },
    ]);
  });

  it("gives a claimed record two", () => {
    expect(
      reconstructTransitions({ ...base, state: "RacepackClaimed", claimedAt: 200n }).map(
        (t) => t.toState,
      ),
    ).toEqual(["Entered", "RacepackClaimed"]);
  });

  it("gives a finished record three, in order", () => {
    expect(
      reconstructTransitions({
        ...base,
        state: "Finished",
        claimedAt: 200n,
        finishTimeS: 60,
        resultAt: 300n,
      }),
    ).toEqual([
      { tokenId: 5, fromState: null, toState: "Entered", occurredAt: 100n },
      { tokenId: 5, fromState: "Entered", toState: "RacepackClaimed", occurredAt: 200n },
      { tokenId: 5, fromState: "RacepackClaimed", toState: "Finished", occurredAt: 300n },
    ]);
  });

  it("gives a no-show DNF two steps, straight from Entered", () => {
    // record_dnf is legal from Entered, so there is no RacepackClaimed step to
    // invent — and inventing one would put a race pack in someone's hands that
    // they never collected.
    expect(reconstructTransitions({ ...base, state: "Dnf", resultAt: 300n })).toEqual([
      { tokenId: 5, fromState: null, toState: "Entered", occurredAt: 100n },
      { tokenId: 5, fromState: "Entered", toState: "Dnf", occurredAt: 300n },
    ]);
  });

  it("gives a DNF after claiming three steps", () => {
    expect(
      reconstructTransitions({ ...base, state: "Dnf", claimedAt: 200n, resultAt: 300n }).map((t) => [
        t.fromState,
        t.toState,
      ]),
    ).toEqual([
      [null, "Entered"],
      ["Entered", "RacepackClaimed"],
      ["RacepackClaimed", "Dnf"],
    ]);
  });
});
