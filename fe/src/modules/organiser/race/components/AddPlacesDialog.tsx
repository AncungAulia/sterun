"use client";

/**
 * STE-57 - the dialog that adds places to one distance and announces it.
 *
 * Two faces. First the form: the number now, the new number, the sentence the
 * page writes from them and an optional note. Then, from the press on, the
 * three steps (mockup sections 2 to 4).
 *
 * It cannot be dismissed while a step runs, and it cannot be dismissed once
 * the places have landed but the announcement has not: that state is the one
 * the pairing exists to prevent, so its only button is Publish the
 * announcement. Before anything landed, a failure offers Back and Try again.
 */
import { CheckIcon, CircleAlertIcon, LoaderCircleIcon, MegaphoneIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Field, TextAreaField } from "@/components/form/Field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import type { EventStatus, SterunCategory } from "@sterunxyz/sdk";

import { useAddPlaces } from "../hooks/useAddPlaces";
import {
  STEP_ORDER,
  isDone,
  type AddPlacesPlan,
  type AddPlacesState,
  type AddPlacesStep,
} from "../lib/add-places-run";
import {
  announcementBody,
  doneLead,
  maxNoteLength,
  raiseSentence,
  readNewQuota,
} from "../lib/add-places";

const STEP_LABEL: Record<AddPlacesStep, string> = {
  sign: "Approve the announcement",
  raise: "Approve the new entries",
  publish: "Publish the announcement",
};

function count(value: number): string {
  return value.toLocaleString("en-US");
}

export interface AddPlacesDialogProps {
  category: SterunCategory | null;
  organiser: string;
  status: EventStatus;
  onClose: () => void;
}

export function AddPlacesDialog({ category, organiser, status, onClose }: AddPlacesDialogProps) {
  const { state, start, reset, raisePhase } = useAddPlaces();
  const [input, setInput] = useState("");
  const [note, setNote] = useState("");
  /*
    The plan is frozen at the press. Once the entries land the race is read
    again, and a plan still built from the live category would turn "500 to
    800" into "800 to 800" halfway through its own run.
  */
  const [frozen, setFrozen] = useState<AddPlacesPlan | null>(null);

  const running = state.running !== null;
  const stranded = state.raised && !state.published;
  const locked = running || stranded;

  function close() {
    if (locked) return;
    reset();
    setInput("");
    setNote("");
    setFrozen(null);
    onClose();
  }

  if (!category) return null;

  const read = readNewQuota(input, category.quota);
  const sentence = raiseSentence(category.code, category.quota, read.quota ?? 0);
  const plan =
    read.quota === null
      ? null
      : {
          eventId: category.eventId,
          categoryId: category.categoryId,
          organiser,
          newQuota: read.quota,
          body: announcementBody(sentence, note),
        };

  function go(target: AddPlacesPlan | null, from: AddPlacesState) {
    if (!target) return;
    setFrozen(target);
    void start(target, from);
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent showCloseButton={!locked} className="sm:max-w-lg">
        {frozen === null ? (
          <Form
            category={category}
            input={input}
            onInput={setInput}
            note={note}
            onNote={setNote}
            problem={read.problem}
            newQuota={read.quota}
            sentence={sentence}
            onCancel={close}
            onSubmit={() => go(plan, state)}
          />
        ) : (
          <Steps
            state={state}
            code={category.code}
            eventId={frozen.eventId}
            newQuota={frozen.newQuota}
            status={status}
            raisePhase={raisePhase}
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
  category,
  input,
  onInput,
  note,
  onNote,
  problem,
  newQuota,
  sentence,
  onCancel,
  onSubmit,
}: {
  category: SterunCategory;
  input: string;
  onInput: (value: string) => void;
  note: string;
  onNote: (value: string) => void;
  problem: string | null;
  newQuota: number | null;
  sentence: string;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (newQuota !== null) onSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle className="heading-strong text-xl text-ink">Add entries to {category.code}</DialogTitle>
        <DialogDescription className="text-base text-n-600">
          Entries can only go up. Every runner sees the announcement on the race page.
        </DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-2 gap-3">
        <Card className="gap-0 px-3 py-2 shadow-none">
          <dt className="text-sm text-n-500">Entries now</dt>
          <dd className="numeric text-lg font-semibold text-ink">{count(category.quota)}</dd>
        </Card>
        <Card className="gap-0 px-3 py-2 shadow-none">
          <dt className="text-sm text-n-500">Entered</dt>
          <dd className="numeric text-lg font-semibold text-ink">{count(category.enteredCount)}</dd>
        </Card>
      </dl>

      <Field
        id="new-quota"
        label="New number of entries"
        inputMode="numeric"
        autoComplete="off"
        value={input}
        onChange={(event) => onInput(event.target.value)}
        error={problem ?? undefined}
        hint={
          newQuota !== null
            ? `${count(newQuota - category.quota)} more entries. Bib numbers carry on from the last one.`
            : undefined
        }
      />

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Announcement</p>
        {/* A note, not an alert: nothing is wrong, it is text the page wrote. */}
        <Alert variant="accent" role="note">
          <MegaphoneIcon aria-hidden="true" />
          <AlertTitle className="text-sm font-normal text-teal-600">Written for you</AlertTitle>
          <AlertDescription className="text-base">
            {newQuota !== null ? sentence : `Entries for ${category.code} raised from ${count(category.quota)} to ?`}
          </AlertDescription>
        </Alert>
      </div>

      <TextAreaField
        id="announcement-note"
        label="Add a note (optional)"
        rows={3}
        value={note}
        maxLength={maxNoteLength(sentence)}
        placeholder="For example, why a second batch is opening"
        onChange={onNote}
      />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={newQuota === null}>
          Add entries and announce
        </Button>
      </DialogFooter>
    </form>
  );
}

function Steps({
  state,
  code,
  eventId,
  newQuota,
  status,
  raisePhase,
  onRetry,
  onBack,
  onClose,
}: {
  state: AddPlacesState;
  code: string;
  eventId: number;
  newQuota: number;
  status: EventStatus;
  raisePhase: "idle" | "signing" | "confirming";
  onRetry: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const done = isDone(state);
  const stranded = state.raised && !state.published && state.running === null;

  let title = `Adding entries to ${code}`;
  let lead = "Your wallet will ask you 2 times.";
  if (done) {
    title = `${code} now has ${count(newQuota)} entries`;
    lead = doneLead(code, status);
  } else if (stranded && state.failed) {
    title = "Entries added, announcement not published";
    lead = `${code} now has ${count(newQuota)} entries. The announcement did not go up, so runners cannot see why yet.`;
  } else if (state.failed) {
    title = "Entries not added";
    lead = "Nothing has changed for runners.";
  }

  function stepState(step: AddPlacesStep): "done" | "running" | "waiting" | "failed" {
    if (state.running === step) return "running";
    if (state.failed?.step === step) return "failed";
    const landed = step === "sign" ? state.signed !== null : step === "raise" ? state.raised : state.published;
    return landed ? "done" : "waiting";
  }

  function detail(step: AddPlacesStep): string | undefined {
    if (state.failed?.step === step) return state.failed.message;
    if (state.running !== step) return undefined;
    if (step === "publish") return "Publishing";
    if (step === "raise" && raisePhase === "confirming") return "Saving";
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
          <Step key={step} number={index + 1} state={stepState(step)} label={STEP_LABEL[step]} detail={detail(step)} />
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

function Step({
  number,
  state,
  label,
  detail,
}: {
  number: number;
  state: "done" | "running" | "waiting" | "failed";
  label: string;
  detail?: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "numeric mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-sm",
          state === "done" && "bg-success text-paper",
          state === "running" && "text-teal-500",
          state === "waiting" && "border border-n-300 text-n-500",
          state === "failed" && "bg-danger text-paper",
        )}
      >
        {state === "done" ? <CheckIcon className="size-4" /> : null}
        {state === "running" ? <LoaderCircleIcon className="size-5 animate-spin" /> : null}
        {state === "waiting" ? number : null}
        {state === "failed" ? <CircleAlertIcon className="size-4" /> : null}
      </span>
      <div>
        <p className="text-base text-ink">{label}</p>
        {detail ? (
          <p role={state === "failed" ? "alert" : undefined} className={cn("text-sm", state === "failed" ? "text-danger" : "text-n-500")}>
            {detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}
