/**
 * STE-16 — the keeper's run log.
 *
 * "Log hasil tiap run yang bisa diperiksa" in the ticket, taken literally: a
 * table, not a log line. Container logs rotate away and nobody greps them a
 * month later; `SELECT * FROM ttl_keeper_runs ORDER BY started_at DESC LIMIT 5`
 * answers "is rent being paid?" from any psql prompt, including one belonging
 * to somebody reviewing the grant.
 *
 * The row is written **before** the work starts, with status 'running'. A
 * keeper that dies mid-run therefore leaves evidence that it ran and did not
 * finish, which is the case worth seeing.
 */
import type { Queryable } from "../indexer/store.js";
import type { SubmittedTransaction } from "./rpc.js";

export type KeeperRunStatus = "running" | "ok" | "failed" | "dry-run";

export interface KeeperRunRow {
  id: number;
  startedAt: Date;
  finishedAt: Date | null;
  atLedger: number | null;
  thresholdLedgers: number;
  extendToLedgers: number;
  scannedKeys: number;
  belowThreshold: number;
  extendedKeys: number;
  missingKeys: number;
  transactions: SubmittedTransaction[];
  status: KeeperRunStatus;
  error: string | null;
}

export async function startRun(
  db: Queryable,
  thresholdLedgers: number,
  extendToLedgers: number,
): Promise<number> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO ttl_keeper_runs (threshold_ledgers, extend_to_ledgers, status)
     VALUES ($1, $2, 'running') RETURNING id::text`,
    [thresholdLedgers, extendToLedgers],
  );
  const row = rows[0];
  if (!row) throw new Error("could not open a ttl_keeper_runs row");
  return Number(row.id);
}

export async function finishRun(
  db: Queryable,
  id: number,
  update: {
    atLedger: number | null;
    scannedKeys: number;
    belowThreshold: number;
    extendedKeys: number;
    missingKeys: number;
    transactions: SubmittedTransaction[];
    status: Exclude<KeeperRunStatus, "running">;
    error?: string;
  },
): Promise<void> {
  await db.query(
    `UPDATE ttl_keeper_runs
        SET finished_at = now(), at_ledger = $2, scanned_keys = $3, below_threshold = $4,
            extended_keys = $5, missing_keys = $6, transactions = $7::jsonb,
            status = $8, error = $9
      WHERE id = $1`,
    [
      id,
      update.atLedger,
      update.scannedKeys,
      update.belowThreshold,
      update.extendedKeys,
      update.missingKeys,
      JSON.stringify(update.transactions),
      update.status,
      update.error ?? null,
    ],
  );
}

export async function recentRuns(db: Queryable, limit = 10): Promise<KeeperRunRow[]> {
  const { rows } = await db.query<{
    id: string;
    started_at: Date;
    finished_at: Date | null;
    at_ledger: number | null;
    threshold_ledgers: number;
    extend_to_ledgers: number;
    scanned_keys: number;
    below_threshold: number;
    extended_keys: number;
    missing_keys: number;
    transactions: SubmittedTransaction[];
    status: KeeperRunStatus;
    error: string | null;
  }>(
    `SELECT id::text, started_at, finished_at, at_ledger, threshold_ledgers, extend_to_ledgers,
            scanned_keys, below_threshold, extended_keys, missing_keys, transactions,
            status, error
       FROM ttl_keeper_runs ORDER BY started_at DESC, id DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    atLedger: r.at_ledger,
    thresholdLedgers: r.threshold_ledgers,
    extendToLedgers: r.extend_to_ledgers,
    scannedKeys: r.scanned_keys,
    belowThreshold: r.below_threshold,
    extendedKeys: r.extended_keys,
    missingKeys: r.missing_keys,
    transactions: r.transactions,
    status: r.status,
    error: r.error,
  }));
}
