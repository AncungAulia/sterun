/**
 * STE-16 (C8) — the keeper run itself.
 *
 * One run is: work out which ledger entries hold the race records this index
 * knows about, ask RPC how long each has left, and extend the ones that are
 * running out. Everything it decides is written to `ttl_keeper_runs`, including
 * a run that decided to do nothing — "nothing was due" and "the job did not run"
 * look identical in a system that only logs work.
 *
 * The scan is `2 * records + runners` simulations. That is fine at MVP scale
 * (one event, a few hundred entries, run weekly) and would not be at ten
 * thousand; the honest fix then is to extend by *category* rather than by
 * record, which needs a contract change, so it is noted in be/OPERATIONS.md
 * rather than pretended away with a batch size.
 */
import type { Pool } from "pg";
import type { xdr } from "@stellar/stellar-sdk";
import type { ChainReader } from "../chain/reader.js";
import { dedupeKeys } from "../chain/reader.js";
import * as store from "../indexer/store.js";
import { finishRun, startRun } from "./runs.js";
import type { SubmittedTransaction, TtlRpc } from "./rpc.js";
import {
  DEFAULT_EXTEND_TO_LEDGERS,
  DEFAULT_KEYS_PER_TRANSACTION,
  DEFAULT_THRESHOLD_LEDGERS,
  batch,
  selectDueKeys,
  type KeyTtl,
} from "./ttl.js";

export interface KeeperOptions {
  thresholdLedgers?: number;
  extendToLedgers?: number;
  keysPerTransaction?: number;
  /** Scan and report, submit nothing. What a cron runs the first time. */
  dryRun?: boolean;
  log?: (level: "info" | "warn", message: string, detail?: Record<string, unknown>) => void;
}

export interface KeeperRunResult {
  runId: number;
  atLedger: number;
  scannedKeys: number;
  belowThreshold: number;
  extendedKeys: number;
  missingKeys: number;
  /** The keys RPC would not serve — the restore runbook's input. */
  missing: KeyTtl[];
  transactions: SubmittedTransaction[];
  status: "ok" | "dry-run";
}

export class TtlKeeper {
  private readonly thresholdLedgers: number;
  private readonly extendToLedgers: number;
  private readonly keysPerTransaction: number;
  private readonly dryRun: boolean;
  private readonly log: NonNullable<KeeperOptions["log"]>;

  constructor(
    private readonly pool: Pool,
    private readonly reader: ChainReader,
    private readonly rpc: TtlRpc,
    options: KeeperOptions = {},
  ) {
    this.thresholdLedgers = options.thresholdLedgers ?? DEFAULT_THRESHOLD_LEDGERS;
    this.extendToLedgers = options.extendToLedgers ?? DEFAULT_EXTEND_TO_LEDGERS;
    this.keysPerTransaction = options.keysPerTransaction ?? DEFAULT_KEYS_PER_TRANSACTION;
    this.dryRun = options.dryRun ?? false;
    this.log = options.log ?? (() => {});

    if (this.extendToLedgers <= this.thresholdLedgers) {
      // Extending to no further than the threshold means every run finds every
      // entry due again — an infinite rent bill that looks like it is working.
      throw new RangeError(
        `extendTo (${this.extendToLedgers}) must exceed the threshold (${this.thresholdLedgers}), ` +
          "or every run would re-extend every entry it just extended",
      );
    }
  }

  /**
   * Every ledger key that has to stay alive for the index's records to remain
   * readable and verifiable.
   *
   * Asked of the host rather than constructed here — see the note at the top of
   * `ttl.ts`. The union covers `DataKey::Record`, OpenZeppelin's owner and
   * enumeration entries, and the contract instance and wasm, because those are
   * exactly what the three reads touch.
   */
  async collectKeys(): Promise<xdr.LedgerKey[]> {
    const tokenIds = await store.allTokenIds(this.pool);
    const runners = await store.distinctRunners(this.pool);

    const keys: xdr.LedgerKey[] = [];
    for (const tokenId of tokenIds) keys.push(...(await this.reader.recordFootprint(tokenId)));
    for (const runner of runners) keys.push(...(await this.reader.runnerFootprint(runner)));
    return dedupeKeys(keys);
  }

  async run(): Promise<KeeperRunResult> {
    const runId = await startRun(this.pool, this.thresholdLedgers, this.extendToLedgers);
    try {
      const keys = await this.collectKeys();
      // Read the ledger AFTER collecting keys and BEFORE reading TTLs, so every
      // `liveUntil - atLedger` in this run is measured against one clock.
      const atLedger = await this.rpc.latestLedger();
      const entries = keys.length > 0 ? await this.rpc.liveUntil(keys) : [];
      const { due, missing } = selectDueKeys(entries, atLedger, this.thresholdLedgers);

      if (missing.length > 0) {
        this.log("warn", "ledger entries RPC will not serve — archived or never written", {
          count: missing.length,
          runbook: "be/OPERATIONS.md, 'Restoring an archived entry'",
        });
      }

      const transactions: SubmittedTransaction[] = [];
      let extendedKeys = 0;
      if (!this.dryRun) {
        for (const chunk of batch(
          due.map((d) => d.key),
          this.keysPerTransaction,
        )) {
          const submitted = await this.rpc.extend(chunk, this.extendToLedgers);
          transactions.push(submitted);
          // Only a landed transaction extended anything. A FAILED or NOT_FOUND
          // one is recorded and not counted, so the run's numbers cannot claim
          // rent that was never paid.
          if (submitted.status === "SUCCESS") extendedKeys += submitted.keys;
        }
      }

      const status = this.dryRun ? ("dry-run" as const) : ("ok" as const);
      await finishRun(this.pool, runId, {
        atLedger,
        scannedKeys: entries.length,
        belowThreshold: due.length,
        extendedKeys,
        missingKeys: missing.length,
        transactions,
        status,
      });

      return {
        runId,
        atLedger,
        scannedKeys: entries.length,
        belowThreshold: due.length,
        extendedKeys,
        missingKeys: missing.length,
        missing,
        transactions,
        status,
      };
    } catch (e) {
      await finishRun(this.pool, runId, {
        atLedger: null,
        scannedKeys: 0,
        belowThreshold: 0,
        extendedKeys: 0,
        missingKeys: 0,
        transactions: [],
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  /**
   * Restore archived entries — step 3 of the runbook in be/OPERATIONS.md.
   *
   * Deliberately not called from {@link run}: restoring costs materially more
   * than extending and means something already went wrong, so a human decides.
   */
  async restore(keys: xdr.LedgerKey[]): Promise<SubmittedTransaction[]> {
    const submitted: SubmittedTransaction[] = [];
    for (const chunk of batch(keys, this.keysPerTransaction)) {
      submitted.push(await this.rpc.restore(chunk));
    }
    return submitted;
  }
}
