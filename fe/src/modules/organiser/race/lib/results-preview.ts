/**
 * The results CSV, as the backend reviews it (STE-58, reading STE-20 + STE-44).
 *
 * `POST /events/:eventId/results/preview` parses the file, resolves each row
 * against this race's entries, and answers with a verdict per row. It signs
 * nothing and records nothing: the key that publishes results stays on the
 * organiser's device, and this call is a review, not a submission.
 *
 * ## Why the review exists at all
 *
 * `record_finish` moves a record to `Finished`, which is **terminal**. A wrong
 * time that has been published cannot be corrected by anyone, ever. So the file
 * is read against the race before a single signature is spent, and anything the
 * review flags is held rather than sent.
 *
 * ## The two severities are not the same problem
 *
 * The backend labels every anomaly `reverts` or `wrong`, and the difference is
 * the whole reason this screen has a review step:
 *
 * - `reverts` — the chain refuses the row. The cost is a failed transaction and
 *   nothing changes: an unknown bib, a runner who never collected a race pack,
 *   a result that is already recorded.
 * - `wrong` — the chain **accepts** it and the record is false for good: a bib
 *   two runners could claim, the same bib twice with different times, a time no
 *   human could run, a row that could not be parsed.
 *
 * Both are held. The severity decides how loudly the screen talks about them,
 * never whether they are sent.
 *
 * ## The shape is mirrored, not imported
 *
 * `be/` is not a dependency of this app, so these types are written here and
 * pinned by tests against the fixtures the backend's own tests use. The words
 * match on purpose: `kind` here is `kind` in `publishable[]` and `kind` in the
 * SDK's `SterunResult`, so a reviewed row maps to a contract call without a
 * translation table in between.
 */
import { signedFetch, type MessageSigner } from "@/lib/api/signed";

export type AnomalyKind =
  | "malformed_row"
  | "unknown_bib"
  | "ambiguous_bib"
  | "duplicate_bib"
  | "not_claimed"
  | "already_final"
  | "impossible_time";

export type AnomalySeverity = "reverts" | "wrong";

export interface Anomaly {
  kind: AnomalyKind;
  /** A sentence written for an organiser. Shown as it is; never the `kind`. */
  reason: string;
  severity: AnomalySeverity;
}

/** What a row asks the contract to do. `null` only for a malformed row. */
export type ResultKind = "timed" | "untimed" | "dnf";

export interface ReviewedRow {
  line: number;
  bibNo: number | null;
  categoryId: number | null;
  finishTimeS: number | null;
  kind: ResultKind | null;
  /** Resolved from the index. `null` whenever an anomaly prevented resolution. */
  tokenId: number | null;
  /** The record's current on-chain state, when one was found. */
  state: string | null;
  anomalies: Anomaly[];
}

export interface ResultsReview {
  rows: ReviewedRow[];
  /** Rows with no anomalies: the only ones this console may publish. */
  publishable: ReviewedRow[];
  counts: Record<AnomalyKind, number> & { total: number; publishable: number };
}

/**
 * Mirrors `MAX_CSV_BYTES` in `be/src/routes/results.ts`. Checked here only to
 * save the organiser a wallet prompt and an upload; the limit that counts is
 * still the server's.
 */
export const MAX_CSV_BYTES = 5 * 1024 * 1024;

export async function previewResults({
  eventId,
  csv,
  address,
  sign,
}: {
  eventId: number;
  csv: Uint8Array<ArrayBuffer>;
  address: string;
  sign: MessageSigner;
}): Promise<ResultsReview> {
  return signedFetch<ResultsReview>({
    path: `/events/${eventId}/results/preview`,
    method: "POST",
    address,
    sign,
    body: csv,
    contentType: "text/csv",
  });
}

/** Every row the review would not let through, in file order. */
export function heldRows(review: ResultsReview): ReviewedRow[] {
  return review.rows.filter((row) => row.anomalies.length > 0);
}

/**
 * The worst thing a row would do if it were sent. `wrong` outranks `reverts`
 * because a false record cannot be undone and a refused transaction can simply
 * be sent again.
 */
export function worstSeverity(row: ReviewedRow): AnomalySeverity | null {
  if (row.anomalies.some((anomaly) => anomaly.severity === "wrong")) return "wrong";
  if (row.anomalies.length > 0) return "reverts";
  return null;
}

/** How many runners finished with a time, with none, and how many did not finish. */
export function publishableByKind(review: ResultsReview): Record<ResultKind, number> {
  const counts: Record<ResultKind, number> = { timed: 0, untimed: 0, dnf: 0 };
  for (const row of review.publishable) {
    if (row.kind) counts[row.kind] += 1;
  }
  return counts;
}
