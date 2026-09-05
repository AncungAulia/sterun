/**
 * STE-20 (C7) — deciding which rows are safe to publish on-chain.
 *
 * `record_finish` moves a record to `Finished`, which is **terminal**: there is
 * no exported contract path back out (docs/specs/INTERFACE.md §2.2). A wrong
 * time published here is wrong forever. That asymmetry is why this file exists
 * at all — the organiser gets to see every doubtful row *before* anything is
 * signed, rather than discovering it in a revert log afterwards.
 *
 * Two kinds of anomaly, and they are not the same kind of problem:
 *
 *   would revert     the chain will refuse this row. `not_claimed` and
 *                    `already_final` are guards in the contract, so publishing
 *                    them costs a failed transaction and nothing worse.
 *   would be wrong   the chain will happily accept it and it will be a lie.
 *                    `ambiguous_bib` publishes somebody else's time under a
 *                    bib; `impossible_time` publishes a transcription error.
 *                    These are the dangerous ones, because nothing downstream
 *                    catches them.
 *
 * Every anomaly carries `severity` for exactly that reason, and the second kind
 * is never auto-approved.
 */
import type { ParsedRow } from "./csv.js";

export type AnomalyKind =
  | "malformed_row"
  | "unknown_bib"
  | "ambiguous_bib"
  | "duplicate_bib"
  | "not_claimed"
  | "already_final"
  | "impossible_time";

export interface Anomaly {
  kind: AnomalyKind;
  /** A sentence an organiser can act on, not a code they have to look up. */
  reason: string;
  /**
   * `reverts` — the contract refuses it; the cost is a failed transaction.
   * `wrong`   — the contract accepts it and the result is false. Worse.
   */
  severity: "reverts" | "wrong";
}

/** One row of the file, resolved as far as it can be. */
export interface ReviewedRow {
  line: number;
  bibNo: number | null;
  categoryId: number | null;
  finishTimeS: number | null;
  /** Resolved from the index. `null` whenever an anomaly prevented resolution. */
  tokenId: number | null;
  /** The record's current on-chain state, when one was found. */
  state: string | null;
  anomalies: Anomaly[];
}

export interface ResultsReview {
  rows: ReviewedRow[];
  /** Rows with no anomalies — the ones the console may publish. */
  publishable: ReviewedRow[];
  counts: Record<AnomalyKind, number> & { total: number; publishable: number };
}

/** One indexed record, reduced to what this check needs. */
export interface IndexedRecord {
  tokenId: number;
  categoryId: number;
  bibNo: number;
  state: string;
}

/** Category distances, used to tell a plausible time from a typo. */
export interface CategoryDistance {
  categoryId: number;
  distanceM: number;
}

/**
 * The fastest a human moves over a race distance, in metres per second.
 *
 * 12.5 m/s is 45 km/h — comfortably above the 100 m world record's *average*
 * (10.44 m/s) and roughly double the 5000 m world record pace. Nothing a person
 * does over a race distance approaches it, so a row that implies it is a
 * transcription error rather than a remarkable athlete. Set deliberately far
 * above any real performance: this check exists to catch `52:41` read as 5241
 * seconds, not to referee anybody's race.
 */
export const MAX_PLAUSIBLE_SPEED_MS = 12.5;

/** A day. Beyond this, a duration column is measuring something else. */
export const MAX_PLAUSIBLE_FINISH_S = 86_400;

const zeroCounts = (): ResultsReview["counts"] => ({
  malformed_row: 0,
  unknown_bib: 0,
  ambiguous_bib: 0,
  duplicate_bib: 0,
  not_claimed: 0,
  already_final: 0,
  impossible_time: 0,
  total: 0,
  publishable: 0,
});

function timeAnomaly(
  finishTimeS: number,
  distanceM: number | null,
): Anomaly | null {
  if (finishTimeS <= 0) {
    return {
      kind: "impossible_time",
      // The contract's own guard, so this one would also revert — but it is
      // reported as `wrong` because a zero here means the source data is
      // broken, not that the row is merely out of order.
      reason: "a finish time of 0 seconds is rejected by the contract (InvalidFinishTime)",
      severity: "wrong",
    };
  }
  if (finishTimeS > MAX_PLAUSIBLE_FINISH_S) {
    return {
      kind: "impossible_time",
      reason:
        `${finishTimeS}s is more than 24 hours — check whether the column is ` +
        `seconds or a timestamp`,
      severity: "wrong",
    };
  }
  if (distanceM !== null) {
    const speed = distanceM / finishTimeS;
    if (speed > MAX_PLAUSIBLE_SPEED_MS) {
      return {
        kind: "impossible_time",
        reason:
          `${finishTimeS}s over ${distanceM}m is ${speed.toFixed(1)} m/s, faster than any ` +
          `human over this distance — a time like 52:41 read as 5241 seconds does this`,
        severity: "wrong",
      };
    }
  }
  return null;
}

/**
 * Check every row against the indexed records for one event.
 *
 * Pure: it takes the index contents rather than a database, so the whole matrix
 * of anomalies is testable without Postgres, and the route stays a thin layer
 * over it.
 */
export function reviewResults(
  parsed: ParsedRow[],
  records: IndexedRecord[],
  categories: CategoryDistance[],
): ResultsReview {
  const distanceOf = new Map(categories.map((c) => [c.categoryId, c.distanceM]));

  // Bib numbers come from `reserve_slot`, which counts per category, so the
  // key is the pair. A bib on its own may name several records.
  const byPair = new Map<string, IndexedRecord>();
  const byBib = new Map<number, IndexedRecord[]>();
  for (const record of records) {
    byPair.set(`${record.categoryId}:${record.bibNo}`, record);
    const list = byBib.get(record.bibNo);
    if (list) list.push(record);
    else byBib.set(record.bibNo, [record]);
  }

  const seen = new Map<string, number>();
  const rows: ReviewedRow[] = [];

  for (const row of parsed) {
    const anomalies: Anomaly[] = [];
    let record: IndexedRecord | null = null;

    if (row.problem !== null || row.bibNo === null || row.finishTimeS === null) {
      anomalies.push({
        kind: "malformed_row",
        reason: row.problem ?? "the row could not be read",
        severity: "wrong",
      });
      rows.push({
        line: row.line,
        bibNo: row.bibNo,
        categoryId: row.categoryId,
        finishTimeS: row.finishTimeS,
        tokenId: null,
        state: null,
        anomalies,
      });
      continue;
    }

    // 1. Resolve bib (+ category) to a record.
    if (row.categoryId !== null) {
      record = byPair.get(`${row.categoryId}:${row.bibNo}`) ?? null;
      if (!record) {
        anomalies.push({
          kind: "unknown_bib",
          reason: `no entry with bib ${row.bibNo} in category ${row.categoryId} for this event`,
          severity: "reverts",
        });
      }
    } else {
      const candidates = byBib.get(row.bibNo) ?? [];
      if (candidates.length === 0) {
        anomalies.push({
          kind: "unknown_bib",
          reason: `no entry with bib ${row.bibNo} in this event`,
          severity: "reverts",
        });
      } else if (candidates.length > 1) {
        // Resolving this by guessing would publish one runner's time onto
        // another runner's record, and Finished is terminal.
        anomalies.push({
          kind: "ambiguous_bib",
          reason:
            `bib ${row.bibNo} exists in categories ` +
            `${candidates.map((c) => c.categoryId).join(", ")} — bib numbers restart at 0 in ` +
            `each category, so this row needs a category_id column to say which runner it is`,
          severity: "wrong",
        });
      } else {
        record = candidates[0] ?? null;
      }
    }

    // 2. Duplicates within the file, keyed by whatever the row resolved to.
    const key = record ? `t:${record.tokenId}` : `b:${row.categoryId ?? "?"}:${row.bibNo}`;
    const firstSeen = seen.get(key);
    if (firstSeen !== undefined) {
      anomalies.push({
        kind: "duplicate_bib",
        reason: `bib ${row.bibNo} already appears on line ${firstSeen} of this file`,
        severity: "wrong",
      });
    } else {
      seen.set(key, row.line);
    }

    // 3. Lifecycle: what the contract will do with this record.
    if (record) {
      if (record.state === "Entered") {
        anomalies.push({
          kind: "not_claimed",
          reason:
            `bib ${row.bibNo} is still Entered — the runner never collected a race pack, so ` +
            `record_finish reverts with InvalidState. Check them in first, or mark a DNF.`,
          severity: "reverts",
        });
      } else if (record.state === "Finished" || record.state === "Dnf") {
        anomalies.push({
          kind: "already_final",
          reason:
            `bib ${row.bibNo} is already ${record.state}, which is terminal — this result ` +
            `cannot be published over it`,
          severity: "reverts",
        });
      }
    }

    // 4. Is the time itself believable?
    const distance = record ? (distanceOf.get(record.categoryId) ?? null) : null;
    const timeProblem = timeAnomaly(row.finishTimeS, distance);
    if (timeProblem) anomalies.push(timeProblem);

    rows.push({
      line: row.line,
      bibNo: row.bibNo,
      categoryId: record?.categoryId ?? row.categoryId,
      finishTimeS: row.finishTimeS,
      tokenId: record?.tokenId ?? null,
      state: record?.state ?? null,
      anomalies,
    });
  }

  const counts = zeroCounts();
  counts.total = rows.length;
  for (const row of rows) {
    for (const anomaly of row.anomalies) counts[anomaly.kind] += 1;
  }
  const publishable = rows.filter((r) => r.anomalies.length === 0);
  counts.publishable = publishable.length;

  return { rows, publishable, counts };
}
