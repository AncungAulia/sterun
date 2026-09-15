"use client";

/**
 * The last step: read the race back, then sign the run that creates it.
 *
 * ## Why the review is the event page itself
 *
 * The screen before this one used to be a wall of the document's raw text,
 * and after that a summary in the organiser's own terms: a date, a city, a
 * table of distances. Both asked the organiser to imagine the page runners
 * would get. The summary was also a second rendering of the same facts, and it
 * drifted from the first one without anybody noticing: the description lost
 * its line breaks there while the public page kept them.
 *
 * So the review now draws `EventView`, the component `/events/[id]` draws,
 * fed with what the run is about to write (`modules/organiser/preview.ts`).
 * Whatever the organiser checks here is what runners will see, down to the
 * tabs, because there is only one page. The Verification tab is the one part
 * that cannot be shown yet, since there is nothing published to check against,
 * so it says what it will be for and nothing else.
 *
 * ## Why the whole run happens in a dialog
 *
 * There are three signatures plus one per distance, and that number cannot be
 * reduced (see `run.ts`). Prompts nobody mentioned feel like a retry loop;
 * prompts shown as a numbered list that ticks off feel like a task with an end.
 *
 * The list used to sit in a panel on the page, where it was one more block to
 * scroll past. It is the single thing here that must be read before anything
 * irreversible happens, so it interrupts instead: Create event opens a dialog,
 * the dialog says how many prompts are coming and what each is, and starting is
 * a second deliberate press.
 *
 * The dialog then stays for the run itself. Once signing starts there is
 * nothing else to do on this page, wallet prompts are already stealing focus,
 * and a progress list behind a scroll position is a progress list nobody is
 * watching. It closes on its own when the run finishes, because at that point
 * the page has somewhere to send you.
 *
 * The list is the same object the run walks, so what is described and what
 * happens cannot drift apart.
 */
import { CheckIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Receipt } from "@/components/elements/Receipt";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWallet } from "@/hooks/useWallet";
import { EventView } from "@/modules/event-detail/EventView";
import type { useEventRun } from "@/hooks/useEventRun";

import { previewEvent } from "../preview";
import { DocumentFallback } from "./DocumentFallback";
import type { PlannedAddOn } from "./StepAddOns";
import type { PlannedCategory } from "./StepCategoryPlan";
import type { EventDetails } from "./StepDetails";

interface StepReviewProps {
  details: EventDetails;
  plan: PlannedCategory[];
  addOns: PlannedAddOn[];
  startsAt: bigint | null;
  documentText: string;
  hash: string;
  run: ReturnType<typeof useEventRun>;
  /** Offered only while nothing has been signed. See `CreateEvent.tsx`. */
  onBack: () => void;
}

export function StepReview({
  details,
  plan,
  addOns,
  startsAt,
  documentText,
  hash,
  run,
  onBack,
}: StepReviewProps) {
  const organiser = useWallet((state) => state.address) ?? "";
  const started = run.done.length > 0 || run.isRunning || run.failure !== null;
  const preview = useMemo(
    () =>
      previewEvent({ name: details.name, organiser, startsAt, hash, plan, addOns, documentText }),
    [details.name, organiser, startsAt, hash, plan, addOns, documentText],
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="heading text-xl text-foreground">Check the race, then create it</h2>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          This is your event page as runners will see it once entries open. None of it can be
          changed once the event exists, so it is worth reading once more.
        </p>
      </div>

      {preview ? (
        <section
          aria-label="Preview of your event page"
          className="flex flex-col gap-8 rounded-xl border border-dashed border-n-300 bg-background p-4 sm:p-6"
        >
          <p className="text-sm text-n-500">
            Preview. Nobody can enter until the event is created.
          </p>
          <EventView
            event={preview.event}
            categories={preview.categories}
            document={preview.document}
            addOns={preview.addOns}
            proofs={<PreviewProofs />}
            preview
          />
        </section>
      ) : (
        <p className="text-base text-muted-foreground">
          The preview needs a race date and a start time for at least one distance.
        </p>
      )}

      {run.isComplete ? null : (
        <div className="flex flex-wrap justify-end gap-3">
          {started ? null : (
            <Button variant="secondary" onClick={onBack}>
              Back
            </Button>
          )}
          <RunDialog run={run} documentText={documentText} hash={hash} started={started} />
        </div>
      )}
    </div>
  );
}

/**
 * The Verification tab, before there is an event to verify.
 *
 * On the published page this tab tells a runner whether the details being
 * served are the ones the organiser published. Nothing is published yet, so all
 * it can do is say what the tab will be for.
 *
 * It used to print the file itself, with the first half of its fingerprint
 * under it. Neither meant anything to the person reading this screen: the
 * organiser has just typed all of it into the form above, and a page of braces
 * is not how anybody checks their own race. What an auditor compares lives on
 * the published page, which is where somebody actually doubting the claim looks.
 */
function PreviewProofs() {
  return (
    <p className="max-w-2xl text-base text-n-600">
      Once the event is created, this tab lets runners check that your race details have not
      changed since you published them.
    </p>
  );
}

/**
 * The run, from "are you sure" to the last signature, in one dialog.
 *
 * Three states, one list. Before it starts the list is a warning: this many
 * prompts, in this order. During the run the same list ticks off. When it stops
 * the failure sits under it with the way out, and the button becomes Carry on,
 * which resumes at the first step that has not landed rather than repeating one
 * that has.
 *
 * It cannot be dismissed while signing. A dialog that closes mid-run leaves
 * somebody watching a wallet prompt with no idea what it belongs to.
 */
function RunDialog({
  run,
  documentText,
  hash,
  started,
}: {
  run: ReturnType<typeof useEventRun>;
  documentText: string;
  hash: string;
  started: boolean;
}) {
  const [requested, setRequested] = useState(false);
  /**
   * Derived rather than closed by an effect. Once everything has landed what
   * happens next is on the page, not in here, and a `setState` in an effect to
   * say so is a second render that exists only to undo the first.
   */
  const open = requested && !run.isComplete;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (run.isRunning) return;
        setRequested(next);
      }}
    >
      <Button onClick={() => setRequested(true)}>{started ? "Carry on" : "Create event"}</Button>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto"
        onInteractOutside={(event) => {
          if (run.isRunning) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (run.isRunning) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {started
              ? `Step ${Math.min(run.done.length + 1, run.steps.length)} of ${run.steps.length}`
              : `Your wallet will ask you ${run.steps.length} times`}
          </DialogTitle>
          <DialogDescription>
            {started
              ? "Keep this open until it finishes. Your wallet will ask again for each line left."
              : "One prompt for each line below, one after another. Nothing here can be edited or deleted afterwards."}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-2 py-2">
          {run.steps.map((step, index) => {
            const isDone = run.done.includes(step.id);
            const isCurrent = run.current === step.id;
            const failed = run.failure?.stepId === step.id;
            return (
              <li key={step.id} className="flex flex-wrap items-center gap-3 text-base">
                <span className="numeric w-5 text-muted-foreground">{index + 1}</span>
                <span className={isDone ? "text-muted-foreground" : "text-foreground"}>
                  {step.label}
                </span>
                {isDone ? (
                  <span className="inline-flex items-center gap-1 text-sm text-success">
                    <CheckIcon aria-hidden="true" className="size-4" />
                    Done
                  </span>
                ) : null}
                {isCurrent ? (
                  <span className="text-sm text-teal-500">
                    {run.waitingFor === "network" ? "Working on it" : "Check your wallet"}
                  </span>
                ) : null}
                {failed ? <span className="text-sm text-danger">Stopped here</span> : null}
                {run.receipts[step.id] ? <Receipt txHash={run.receipts[step.id]!} /> : null}
              </li>
            );
          })}
        </ol>

        {run.failure ? (
          <div
            role="alert"
            className="rounded-lg border border-danger-border bg-danger-surface px-5 py-4"
          >
            <p className="heading-strong text-base text-danger">
              Stopped at step {stepNumber(run)}
            </p>
            <p className="mt-1 text-base text-foreground">{run.failure.message}</p>
            <p className="mt-1 text-base text-foreground">
              {run.done.length === 0
                ? "Nothing has been created yet, so it is safe to try again."
                : "Everything above it is done and stays done. Carrying on picks up from here."}
            </p>
          </div>
        ) : null}

        {run.failure?.stepId === "document" ? (
          <DocumentFallback text={documentText} hash={hash} onChecked={run.useHostedDocument} />
        ) : null}

        {started ? null : (
          <p className="text-sm text-muted-foreground">
            Stopping partway is safe. Whatever is already done stays done, and you can carry on
            from where it stopped.
          </p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={run.isRunning}>
              {started ? "Close" : "Not yet"}
            </Button>
          </DialogClose>
          <Button onClick={() => void run.start()} disabled={run.isRunning}>
            {run.isRunning ? "Working" : started ? "Carry on" : "Start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Which line the run stopped on, counting the way the list is numbered. */
function stepNumber(run: ReturnType<typeof useEventRun>): number {
  return run.steps.findIndex((step) => step.id === run.failure?.stepId) + 1;
}
