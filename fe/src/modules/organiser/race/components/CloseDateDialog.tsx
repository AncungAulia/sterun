"use client";

/**
 * Moving the date entries stop on, with the announcement in the same form
 * (STE-69).
 *
 * The same shape as adding entries (STE-57), because it is the same kind of
 * change: a number runners have already read moves, the chain records that it
 * moved, and **the chain cannot record that anybody was told**. So one form
 * carries the new date, the sentence the page writes from the two dates, and an
 * optional note; one press runs all three signatures.
 *
 * Two things this dialog says that the quota one does not have to:
 *
 * - **A date already gone stops entries the moment it is signed.** That is a
 *   hint under the field, not a panel: it is information, not an alarm.
 * - **The bound is race pack collection**, where the document names one.
 *   Handing packs out while entries are still open means somebody paying for a
 *   race whose pack has already gone out.
 *
 * The plan is frozen at the press, as it is there: the date is read again once
 * it lands, and a sentence still built from the live date would rewrite itself
 * halfway through its own run.
 */
import { MegaphoneIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateTimeField } from "@/components/form/DateTimeField";
import { useNowSeconds } from "@/hooks/useNowSeconds";
import { TextAreaField } from "@/components/form/Field";
import type { EventSummary } from "@/lib/event/events";
import { formatEventDateTimeLong } from "@/utils/format";

import { announcementBody, maxNoteLength } from "../lib/add-places";
import type { AnnouncedState, AnnouncedStep } from "../lib/announced-change";
import { isAnnouncedDone } from "../lib/announced-change";
import { closeDateBound, closeDateProblem, closeDateSentence, type CloseDateBound } from "../lib/close-date";
import { useCloseDate, type CloseDatePlan } from "../hooks/useCloseDate";
import type { EventMetadata } from "@/lib/event/metadata";
import { RunStep, type RunStepState } from "./RunStep";

const STEP_ORDER: readonly AnnouncedStep[] = ["sign", "apply", "publish"];

const STEP_LABEL: Record<AnnouncedStep, string> = {
  sign: "Sign the announcement",
  apply: "Move the date",
  publish: "Publish the announcement",
};

/** `YYYY-MM-DDTHH:mm` in local time, which is what `DateTimeField` reads. */
function toFieldValue(seconds: bigint | null): string {
  if (seconds === null) return "";
  const date = new Date(Number(seconds) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const readable = (date: Date) => formatEventDateTimeLong(BigInt(Math.floor(date.getTime() / 1000)));

export interface CloseDateDialogProps {
  summary: EventSummary;
  /** The date on chain now, or null on a race that has never had one. */
  closesAt: bigint | null;
  metadata: EventMetadata | null;
  onClose: () => void;
}

export function CloseDateDialog({ summary, closesAt, metadata, onClose }: CloseDateDialogProps) {
  const nowS = useNowSeconds();
  const { state, start, reset, movePhase } = useCloseDate();
  const [value, setValue] = useState(() => toFieldValue(closesAt));
  const [note, setNote] = useState("");
  const [frozen, setFrozen] = useState<CloseDatePlan | null>(null);

  const running = state.running !== null;
  const stranded = state.applied && !state.published;
  const locked = running || stranded;

  function close(): void {
    if (locked) return;
    reset();
    setFrozen(null);
    onClose();
  }

  const { event } = summary;
  const bound = closeDateBound(event.startsAt, metadata);
  const chosen = value ? new Date(value) : null;
  const problem = closeDateProblem(chosen, bound, readable);
  const sentence =
    chosen && !problem ? closeDateSentence(event.name, closesAt, chosen, readable) : "";
  /*
    `useNowSeconds`, not `Date.now()` in the render body: the React Compiler
    lint refuses an impure read here, and it is right to. The clock is
    `undefined` on the first render, which simply means the hint waits a beat
    rather than guessing.
  */
  const passed =
    chosen !== null && !problem && nowS !== undefined && BigInt(Math.floor(chosen.getTime() / 1000)) <= nowS;

  const plan: CloseDatePlan | null =
    chosen && !problem
      ? {
          eventId: event.eventId,
          organiser: event.organiser,
          closesAt: BigInt(Math.floor(chosen.getTime() / 1000)),
          body: announcementBody(sentence, note),
        }
      : null;

  function go(target: CloseDatePlan | null, from: AnnouncedState): void {
    if (!target) return;
    setFrozen(target);
    void start(target, from);
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent showCloseButton={!locked} className="sm:max-w-lg">
        {frozen === null ? (
          <Form
            hasDate={closesAt !== null}
            current={closesAt}
            value={value}
            onValue={setValue}
            note={note}
            onNote={setNote}
            problem={problem}
            passed={passed}
            sentence={sentence}
            bound={bound}
            onCancel={close}
            onSubmit={() => go(plan, state)}
          />
        ) : (
          <Steps
            state={state}
            eventId={event.eventId}
            movePhase={movePhase}
            onRetry={() => go(frozen, state)}
            onBack={() => {
              reset();
              setFrozen(null);
            }}
            onClose={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Form({
  hasDate,
  current,
  value,
  onValue,
  note,
  onNote,
  problem,
  passed,
  sentence,
  bound,
  onCancel,
  onSubmit,
}: {
  hasDate: boolean;
  current: bigint | null;
  value: string;
  onValue: (value: string) => void;
  note: string;
  onNote: (value: string) => void;
  problem: string | null;
  passed: boolean;
  sentence: string;
  bound: CloseDateBound;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const limit = readable(new Date(bound.latest * 1000));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem) onSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle className="heading-strong text-xl text-ink">
          {hasDate ? "Change when entries close" : "Set when entries close"}
        </DialogTitle>
        <DialogDescription className="text-base text-n-600">
          {current === null
            ? "After this date nobody can enter, whatever this race's status says."
            : `Entries close on ${formatEventDateTimeLong(current)}. A later date opens them again; an earlier one stops them sooner.`}
        </DialogDescription>
      </DialogHeader>

      <DateTimeField
        id="new-close-date"
        label="New closing date"
        value={value}
        onChange={onValue}
        error={problem ?? undefined}
        hint={
          problem
            ? undefined
            : passed
              ? "That date has passed, so entries stop as soon as you sign."
              : bound.reason === "racepack"
                ? `Race pack collection starts ${limit}, so entries have to close before then.`
                : `Race day is ${limit}, so entries have to close before then.`
        }
        endMonth={new Date(bound.latest * 1000)}
      />

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Announcement</p>
        {/* A note, not an alert: nothing is wrong, it is text the page wrote. */}
        <Alert variant="accent" role="note">
          <MegaphoneIcon aria-hidden="true" />
          <AlertTitle className="text-sm font-normal text-teal-600">Written for you</AlertTitle>
          <AlertDescription className="text-base">
            {sentence || "Choose a date and this sentence will say what changed."}
          </AlertDescription>
        </Alert>
      </div>

      <TextAreaField
        id="close-date-note"
        label="Add a note (optional)"
        rows={3}
        value={note}
        maxLength={maxNoteLength(sentence)}
        placeholder="For example, why the date is moving"
        onChange={onNote}
      />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={Boolean(problem)}>
          Sign and publish
        </Button>
      </DialogFooter>
    </form>
  );
}

function Steps({
  state,
  eventId,
  movePhase,
  onRetry,
  onBack,
  onClose,
}: {
  state: AnnouncedState;
  eventId: number;
  movePhase: "idle" | "signing" | "confirming";
  onRetry: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const done = isAnnouncedDone(state);
  const stranded = state.applied && !state.published && state.running === null;

  let title = "Changing when entries close";
  let lead = "Your wallet will ask you 2 times.";
  if (done) {
    title = "Entries now close on the new date";
    lead = "Runners can read the announcement on the race page.";
  } else if (stranded && state.failed) {
    title = "Date moved, announcement not published";
    lead = "The date is in force. The announcement did not go up, so runners cannot see why yet.";
  } else if (state.failed) {
    title = "The date did not change";
    lead = "Nothing has changed for runners.";
  }

  function stepState(step: AnnouncedStep): RunStepState {
    if (state.running === step) return "running";
    if (state.failed?.step === step) return "failed";
    const landed =
      step === "sign" ? state.signed !== null : step === "apply" ? state.applied : state.published;
    return landed ? "done" : "waiting";
  }

  function detail(step: AnnouncedStep): string | undefined {
    if (state.failed?.step === step) return state.failed.message;
    if (state.running !== step) return undefined;
    if (step === "publish") return "Publishing";
    if (step === "apply" && movePhase === "confirming") return "Saving";
    return "Check your wallet";
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="heading-strong text-xl text-ink">{title}</DialogTitle>
        <DialogDescription className="text-base text-n-600">{lead}</DialogDescription>
      </DialogHeader>

      <ol className="flex flex-col gap-3 py-2">
        {STEP_ORDER.map((step, index) => (
          <RunStep
            key={step}
            number={index + 1}
            state={stepState(step)}
            label={STEP_LABEL[step]}
            detail={detail(step)}
          />
        ))}
      </ol>

      {done ? (
        <DialogFooter>
          <Button variant="outline" asChild>
            <Link href={`/events/${eventId}`} target="_blank" rel="noreferrer">
              See the race page
            </Link>
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      ) : stranded && state.failed ? (
        <DialogFooter>
          <Button onClick={onRetry}>Publish the announcement</Button>
        </DialogFooter>
      ) : state.failed ? (
        <DialogFooter>
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onRetry}>Try again</Button>
        </DialogFooter>
      ) : null}
    </>
  );
}
