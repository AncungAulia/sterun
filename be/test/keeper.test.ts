/**
 * STE-16 — the TTL keeper.
 *
 * What this job is defending against is slow and silent: a record whose rent
 * lapses is *archived*, not deleted, and nothing complains until somebody tries
 * to verify a two-year-old finish and gets an error. So the tests care most
 * about the cases where a keeper could report success while doing nothing
 * useful — a failed transaction counted as extended, an archived entry treated
 * as extendable, an `extendTo` that does not clear the threshold.
 */
import type { Pool } from "pg";
import type { xdr } from "@stellar/stellar-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChainReader } from "../src/chain/reader.js";
import { Indexer } from "../src/indexer/indexer.js";
import * as store from "../src/indexer/store.js";
import { TtlKeeper } from "../src/keeper/keeper.js";
import type { SubmittedTransaction, TtlRpc } from "../src/keeper/rpc.js";
import { recentRuns } from "../src/keeper/runs.js";
import {
  DAY_IN_LEDGERS,
  DEFAULT_EXTEND_TO_LEDGERS,
  DEFAULT_THRESHOLD_LEDGERS,
  batch,
  selectDueKeys,
  type KeyTtl,
} from "../src/keeper/ttl.js";
import { ADDRESSES, ORGANISER, RUNNER, RUNNER_B } from "./helpers/addresses.js";
import { FakeChain, fakeLedgerKey } from "./helpers/fake-chain.js";
import { FakeEventSource } from "./helpers/fake-events.js";
import { DATABASE_URL, SKIP_REASON, freshDatabase } from "./helpers/db.js";

const key = (label: string): xdr.LedgerKey => fakeLedgerKey(ADDRESSES.raceRecord, label);

const ttl = (label: string, liveUntilLedgerSeq: number | null): KeyTtl => {
  const k = key(label);
  return { id: k.toXdr("base64"), key: k, liveUntilLedgerSeq };
};

describe("selectDueKeys", () => {
  const AT = 1_000_000;
  const THRESHOLD = 100;

  it("splits into due, alive and missing", () => {
    const selection = selectDueKeys(
      [
        ttl("nearly-gone", AT + 10),
        ttl("comfortable", AT + 10_000),
        ttl("archived", null),
      ],
      AT,
      THRESHOLD,
    );
    expect(selection.due.map((d) => d.liveUntilLedgerSeq)).toEqual([AT + 10]);
    expect(selection.alive.map((a) => a.liveUntilLedgerSeq)).toEqual([AT + 10_000]);
    expect(selection.missing.map((m) => m.liveUntilLedgerSeq)).toEqual([null]);
  });

  it("treats exactly-at-threshold as still alive, and one below as due", () => {
    // The boundary is worth pinning: off by one here is either a wasted
    // transaction every run or a week of extra exposure.
    expect(selectDueKeys([ttl("a", AT + THRESHOLD)], AT, THRESHOLD).due).toHaveLength(0);
    expect(selectDueKeys([ttl("a", AT + THRESHOLD - 1)], AT, THRESHOLD).due).toHaveLength(1);
  });

  it("treats an already-lapsed entry RPC still answers for as urgently due", () => {
    // An entry can be past its liveUntil and not yet evicted. Negative
    // remaining must be due, not filtered out by a comparison that assumed
    // positives.
    const selection = selectDueKeys([ttl("lapsed", AT - 500)], AT, THRESHOLD);
    expect(selection.due).toHaveLength(1);
    expect(selection.missing).toHaveLength(0);
  });

  it("never puts an unserved entry in due — extending cannot resurrect it", () => {
    const selection = selectDueKeys([ttl("archived", null)], AT, THRESHOLD);
    expect(selection.due).toHaveLength(0);
    expect(selection.missing).toHaveLength(1);
  });

  it("handles the empty scan", () => {
    expect(selectDueKeys([], AT, THRESHOLD)).toEqual({ due: [], alive: [], missing: [] });
  });
});

describe("batch", () => {
  it("chunks in order and keeps the remainder", () => {
    expect(batch([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns nothing for an empty list", () => {
    expect(batch([], 10)).toEqual([]);
  });

  it("refuses a size that would loop forever", () => {
    expect(() => batch([1], 0)).toThrow(RangeError);
    expect(() => batch([1], -1)).toThrow(RangeError);
    expect(() => batch([1], 1.5)).toThrow(RangeError);
  });
});

describe("thresholds", () => {
  it("matches the contract's own constants", () => {
    // sc/contracts/race_record/src/lib.rs: BUMP_THRESHOLD 120 days,
    // BUMP_TO 180 days. Different numbers here would make "when does this
    // expire" depend on which of the two touched the entry last.
    expect(DAY_IN_LEDGERS).toBe(17_280);
    expect(DEFAULT_THRESHOLD_LEDGERS).toBe(120 * 17_280);
    expect(DEFAULT_EXTEND_TO_LEDGERS).toBe(180 * 17_280);
  });
});

/** A `TtlRpc` that records what it was asked to do and answers as told. */
class FakeTtlRpc implements TtlRpc {
  ledger = 1_000_000;
  /** liveUntil per key label; anything absent is reported as not served. */
  readonly ttls = new Map<string, number | null>();
  readonly extended: Array<{ keys: number; extendTo: number }> = [];
  readonly restored: Array<{ keys: number }> = [];
  status = "SUCCESS";
  private counter = 0;

  async latestLedger(): Promise<number> {
    return this.ledger;
  }

  async liveUntil(keys: xdr.LedgerKey[]): Promise<KeyTtl[]> {
    return keys.map((k) => ({
      id: k.toXdr("base64"),
      key: k,
      liveUntilLedgerSeq: this.ttls.get(k.toXdr("base64")) ?? null,
    }));
  }

  async extend(keys: xdr.LedgerKey[], extendToLedgers: number): Promise<SubmittedTransaction> {
    this.extended.push({ keys: keys.length, extendTo: extendToLedgers });
    this.counter += 1;
    return { hash: this.counter.toString(16).padStart(64, "0"), status: this.status, keys: keys.length };
  }

  async restore(keys: xdr.LedgerKey[]): Promise<SubmittedTransaction> {
    this.restored.push({ keys: keys.length });
    this.counter += 1;
    return { hash: this.counter.toString(16).padStart(64, "0"), status: "SUCCESS", keys: keys.length };
  }

  /** Report every key the keeper is about to scan as having this much left. */
  setAll(keys: xdr.LedgerKey[], remaining: number | null): void {
    for (const k of keys) {
      this.ttls.set(k.toXdr("base64"), remaining === null ? null : this.ledger + remaining);
    }
  }
}

describe("construction", () => {
  it("refuses an extendTo that does not clear the threshold", () => {
    // Otherwise every run finds every entry due again: an unbounded rent bill
    // that looks exactly like a job that is working.
    expect(
      () =>
        new TtlKeeper(null as unknown as Pool, null as unknown as ChainReader, new FakeTtlRpc(), {
          thresholdLedgers: 100,
          extendToLedgers: 100,
        }),
    ).toThrow(RangeError);
  });
});

describe.skipIf(!DATABASE_URL)(`TTL keeper (${DATABASE_URL ? "postgres" : SKIP_REASON})`, () => {
  let pool: Pool;
  let close: () => Promise<void>;
  let chain: FakeChain;
  let reader: ChainReader;
  let rpc: FakeTtlRpc;

  beforeEach(async () => {
    ({ pool, close } = await freshDatabase());
    chain = new FakeChain(ADDRESSES);
    reader = new ChainReader(chain, ADDRESSES);
    rpc = new FakeTtlRpc();
  });

  afterEach(async () => {
    await close();
  });

  /** Two records for two different runners, indexed from contract state. */
  async function seedIndex(): Promise<void> {
    chain.addEvent({ eventId: 0, organiser: ORGANISER });
    chain.addCategory({ eventId: 0, categoryId: 0 });
    chain.addRecord({ tokenId: 0, eventId: 0, owner: RUNNER });
    chain.addRecord({ tokenId: 1, eventId: 0, owner: RUNNER_B });
    await new Indexer(pool, reader, new FakeEventSource([]), ADDRESSES).rebuild();
  }

  const keeper = (options = {}): TtlKeeper =>
    new TtlKeeper(pool, reader, rpc, { thresholdLedgers: 100, extendToLedgers: 1_000, ...options });

  describe("collecting keys", () => {
    it("covers the record, the owner mapping and the per-owner enumeration", async () => {
      // `extend_record_ttl` on the contract bumps only DataKey::Record and the
      // instance. The owner mapping and the enumeration index live under
      // OpenZeppelin's own keys, and a record whose owner entry archived still
      // breaks verify() and records_of() — which is most of what it is for.
      await seedIndex();
      const ids = (await keeper().collectKeys()).map((k) => k.toXdr("base64"));

      for (const label of [
        "record:0",
        "owner:0",
        "record:1",
        "owner:1",
        `owned:${RUNNER}`,
        `owned:${RUNNER_B}`,
        "instance",
        "wasm",
      ]) {
        expect(ids).toContain(key(label).toXdr("base64"));
      }
    });

    it("counts the shared contract entries once, not once per record", async () => {
      await seedIndex();
      const ids = (await keeper().collectKeys()).map((k) => k.toXdr("base64"));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.filter((id) => id === key("instance").toXdr("base64"))).toHaveLength(1);
    });

    it("collects nothing from an empty index", async () => {
      expect(await keeper().collectKeys()).toEqual([]);
    });
  });

  describe("a run", () => {
    it("extends only what is below the threshold", async () => {
      await seedIndex();
      const k = keeper();
      const keys = await k.collectKeys();
      rpc.setAll(keys, 10_000);
      // One key about to lapse.
      rpc.ttls.set(key("record:0").toXdr("base64"), rpc.ledger + 5);

      const result = await k.run();
      expect(result.scannedKeys).toBe(keys.length);
      expect(result.belowThreshold).toBe(1);
      expect(result.extendedKeys).toBe(1);
      expect(rpc.extended).toEqual([{ keys: 1, extendTo: 1_000 }]);
    });

    it("submits nothing when nothing is due", async () => {
      await seedIndex();
      const k = keeper();
      rpc.setAll(await k.collectKeys(), 10_000);

      const result = await k.run();
      expect(result.belowThreshold).toBe(0);
      expect(result.extendedKeys).toBe(0);
      expect(rpc.extended).toEqual([]);
      // Still logged: "nothing was due" and "the job never ran" must not look
      // the same a month later.
      expect((await recentRuns(pool)).at(0)).toMatchObject({ status: "ok", scannedKeys: expect.any(Number) });
    });

    it("splits a large due set across transactions", async () => {
      await seedIndex();
      const k = keeper({ keysPerTransaction: 3 });
      const keys = await k.collectKeys();
      rpc.setAll(keys, 1);

      const result = await k.run();
      expect(result.belowThreshold).toBe(keys.length);
      expect(rpc.extended.map((e) => e.keys)).toEqual(
        batch(keys, 3).map((chunk) => chunk.length),
      );
      expect(result.extendedKeys).toBe(keys.length);
    });

    it("does not count keys from a transaction that did not land", async () => {
      // The failure that would otherwise be invisible: a run reporting rent it
      // never paid, every week, until something archives.
      await seedIndex();
      const k = keeper();
      rpc.setAll(await k.collectKeys(), 1);
      rpc.status = "FAILED";

      const result = await k.run();
      expect(result.belowThreshold).toBeGreaterThan(0);
      expect(result.extendedKeys).toBe(0);
      expect(result.transactions[0]).toMatchObject({ status: "FAILED" });
    });

    it("reports entries RPC will not serve without trying to extend them", async () => {
      await seedIndex();
      const k = keeper();
      const keys = await k.collectKeys();
      rpc.setAll(keys, 10_000);
      rpc.ttls.set(key("record:1").toXdr("base64"), null);

      const result = await k.run();
      expect(result.missingKeys).toBe(1);
      expect(result.missing.map((m) => m.id)).toEqual([key("record:1").toXdr("base64")]);
      expect(rpc.extended).toEqual([]);
    });

    it("scans and submits nothing in dry-run mode", async () => {
      await seedIndex();
      const k = keeper({ dryRun: true });
      rpc.setAll(await k.collectKeys(), 1);

      const result = await k.run();
      expect(result.status).toBe("dry-run");
      expect(result.belowThreshold).toBeGreaterThan(0);
      expect(result.extendedKeys).toBe(0);
      expect(rpc.extended).toEqual([]);
      expect((await recentRuns(pool)).at(0)?.status).toBe("dry-run");
    });

    it("does nothing, successfully, when the index is empty", async () => {
      const result = await keeper().run();
      expect(result).toMatchObject({ scannedKeys: 0, belowThreshold: 0, extendedKeys: 0 });
      expect((await recentRuns(pool)).at(0)?.status).toBe("ok");
    });
  });

  describe("the run log", () => {
    it("records the numbers and the transactions a reviewer would ask for", async () => {
      await seedIndex();
      const k = keeper();
      const keys = await k.collectKeys();
      rpc.setAll(keys, 1);

      const result = await k.run();
      const [logged] = await recentRuns(pool);
      expect(logged).toMatchObject({
        id: result.runId,
        status: "ok",
        atLedger: rpc.ledger,
        thresholdLedgers: 100,
        extendToLedgers: 1_000,
        scannedKeys: keys.length,
        belowThreshold: keys.length,
        extendedKeys: keys.length,
        missingKeys: 0,
      });
      expect(logged?.finishedAt).not.toBeNull();
      expect(logged?.transactions[0]).toMatchObject({ status: "SUCCESS", keys: expect.any(Number) });
    });

    it("marks a run that threw as failed, with the reason", async () => {
      await seedIndex();
      const exploding: TtlRpc = {
        latestLedger: async () => {
          throw new Error("rpc is down");
        },
        liveUntil: async () => [],
        extend: async () => {
          throw new Error("unreachable");
        },
        restore: async () => {
          throw new Error("unreachable");
        },
      };
      const k = new TtlKeeper(pool, reader, exploding, {
        thresholdLedgers: 100,
        extendToLedgers: 1_000,
      });

      await expect(k.run()).rejects.toThrow("rpc is down");
      const [logged] = await recentRuns(pool);
      // Evidence that it ran and did not finish, which is the case worth
      // seeing. A job that only logs its successes looks healthy while dead.
      expect(logged).toMatchObject({ status: "failed", error: "rpc is down" });
    });

    it("keeps runs newest first", async () => {
      await keeper().run();
      await keeper().run();
      const runs = await recentRuns(pool, 10);
      expect(runs).toHaveLength(2);
      expect(runs[0]!.id).toBeGreaterThan(runs[1]!.id);
    });
  });

  describe("restore", () => {
    it("submits RestoreFootprintOp in batches for the keys it is given", async () => {
      await seedIndex();
      const k = keeper({ keysPerTransaction: 2 });
      const keys = (await k.collectKeys()).slice(0, 3);

      const submitted = await k.restore(keys);
      expect(rpc.restored.map((r) => r.keys)).toEqual([2, 1]);
      expect(submitted).toHaveLength(2);
    });

    it("is never called by run() — restoring costs more and means something broke", async () => {
      await seedIndex();
      const k = keeper();
      rpc.setAll(await k.collectKeys(), null);
      await k.run();
      expect(rpc.restored).toEqual([]);
    });
  });

  describe("the keeper's work list comes from the index", () => {
    it("finds every distinct runner exactly once", async () => {
      await seedIndex();
      chain.addRecord({ tokenId: 2, eventId: 0, owner: RUNNER });
      await new Indexer(pool, reader, new FakeEventSource([]), ADDRESSES).rebuild();

      expect(await store.distinctRunners(pool)).toEqual([RUNNER, RUNNER_B].sort());
      expect(await store.allTokenIds(pool)).toEqual([0, 1, 2]);
    });
  });
});
