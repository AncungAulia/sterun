"use client";

/**
 * The last step: read the race back, then sign the run that creates it.
 *
 * ## Why this replaced a step that showed JSON
 *
 * The screen before this one used to be a wall of the document's raw text with
 * a Publish button under it. That asked the organiser to check something they
 * have no way to check — nobody proofreads their own race by reading
 * `"starts_at": "2026-10-31T23:00:00.000Z"` — and it asked them to know a file
 * exists at all, which is our plumbing, not their job (`fe/CLAUDE.md`: UI text
 * names the consequence, not the mechanism).
 *
 * So the same facts are shown as the race: a date they recognise, a city, the
 * distances with their start times. The file is still one click away for
 * anybody who wants it, because the fingerprint of those exact bytes is what
 * ends up on chain and somebody checking our claim should be able to see them.
 *
 * ## Why the signatures are listed in a dialog rather than on the page
 *
 * There are three of them plus one per distance, and that number cannot be
 * reduced (see `run.ts`). Prompts nobody mentioned feel like a retry loop;
 * prompts shown as a numbered list that ticks off feel like a task with an end.
 *
 * The list used to sit in a panel above the button, where it was one more block
 * to scroll past on a long page. It is the single thing here that has to be read
 * before anything irreversible happens, so it now interrupts: Create event opens
 * a dialog, the dialog says how many prompts are coming and what each one is,
 * and starting is a second deliberate press. Once the run begins the dialog
 * closes and the same list carries on ticking off in place, because a run that
 * stops needs room for what to do about it.
 *
 * The list is the same object the run walks, so what is described and what
 * happens cannot drift apart.
 */
import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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
import { EXPLORER_BASE } from "@/lib/env";
import { countryName, provinceName } from "@/lib/places";
import { formatEventDateTimeLong, formatPrice, parseStroops } from "@/utils/format";
import type { useEventRun } from "@/hooks/useEventRun";

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
  const [showFile, setShowFile] = useState(false);
  const started = run.done.length > 0 || run.isRunning || run.failure !== null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="heading text-xl text-foreground">Check the race, then create it</h2>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          This is everything runners will see. None of it can be changed once the event exists, so
          it is worth reading once more.
        </p>
      </div>

      <Summary details={details} plan={plan} addOns={addOns} startsAt={startsAt} />

      <div>
        <Button variant="ghost" onClick={() => setShowFile((open) => !open)}>
          {showFile ? "Hide the file" : "Show the file we will publish"}
        </Button>
        {showFile ? (
          <div className="mt-3">
            <p className="mb-2 max-w-2xl text-sm text-muted-foreground">
              This is what gets published, and its fingerprint is recorded with your event. Anybody
              can fetch it later and check the two still agree.
            </p>
            <pre className="numeric max-h-72 overflow-auto rounded-lg border border-border bg-muted p-4 text-sm text-foreground">
              {documentText}
            </pre>
            <p className="numeric mt-2 text-sm text-muted-foreground">
              Fingerprint {hash.slice(0, 16)}...
            </p>
          </div>
        ) : null}
      </div>

      {started ? <RunPanel run={run} /> : null}

      {run.failure ? (
        <div className="flex flex-col gap-4">
          <div role="alert" className="rounded-lg border border-danger-border bg-danger-surface px-5 py-4">
            <p className="heading-strong text-base text-danger">Stopped at step {stepNumber(run)}</p>
            <p className="mt-1 text-base text-foreground">{run.failure.message}</p>
            <p className="mt-1 text-base text-foreground">
              {run.done.length === 0
                ? "Nothing has been created yet, so it is safe to try again."
                : "Everything above it is done and stays done. Carrying on picks up from here."}
            </p>
          </div>
          {run.failure.stepId === "document" ? (
            <DocumentFallback
              text={documentText}
              hash={hash}
              onChecked={run.useHostedDocument}
              onSkip={run.skipDocument}
            />
          ) : null}
        </div>
      ) : null}

      {run.isComplete ? null : (
        <div className="flex flex-wrap justify-end gap-3">
          {started ? null : (
            <Button variant="secondary" onClick={onBack}>
              Back
            </Button>
          )}
          {started ? (
            <Button onClick={() => void run.start()} disabled={run.isRunning}>
              {run.isRunning ? "Working" : "Carry on"}
            </Button>
          ) : (
            <ConfirmDialog run={run} />
          )}
        </div>
      )}

      {run.isComplete && run.eventId !== null ? (
        <div className="rounded-lg border border-success-border bg-success-surface px-5 py-4">
          <p className="heading-strong text-lg text-success">
            The event is open. Write down number <span className="numeric">{run.eventId}</span>.
          </p>
          <p className="mt-1 text-base text-foreground">
            It is on the public list of races now, and people can enter.
          </p>
          <div className="mt-3">
            <Link
              href={`/events/${run.eventId}`}
              className="text-base text-teal-500 underline underline-offset-4"
            >
              Open the event page
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The race in the organiser's own terms, not the document's. */
function Summary({
  details,
  plan,
  addOns,
  startsAt,
}: {
  details: EventDetails;
  plan: PlannedCategory[];
  addOns: PlannedAddOn[];
  startsAt: bigint | null;
}) {
  const place = [
    details.place.venue,
    details.place.city,
    provinceName(details.place.country, Number(details.place.provinceId)),
    countryName(details.place.country),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-6">
        {details.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={details.posterUrl}
            alt="Poster"
            className="max-h-40 w-auto rounded-md border border-border object-contain"
          />
        ) : null}
        <div>
          <p className="heading-strong text-2xl text-foreground">{details.name}</p>
          <p className="numeric mt-1 text-base text-muted-foreground">
            {startsAt === null ? "" : formatEventDateTimeLong(startsAt)}
          </p>
          <p className="mt-1 text-base text-muted-foreground">{place}</p>
        </div>
      </div>

      <p className="max-w-2xl text-base text-foreground">{details.description}</p>

      <Rows>
        <Row label="Entries open">{when(details.registrationOpens)}</Row>
        <Row label="Entries close">{when(details.registrationCloses)}</Row>
        {details.racepack.from ? (
          <Row label="Race pack">
            {`${day(details.racepack.from)}${details.racepack.to ? ` to ${day(details.racepack.to)}` : ""}, ${details.racepack.opens} to ${details.racepack.closes}`}
            {details.racepackVenue ? `, ${details.racepackVenue}` : ""}
          </Row>
        ) : null}
        {details.instagram ? <Row label="Instagram">{details.instagram}</Row> : null}
        {details.website ? <Row label="Website">{details.website}</Row> : null}
        {details.waiverUrl ? (
          <Row label="Waiver">
            <a
              href={details.waiverUrl}
              target="_blank"
              rel="noreferrer"
              className="text-teal-500 underline underline-offset-4"
            >
              Open the waiver
            </a>
          </Row>
        ) : null}
      </Rows>

      <table className="w-full text-left text-base">
        <thead className="text-sm text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 font-normal">
              Distance
            </th>
            <th scope="col" className="py-2 font-normal">
              Start
            </th>
            <th scope="col" className="py-2 font-normal">
              Places
            </th>
            <th scope="col" className="py-2 font-normal">
              Entry fee
            </th>
          </tr>
        </thead>
        <tbody>
          {plan.map((category) => (
            <tr key={category.code} className="border-t border-border">
              <th scope="row" className="py-2 font-normal text-foreground">
                {category.code} <span className="text-muted-foreground">({category.km} km)</span>
              </th>
              <td className="numeric py-2 text-foreground">{category.startTime}</td>
              <td className="numeric py-2 text-foreground">{category.quota}</td>
              {/* `formatPrice` already carries the asset name, and says Free for zero. */}
              <td className="numeric py-2 text-foreground">
                {formatPrice(parseStroops(category.price || "0"))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {addOns.length > 0 ? <Pack addOns={addOns} /> : null}
    </div>
  );
}

/**
 * What each ticket buys, listed by item rather than by distance.
 *
 * By item because that is how it was entered and how it is stored, and because
 * one jersey line naming three distances is shorter to read than three
 * distances each repeating the jersey.
 */
function Pack({ addOns }: { addOns: PlannedAddOn[] }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="heading-strong text-base text-foreground">What runners get</p>
      {addOns.map((addOn, index) => {
        const sizes = addOn.sized ? addOn.sizes.filter((size) => size.label.trim()) : [];
        return (
          <div key={index} className="flex flex-wrap items-start gap-4">
            {addOn.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={addOn.photoUrl}
                alt={addOn.name}
                className="size-20 rounded-md border border-border object-contain"
              />
            ) : null}
            <div>
              <p className="text-base text-foreground">{addOn.name}</p>
              <p className="text-sm text-muted-foreground">
                Included in {addOn.includedIn.join(", ") || "no distance yet"}
              </p>
              {sizes.length > 0 ? (
                <p className="numeric text-sm text-muted-foreground">
                  Sizes {sizes.map((size) => size.label.trim()).join(", ")}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * What the wallet is about to ask for, and afterwards what it did ask for.
 *
 * One list in both states rather than two screens: the thing that makes six
 * prompts bearable is watching the list you were shown tick itself off.
 */
function RunPanel({ run }: { run: ReturnType<typeof useEventRun> }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border px-5 py-5">
      <p className="heading-strong text-base text-foreground">
        {run.isComplete
          ? "All done"
          : `Step ${run.done.length + 1} of ${run.steps.length}`}
      </p>

      <ol className="flex flex-col gap-2">
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
    </div>
  );
}

/**
 * The last thing between a form and four irreversible transactions.
 *
 * A dialog rather than a paragraph because of what it has to achieve: the
 * number of wallet prompts is the one fact that makes the next minute make
 * sense, and a paragraph on a long page is read by nobody. This cannot be
 * dismissed by accident either, which is the point of the second press.
 */
function ConfirmDialog({ run }: { run: ReturnType<typeof useEventRun> }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>Create event</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This takes {run.steps.length} signatures</DialogTitle>
          <DialogDescription>
            Your wallet will ask you once for each line below, one after another. Nothing here can
            be edited or deleted afterwards.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-2 py-2">
          {run.steps.map((step, index) => (
            <li key={step.id} className="flex items-center gap-3 text-base text-foreground">
              <span className="numeric w-5 text-muted-foreground">{index + 1}</span>
              {step.label}
            </li>
          ))}
        </ol>

        <p className="text-sm text-muted-foreground">
          Stopping partway is safe. Whatever is already done stays done, and you can carry on from
          where it stopped.
        </p>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Not yet</Button>
          </DialogClose>
          <Button
            onClick={() => {
              setOpen(false);
              void run.start();
            }}
          >
            Start signing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-2 text-base sm:grid-cols-[10rem_1fr]">{children}</dl>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </>
  );
}

function Receipt({ txHash }: { txHash: string }) {
  if (!EXPLORER_BASE) {
    return <span className="numeric text-sm text-muted-foreground">{txHash.slice(0, 12)}</span>;
  }
  return (
    <a
      href={`${EXPLORER_BASE}/tx/${txHash}`}
      target="_blank"
      rel="noreferrer"
      className="text-sm text-teal-500 underline underline-offset-4"
    >
      Receipt
    </a>
  );
}

/** Which line the run stopped on, counting the way the list is numbered. */
function stepNumber(run: ReturnType<typeof useEventRun>): number {
  return run.steps.findIndex((step) => step.id === run.failure?.stepId) + 1;
}

/** `YYYY-MM-DDTHH:mm` as something a person reads, or the raw value if it is not. */
function when(local: string): string {
  if (!local) return "";
  const ms = new Date(local).getTime();
  if (Number.isNaN(ms)) return local;
  return formatEventDateTimeLong(BigInt(Math.floor(ms / 1000)));
}

function day(value: string): string {
  const ms = new Date(`${value}T00:00`).getTime();
  if (Number.isNaN(ms)) return value;
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
