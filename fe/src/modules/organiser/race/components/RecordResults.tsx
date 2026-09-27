"use client";

/**
 * The Results tab's one header action, and the run behind it.
 *
 * In the header because that is where every tab in this console keeps its
 * single action (`ConsoleHeader`), and it is read from `ResultsContext` because
 * the file it counts lives in the tab below.
 *
 * ## Three things this dialog must say, and one it must never
 *
 * It says the results are permanent, because they are: a recorded result is
 * terminal on chain and nobody can correct it afterwards. It says how many
 * times the wallet will ask, in the same words the create-race wizard uses. And
 * when a batch fails it says what landed, because those results exist whatever
 * the screen does next.
 *
 * What it must never say is "try again" over a run that partly landed. The
 * button is **Continue**, and it resumes at the first batch that has not been
 * recorded.
 */
import { CheckIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useResultsRun } from "../hooks/useResultsRun";
import { promptSentence, publishablePlan } from "../lib/publish-results";
import { useResultsContext } from "./ResultsContext";

export function RecordResults({ eventId }: { eventId: number }) {
  const { loaded } = useResultsContext();
  const [open, setOpen] = useState(false);

  const count = loaded?.review.publishable.length ?? 0;
  if (!loaded || count === 0) return null;

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        Sign and record {count.toLocaleString("en-US")} results
      </Button>
      {open ? <RunDialog eventId={eventId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function RunDialog({ eventId, onClose }: { eventId: number; onClose: () => void }) {
  const { loaded, markRecorded } = useResultsContext();
  const rows = loaded?.review.publishable ?? [];
  const run = useResultsRun({ eventId, rows });
  const [started, setStarted] = useState(false);

  const batches = publishablePlan(loaded!.review);
  const total = rows.length;

  function close(): void {
    if (run.running) return;
    if (run.recorded > 0) markRecorded();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent
        // While it runs there is no way out: closing would leave the organiser
        // with no idea which batches landed.
        showCloseButton={!run.running}
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>
            {run.isComplete
              ? `${run.recorded.toLocaleString("en-US")} results recorded`
              : started
                ? "Recording results"
                : `Record ${total.toLocaleString("en-US")} results?`}
          </DialogTitle>
          <DialogDescription>
            {run.isComplete
              ? "They are on each runner's race record now, and they are permanent."
              : started
                ? "Do not close this until it finishes."
                : "Each result is written to that runner's race record permanently. It cannot be changed, corrected or removed afterwards, by anyone."}
          </DialogDescription>
        </DialogHeader>

        {!started ? (
          <p className="text-sm text-n-600">
            {promptSentence(batches)}, once per batch of runners. You can stop between batches;
            whatever has already been recorded stays recorded.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {run.batches.map((batch) => (
              <li
                key={batch.label}
                className="flex items-center gap-3 border-t border-n-100 py-2 text-sm first:border-t-0"
              >
                <span aria-hidden="true" className="flex size-5 items-center justify-center">
                  {batch.state === "done" ? (
                    <CheckIcon className="size-4 text-success" />
                  ) : batch.state === "running" ? (
                    <LoaderCircleIcon className="size-4 animate-spin text-teal" />
                  ) : (
                    <span className="size-3.5 rounded-full border-2 border-n-300" />
                  )}
                </span>
                <span className="flex flex-col">
                  <span className="text-ink">{batch.label}</span>
                  <span className="numeric text-xs text-n-500">
                    {batch.state === "done"
                      ? "Recorded"
                      : batch.state === "running"
                        ? "Waiting for your wallet"
                        : "Not sent"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {run.error ? (
          <div className="flex flex-col gap-1 rounded-lg border border-warning-border bg-warning-surface px-4 py-3">
            <p className="heading-strong text-sm text-ink">
              {run.recorded > 0
                ? `Stopped after ${run.recorded.toLocaleString("en-US")} results`
                : "Nothing was recorded"}
            </p>
            <p className="text-sm text-n-700">{run.error}</p>
            {run.recorded > 0 ? (
              <p className="text-sm text-n-700">
                Those {run.recorded.toLocaleString("en-US")} are permanent. The remaining{" "}
                {run.left.toLocaleString("en-US")} were not sent, and nothing about them changed.
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          {run.isComplete ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close} disabled={run.running}>
                {run.recorded > 0 ? "Close" : "Cancel"}
              </Button>
              <Button
                disabled={run.running}
                onClick={() => {
                  setStarted(true);
                  void run.start();
                }}
              >
                {run.running ? "Recording..." : run.recorded > 0 ? "Continue" : "Start"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
