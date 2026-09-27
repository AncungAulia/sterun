"use client";

/**
 * Walking the batches that record a finish list.
 *
 * The plan itself is built in `lib/publish-results.ts`; this performs it. Kept
 * out of the component for the reason the wizard's own run hook gives: the
 * thing worth testing is what happens when a batch fails, not the markup.
 *
 * ## What happens when one fails
 *
 * It stops, and every batch before it stays recorded. Those results are on
 * chain and terminal, so a screen that reset would be lying about what exists.
 * Pressing Continue resumes at the first batch that has not landed.
 *
 * ## No answer is not a failure, and one read settles it
 *
 * A transaction can land while the browser hears nothing. So a failed batch is
 * not believed: the chain is asked. And because **a batch is atomic** — every
 * row in it records or none does — asking about **one** of its runners answers
 * for all of them. That is one `recordOf` call rather than a hundred and
 * twenty, and it is the whole reason the check is affordable here.
 *
 * Without it, a resume would send `record_results` over a row that is already
 * `Finished`, the contract would refuse the entire batch, and the run would
 * stop for good on a row that was never a problem. This is the scanner's rule
 * from race day (STE-62): the truth is settled by asking the chain, never by
 * reading the error.
 *
 * The loop keeps its own copy of what has landed, because `setState` only takes
 * effect on the next render and the loop finishes inside one.
 */
import { useCallback, useMemo, useState } from "react";

import { useWallet } from "@/hooks/useWallet";
import { friendlyError } from "@/lib/api/errors";
import { readClient } from "@/lib/chain/sterun";
import { useRecordResults } from "@/modules/organiser/shared/hooks/useOrganiser";

import { planBatches, type ResultBatch } from "../lib/publish-results";
import type { ReviewedRow } from "../lib/results-preview";

export type BatchState = "waiting" | "running" | "done";

export interface RunBatch extends ResultBatch {
  state: BatchState;
}

/** A record that carries a result, whatever kind it is. */
const RECORDED = new Set(["Finished", "Dnf"]);

export function useResultsRun({ eventId, rows }: { eventId: number; rows: readonly ReviewedRow[] }) {
  const address = useWallet((state) => state.address);
  const recordResults = useRecordResults();

  const [landed, setLanded] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const batches = useMemo(() => planBatches(rows), [rows]);
  const recorded = useMemo(
    () => batches.slice(0, landed).reduce((sum, batch) => sum + batch.results.length, 0),
    [batches, landed],
  );
  const total = useMemo(
    () => batches.reduce((sum, batch) => sum + batch.results.length, 0),
    [batches],
  );

  const view: RunBatch[] = batches.map((batch, index) => ({
    ...batch,
    state: index < landed ? "done" : index === landed && running ? "running" : "waiting",
  }));

  const start = useCallback(async () => {
    if (!address || running || batches.length === 0) return;
    setRunning(true);
    setError(null);

    // The loop's own copy: see the note at the top.
    let done = landed;
    try {
      for (let index = done; index < batches.length; index += 1) {
        await recordResults.write({ eventId, results: batches[index]!.results });
        done += 1;
        setLanded(done);
      }
    } catch (cause) {
      const failed = batches[done];
      let alsoLanded = false;

      // One read, because the batch is atomic.
      if (failed) {
        try {
          const probe = await readClient.recordOf(failed.results[0]!.tokenId);
          alsoLanded = RECORDED.has(probe.state);
        } catch {
          // The node would not answer. What is on screen is still true: the
          // batches marked done landed, and this one is not claimed to have.
        }
      }

      if (alsoLanded) {
        done += 1;
        setLanded(done);
        // It went through; the organiser has nothing to fix and nothing to
        // read. Saying "something went wrong" over a batch that landed is how
        // somebody sends it twice.
        if (done < batches.length) setError(null);
      } else {
        setError(friendlyError(cause));
      }
    } finally {
      setRunning(false);
    }
  }, [address, batches, eventId, landed, recordResults, running]);

  return {
    batches: view,
    /** Results recorded so far. */
    recorded,
    /** Results not sent yet. */
    left: total - recorded,
    running,
    error,
    isComplete: batches.length > 0 && landed === batches.length,
    start,
  };
}
