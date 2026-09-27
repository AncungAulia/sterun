/**
 * Turning a reviewed file into signatures (STE-58). Pure, outside React, so the
 * rules below are testable without a wallet or a chain.
 *
 * ## What a batch is
 *
 * Since STE-60 the contract records up to `RECORD_RESULTS_MAX_BATCH` results in
 * one call, and a Stellar transaction carries exactly one contract call. So the
 * number of wallet prompts is the number of batches: 312 runners used to be 312
 * approvals and is now three.
 *
 * **Each batch is atomic on chain.** A batch either records every row in it or
 * records none, and a failure leaves the batches before it recorded and the
 * ones after it untouched. That is the fact the whole run screen is written
 * around, and the reason a stopped run says what landed instead of offering to
 * start again.
 *
 * ## Why the plan is frozen at the press
 *
 * The rows come from a review of one file. Re-reading the file, or re-running
 * the preview, between batches would change what "runners 121 to 240" means
 * halfway through a run the organiser is watching. The plan is built once, and
 * the only thing that changes it is a row turning out to be already recorded,
 * which `withoutRecorded` removes.
 */
import { chunkResults, RECORD_RESULTS_MAX_BATCH, type SterunResult } from "@sterunxyz/sdk";

import type { ResultsReview, ReviewedRow } from "./results-preview";

/** One wallet prompt: the rows it carries, and how the screen names it. */
export interface ResultBatch {
  results: SterunResult[];
  /**
   * "Runners 1 to 120", counting publishable rows rather than file lines. A
   * volunteer watching this screen is counting people, and a line number means
   * nothing to them once rows have been held.
   */
  label: string;
}

/**
 * A reviewed row as a contract call. Throws rather than guessing: a publishable
 * row always carries a `tokenId` and a `kind`, and a timed one always carries a
 * time, so a missing one is a bug in this app rather than a row to skip
 * silently. Silently skipping would leave a runner with no result and nothing
 * on screen saying so.
 */
export function toResult(row: ReviewedRow): SterunResult {
  if (row.tokenId === null || row.kind === null) {
    throw new Error(`row ${row.line} is not publishable: it has no record`);
  }
  if (row.kind === "timed") {
    if (row.finishTimeS === null) {
      throw new Error(`row ${row.line} is a finish time with no time`);
    }
    return { tokenId: row.tokenId, kind: "timed", finishTimeS: row.finishTimeS };
  }
  return { tokenId: row.tokenId, kind: row.kind };
}

/**
 * The batches, in file order, with the first runner numbered 1.
 *
 * `size` exists for the tests, which would otherwise need 121 fixture rows to
 * see a second batch. The default is the contract's own maximum, measured
 * against the live network rather than computed.
 */
export function planBatches(
  rows: readonly ReviewedRow[],
  size: number = RECORD_RESULTS_MAX_BATCH,
): ResultBatch[] {
  const results = rows.map(toResult);
  let first = 1;
  return chunkResults(results, size).map((batch) => {
    const last = first + batch.length - 1;
    const label = batch.length === 1 ? `Runner ${first}` : `Runners ${first} to ${last}`;
    first = last + 1;
    return { results: batch, label };
  });
}

/** Everything the file asks to record, whatever the review made of it. */
export function publishablePlan(review: ResultsReview, size?: number): ResultBatch[] {
  return planBatches(review.publishable, size);
}

/**
 * The rows still worth sending, given what the chain now says.
 *
 * Used when a run stopped without an answer. A transaction can land while the
 * browser hears nothing, so before continuing, the records are read again and
 * anything already carrying a result is dropped. Reading the chain rather than
 * trusting the error is the scanner's rule (STE-62), and it matters more here:
 * a second `record_finish` on a `Finished` record is refused, so a blind retry
 * would stop the run on a row that was never a problem.
 */
export function withoutRecorded(
  rows: readonly ReviewedRow[],
  recordedTokenIds: ReadonlySet<number>,
): ReviewedRow[] {
  return rows.filter((row) => row.tokenId === null || !recordedTokenIds.has(row.tokenId));
}

/**
 * "Your wallet will ask you 3 times", the sentence the create-race wizard
 * already uses. Counted from the batches rather than from the rows, because the
 * number the organiser is about to live through is prompts, not runners.
 */
export function promptSentence(batches: readonly ResultBatch[]): string {
  return batches.length === 1
    ? "Your wallet will ask you once"
    : `Your wallet will ask you ${batches.length} times`;
}

export { RECORD_RESULTS_MAX_BATCH };
