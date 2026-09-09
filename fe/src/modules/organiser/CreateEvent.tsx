"use client";

/**
 * STE-17 — creating an event: decide, lay it out, then sign the lot.
 *
 * ## Why four steps and not six
 *
 * It used to be six, and four of them were about our plumbing rather than the
 * race: publish a file, create the event, add each distance, open for entries.
 * That mirrored the transactions exactly, which is the wrong thing to mirror.
 * An organiser has two jobs — describe the race, and approve what that costs —
 * and the transactions are how we deliver the second one.
 *
 * So the wizard is now what somebody actually does: fill in the race, lay out
 * the distances, say what is in the race pack, read it back and sign. The signatures themselves did not go
 * anywhere. There are still three plus one per distance, because a transaction
 * carries one contract call and `add_category` needs an event id that does not
 * exist until `create_event` lands. They are listed before the first one is
 * asked for and ticked off as they land (`run.ts`, `useEventRun.ts`).
 *
 * ## Why the distances come before the details file
 *
 * Forced, not chosen. Each distance has its own start time, the contract has no
 * field for one, so the times live in the details file. That file is hashed and
 * committed by `create_event`, which runs before any `add_category`. So the
 * distances must be *known* before the file is built, even though they are
 * *written* afterwards.
 *
 * Events are born `Draft`, which is what makes stopping halfway safe: until the
 * last signature nobody can enter, so an abandoned run leaves an invisible
 * event rather than a broken one.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Stepper } from "@/components/elements/Stepper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WalletGate } from "@/components/layouts/WalletGate";
import { useEventRun } from "@/hooks/useEventRun";
import { buildEventDocument, documentHash } from "@/lib/event-document";
import { countryName, provinceName } from "@/lib/places";

import {
  EMPTY_CATEGORY,
  StepCategoryPlan,
  categoryProblem,
  type PlannedCategory,
} from "./component/StepCategoryPlan";
import { StepAddOns, addOnProblem, type PlannedAddOn } from "./component/StepAddOns";
import { StepDone } from "./component/StepDone";
import { StepDetails, EMPTY_DETAILS, type EventDetails } from "./component/StepDetails";
import { StepReview } from "./component/StepReview";
import { focusField, incoherentDates, missingDetails, type Missing } from "./missing";

const STEPS = [
  { id: "details", label: "Details" },
  { id: "distances", label: "Distances" },
  { id: "add-ons", label: "Add-ons" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
] as const;
type Step = (typeof STEPS)[number]["id"];

export function CreateEvent() {
  return (
    <WalletGate>
      <Wizard />
    </WalletGate>
  );
}

function Wizard() {
  const [step, setStep] = useState<Step>("details");
  const [details, setDetails] = useState<EventDetails>(EMPTY_DETAILS);
  const [plan, setPlan] = useState<PlannedCategory[]>([{ ...EMPTY_CATEGORY }]);
  const [showPlanProblems, setShowPlanProblems] = useState(false);
  /**
   * Add-ons start empty, and staying empty is a normal way to finish. A race
   * that hands out nothing but a bib is still a race.
   */
  const [addOns, setAddOns] = useState<PlannedAddOn[]>([]);
  const [showAddOnProblems, setShowAddOnProblems] = useState(false);

  /**
   * What goes on chain as `starts_at`: the first wave off the line. The event
   * has one timestamp and the race has several, so the earliest is the only one
   * that is true of the event as a whole.
   */
  const startsAt = useMemo(() => earliestStart(details.raceDate, plan), [details.raceDate, plan]);

  const planProblems = plan.filter((category) => categoryProblem(category) !== null).length;
  /**
   * Continue is never disabled. A greyed out button with no reason is a dead
   * end: you can see it, you cannot tell what is wrong, and there is nothing to
   * press to find out. Pressing it and landing on the empty field answers the
   * question in one action, and the messages appear only once somebody has
   * asked, so a form nobody has touched yet is not already covered in red.
   *
   * Contradictions are the exception, and shown straight away. An empty field
   * may simply be one the organiser has not reached; two dates that cannot both
   * be true are already wrong, and the person is looking at both of them at the
   * moment they become wrong. Holding that back until Continue means raising it
   * after they have moved on to something else.
   */
  const missing = useMemo(() => missingDetails(details), [details]);
  const clashes = useMemo(() => incoherentDates(details), [details]);
  const [askedToContinue, setAskedToContinue] = useState(false);
  const errors = {
    ...(askedToContinue ? asMessages(missing) : {}),
    ...asMessages(clashes),
  };

  function continueFromDetails() {
    if (missing.length === 0) {
      setStep("distances");
      return;
    }
    setAskedToContinue(true);
    focusField(missing[0]!.focusId);
  }

  function continueFromDistances() {
    if (planProblems === 0 && plan.length > 0) {
      setStep("add-ons");
      return;
    }
    setShowPlanProblems(true);
  }

  function continueFromAddOns() {
    if (addOns.every((addOn) => addOnProblem(addOn) === null)) {
      setStep("review");
      return;
    }
    setShowAddOnProblems(true);
  }

  /**
   * A distance renamed after an add-on was ticked would leave that add-on
   * pointing at a code nobody can enter, and the document is permanent. Rather
   * than repairing references, the ticks are read through the distances that
   * currently exist, so a rename simply unticks and the organiser is told by
   * the same message that catches an add-on nobody receives.
   */
  const liveAddOns = useMemo(() => {
    const codes = new Set(plan.map((category) => category.code.trim()).filter(Boolean));
    return addOns.map((addOn) => ({
      ...addOn,
      includedIn: addOn.includedIn.filter((code) => codes.has(code)),
    }));
  }, [addOns, plan]);

  // Derived, not stored. The text on screen is always the text its hash covers,
  // with no effect in between that could leave the two out of step for a render.
  const documentText = useMemo(
    () =>
      startsAt === null
        ? ""
        : buildEventDocument({
            startsAt,
            description: details.description,
            locationName: details.place.venue,
            // Names, not ids: the file is read by people and by other clients,
            // and an id only means something next to the dataset that made it.
            city: details.place.city,
            province:
              provinceName(details.place.country, Number(details.place.provinceId)) ??
              details.place.provinceId,
            country: countryName(details.place.country) ?? "",
            countryCode: details.place.country,
            locationLink: details.locationLink,
            posterUrl: details.posterUrl,
            waiverUrl: details.waiverUrl,
            instagram: details.instagram,
            website: details.website,
            registrationOpens: toIso(details.registrationOpens),
            registrationCloses: toIso(details.registrationCloses),
            racepackFrom: details.racepack.from,
            racepackTo: details.racepack.to,
            racepackOpens: details.racepack.opens,
            racepackCloses: details.racepack.closes,
            racepackVenue: details.racepackVenue,
            racepackVenueLink: details.racepackVenueLink,
            raceDate: details.raceDate,
            addOns: liveAddOns.map((addOn) => ({
              name: addOn.name,
              photoUrl: addOn.photoUrl,
              includedIn: addOn.includedIn,
              sizes: addOn.sized ? addOn.sizes : [],
            })),
            categories: plan.map((category) => ({
              code: category.code,
              startTime: category.startTime,
              cutOff: category.cutOff,
            })),
          }),
    [details, liveAddOns, plan, startsAt],
  );

  // Hashing is async (crypto.subtle), so it is a query keyed by the exact text
  // rather than an effect writing into state.
  const { data: hash = "" } = useQuery({
    queryKey: ["event-document-hash", documentText],
    queryFn: () => documentHash(documentText),
    enabled: documentText.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const run = useEventRun({ name: details.name, plan, startsAt, documentText, hash });


  /*
    Done is derived, not navigated to. Finishing the run is not a move the
    organiser made, and there is no way back out of it, so storing it as
    another value of `step` would mean two sources of truth for one fact that
    the run already owns. It also keeps Review from having to know there is a
    step after it.
  */
  const shownStep: Step = run.isComplete && run.eventId !== null ? "done" : step;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-12">
      <header>
        <Link href="/org" className="text-sm text-teal-500 underline underline-offset-4">
          Organiser console
        </Link>
        <h1 className="heading-hero mt-3 text-4xl text-ink">New event</h1>
        <p className="mt-2 max-w-2xl text-base text-n-600">
          Describe the race, lay out the distances, then approve it. Nothing here can be edited or
          deleted afterwards, so the review comes last and it is worth reading.
        </p>
      </header>

      <Stepper steps={STEPS} current={shownStep} />

      <Card className="px-6">
        {shownStep === "details" ? (
          <>
            <StepDetails details={details} onChange={setDetails} errors={errors} />
            <div className="mt-8 flex justify-end">
              <Button onClick={continueFromDetails}>Continue</Button>
            </div>
          </>
        ) : null}

        {shownStep === "distances" ? (
          <>
            <StepCategoryPlan
              categories={plan}
              onChange={setPlan}
              showProblems={showPlanProblems}
            />
            <div className="mt-8 flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onClick={() => setStep("details")}>
                Back
              </Button>
              <Button onClick={continueFromDistances}>Continue</Button>
            </div>
          </>
        ) : null}

        {shownStep === "add-ons" ? (
          <>
            <StepAddOns
              addOns={addOns}
              categories={plan}
              onChange={setAddOns}
              showProblems={showAddOnProblems}
            />
            <div className="mt-8 flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onClick={() => setStep("distances")}>
                Back
              </Button>
              <Button onClick={continueFromAddOns}>Continue</Button>
            </div>
          </>
        ) : null}

        {shownStep === "review" ? (
          <>
            <StepReview
              details={details}
              plan={plan}
              addOns={liveAddOns}
              startsAt={startsAt}
              documentText={documentText}
              hash={hash}
              run={run}
              /*
                Going back is offered only while nothing has been signed, which
                the step decides for itself. Once the first transaction has
                landed the form no longer describes what exists, and editing it
                would silently change the document whose fingerprint is already
                on chain.
              */
              onBack={() => setStep("add-ons")}
            />
          </>
        ) : null}

        {shownStep === "done" && run.eventId !== null ? (
          <StepDone eventId={run.eventId} eventName={details.name.trim()} />
        ) : null}
      </Card>
    </div>
  );
}

/** Field key to message, in the shape `StepDetails` marks its inputs with. */
function asMessages(problems: Missing[]): Record<string, string> {
  return Object.fromEntries(problems.map((item) => [item.field, item.message]));
}

/**
 * The race date plus the earliest distance's start time, in seconds.
 *
 * Null until both halves exist, which is what keeps the document from being
 * built against a day with no times on it.
 */
function earliestStart(raceDate: string, plan: PlannedCategory[]): bigint | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) return null;

  const times = plan
    .map((category) => category.startTime)
    .filter((time) => /^\d{2}:\d{2}$/.test(time))
    .sort();
  const earliest = times[0];
  if (!earliest) return null;

  const ms = new Date(`${raceDate}T${earliest}`).getTime();
  return Number.isNaN(ms) ? null : BigInt(Math.floor(ms / 1000));
}

/** `datetime-local` is wall-clock time with no zone; the browser's own is meant. */
function toIso(local: string): string {
  if (!local) return "";
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
