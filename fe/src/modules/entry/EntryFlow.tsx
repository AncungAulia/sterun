"use client";

/**
 * `/events/[id]/enter`: from a race page to a paid entry (STE-21, round 1).
 *
 * Design: `docs/superpowers/specs/2026-09-15-entry-flow-design.md`. Mockup:
 * `2026-09-15-entry-flow-mockup.html`, blocks 1 to 4, 7 and 8.
 *
 * ## Two components, for the hooks' sake
 *
 * `EntryForm` reads and decides what to show before the form. `EntryReady` is
 * the form, mounted only once everything it needs has answered. The split is
 * what lets `useEntryAttempt` be called unconditionally with a real plan: a
 * hook cannot sit below an early return, and the plan cannot exist above one.
 *
 * ## What is read before the form
 *
 * The race, this wallet's records (from chain: they decide whether somebody
 * pays twice), the add-on stock and the race's document. Nothing is drawn until
 * all of them have answered, because a race pack that appears a second after
 * Continue was pressed is a jersey that was never reserved.
 *
 * ## The gates decide once
 *
 * Before the form, not during it. An entry that lands refreshes this wallet's
 * records and the race while the Sign and pay dialog is still on screen, and
 * re-deciding then swapped the page for "You're already entered", unmounting
 * the dialog before it could hand the runner their bib
 * (Ancung, 2026-09-15). Anything that changes after the form opened, a place
 * taken or an entry from another tab, is `enter`'s to refuse and the dialog's
 * to explain.
 *
 * ## What survives a reload
 *
 * The distance and the race pack and add-on choices, in sessionStorage, so an
 * accidental refresh does not start over. Personal details never do: a laptop
 * can be shared, and an identity number must not be left in browser storage.
 * A saved choice is only restored for the distance the link asks for, and is
 * sanitised against current stock before it is shown.
 *
 * ## What an attempt is told
 *
 * Once details have reached the vault, the attempt keeps that answer so a retry
 * never sends them twice. Any change to the distance, the race pack or the
 * details makes that answer stale, so each of them tells the attempt to forget
 * it: paying with a hash for choices the runner has since changed would put the
 * wrong entry in the vault.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { useState } from "react";
import { isSupportedCountry } from "react-phone-number-input";

import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { Stepper } from "@/components/elements/Stepper";
import { WalletGate } from "@/components/layouts/WalletGate";
import { Button } from "@/components/ui/button";
import { useArea } from "@/hooks/useArea";
import { useEntryAttempt, type EntryPlan } from "@/hooks/useEntryAttempt";
import { useEventMetadata } from "@/hooks/useEventMetadata";
import { useEvent, useEventAddOns } from "@/hooks/useEvents";
import { useRunnerRecords } from "@/hooks/useRunnerRecords";
import { useWallet } from "@/hooks/useWallet";
import type { EventSummary } from "@/lib/events";
import type { EventMetadata } from "@/lib/metadata";
import { joinAddOns } from "@/lib/event/add-ons";
import { focusField } from "@/utils/missing-field";
import { formatEventDate } from "@/utils/format";
import type { SterunAddOn } from "@sterunxyz/sdk";

import {
  EMPTY_SELECTION,
  buildBasket,
  missingPackSizes,
  packChoices,
  sanitizeSelection,
  totalStroops,
  type Selection,
} from "./basket";
import { EntrySummary } from "./component/EntrySummary";
import { GateNotice } from "./component/GateNotice";
import { PayDialog } from "./component/PayDialog";
import type { Country } from "./component/PhoneField";
import { StepDistance } from "./component/StepDistance";
import { PayPanel, StepPay } from "./component/StepPay";
import { StepRunner } from "./component/StepRunner";
import { EMPTY_DETAILS, missingRunnerDetails, participantBody, type RunnerDetails } from "./details";
import { entryGate } from "./gate";

export type EntryStep = "distance" | "details" | "pay";

export const ENTRY_STEPS = [
  { id: "distance", label: "Distance & race pack" },
  { id: "details", label: "Your details" },
  { id: "pay", label: "Review & pay" },
] as const satisfies readonly { id: EntryStep; label: string }[];

export function EntryFlow({
  eventId,
  requestedCategory,
}: {
  eventId: number;
  requestedCategory: number | null;
}) {
  const address = useWallet((state) => state.address);

  return (
    <WalletGate
      title="Connect your wallet to enter"
      description="Your entry and your race record belong to the wallet you connect. Use the same wallet on race day."
    >
      {/* Keyed by address: a wallet switched mid-form must not inherit the last one's choices. */}
      {address ? (
        <EntryForm key={address} eventId={eventId} requestedCategory={requestedCategory} address={address} />
      ) : null}
    </WalletGate>
  );
}

interface SavedChoice {
  categoryId: number;
  selection: Selection;
}

const storageKey = (eventId: number) => `sterun.entry.${eventId}`;

/** Read defensively: sessionStorage can be blocked, and anything in it can be stale or edited. */
function readChoice(eventId: number): SavedChoice | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { categoryId?: unknown; selection?: { sizes?: unknown; extras?: unknown } };
    if (typeof parsed.categoryId !== "number") return null;
    const sizes =
      parsed.selection?.sizes && typeof parsed.selection.sizes === "object"
        ? (parsed.selection.sizes as Record<string, number>)
        : {};
    const extras = Array.isArray(parsed.selection?.extras)
      ? parsed.selection.extras.filter((id): id is number => typeof id === "number")
      : [];
    return { categoryId: parsed.categoryId, selection: { sizes, extras } };
  } catch {
    return null;
  }
}

function writeChoice(eventId: number, choice: SavedChoice): void {
  try {
    window.sessionStorage.setItem(storageKey(eventId), JSON.stringify(choice));
  } catch {
    // Storage refused (private mode, quota): the form still works, it just
    // will not survive a reload.
  }
}

function clearChoice(eventId: number): void {
  try {
    window.sessionStorage.removeItem(storageKey(eventId));
  } catch {
    // Nothing to clear is not a failure.
  }
}

function EntryForm({
  eventId,
  requestedCategory,
  address,
}: {
  eventId: number;
  requestedCategory: number | null;
  address: string;
}) {
  const race = useEvent(eventId);
  const onChain = useEventAddOns(eventId);
  const records = useRunnerRecords(address);
  const metadata = useEventMetadata(race.data?.event.uri ?? "", race.data?.event.metadataHash ?? "");
  /** The distance the gates first opened on. Once set, the form stays: see the header. */
  const [openedOn, setOpenedOn] = useState<number | null>(null);

  if (race.isError) {
    return (
      <Page>
        <ErrorNotice
          title="We could not load this race"
          detail="This race does not exist, or we could not connect. Check the link and try again."
          onRetry={() => void race.refetch()}
        />
      </Page>
    );
  }
  if (records.isError) {
    return (
      <Page>
        <ErrorNotice
          title="We could not check your entries"
          detail="Before you pay, we check this wallet has not already entered this race. Please try again."
          onRetry={() => void records.refetch()}
        />
      </Page>
    );
  }

  const documentLoading = metadata.isPending && metadata.fetchStatus !== "idle";
  if (race.isPending || records.isPending || onChain.isPending || documentLoading) {
    return (
      <Page>
        <div role="status" aria-label="Loading this race" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="h-80 animate-pulse rounded-lg bg-n-100" />
          <div className="h-56 animate-pulse rounded-lg bg-n-100" />
        </div>
      </Page>
    );
  }

  const summary = race.data;
  const gate = entryGate(summary, records.data, requestedCategory);
  // Adjusted during render, React's pattern for state derived from props.
  if (gate.kind === "open" && openedOn === null) setOpenedOn(gate.categoryId);
  let openCategoryId: number;
  if (gate.kind === "open") openCategoryId = gate.categoryId;
  else if (openedOn !== null) openCategoryId = openedOn;
  else return <GateNotice gate={gate} summary={summary} />;

  return (
    <EntryReady
      eventId={eventId}
      requestedCategory={requestedCategory}
      address={address}
      summary={summary}
      openCategoryId={openCategoryId}
      raceDocument={metadata.data?.status === "verified" ? metadata.data.document : undefined}
      onChain={onChain.data ?? []}
    />
  );
}

function EntryReady({
  eventId,
  requestedCategory,
  address,
  summary,
  openCategoryId,
  raceDocument,
  onChain,
}: {
  eventId: number;
  requestedCategory: number | null;
  address: string;
  summary: EventSummary;
  /** The distance the gate opened on: the requested one, or the first with places. */
  openCategoryId: number;
  raceDocument: EventMetadata | undefined;
  onChain: SterunAddOn[];
}) {
  const router = useRouter();
  const { place } = useArea();

  const [restored] = useState<SavedChoice | null>(() => {
    const saved = readChoice(eventId);
    return saved && (requestedCategory === null || saved.categoryId === requestedCategory) ? saved : null;
  });
  const [chosenCategory, setChosenCategory] = useState<number | null>(restored?.categoryId ?? null);
  const [selection, setSelection] = useState<Selection>(restored?.selection ?? EMPTY_SELECTION);
  const [step, setStep] = useState<EntryStep>("distance");
  const [sizesAsked, setSizesAsked] = useState(false);
  // Memory only, never storage: see the header.
  const [details, setDetails] = useState<RunnerDetails>(EMPTY_DETAILS);
  const [detailsAsked, setDetailsAsked] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  /**
   * The runner's own calendar day, read once. `en-CA` formats as YYYY-MM-DD in
   * local time; an ISO string would be UTC, which is yesterday for an early
   * morning in Jakarta and would refuse a date of birth that is today.
   */
  const [today] = useState(() => new Date().toLocaleDateString("en-CA"));

  const areaCountry = place?.mode === "area" ? place.countryCode.toUpperCase() : "";
  const defaultCountry: Country = isSupportedCountry(areaCountry) ? areaCountry : "ID";

  const categoryId =
    chosenCategory !== null &&
    summary.categories.some((c) => c.categoryId === chosenCategory && c.slotsLeft > 0)
      ? chosenCategory
      : openCategoryId;
  // The gate opened on a distance this race has, so the fallback always finds one.
  const category =
    summary.categories.find((c) => c.categoryId === categoryId) ??
    summary.categories.find((c) => c.categoryId === openCategoryId) ??
    summary.categories[0];

  const basket = buildBasket(joinAddOns(raceDocument?.addOns ?? [], onChain), category.code);
  const chosen = sanitizeSelection(basket, selection);
  const total = totalStroops(category, basket, chosen);
  const missingSizes = sizesAsked ? missingPackSizes(basket, chosen) : [];
  const venue = raceDocument?.location?.name ?? raceDocument?.location?.city;

  const plan: EntryPlan | null =
    step === "pay"
      ? {
          runner: address,
          summary,
          categoryId: category.categoryId,
          basket,
          selection: chosen,
          body: participantBody(details, {
            eventId,
            categoryId: category.categoryId,
            runner: address,
            addOns: packChoices(basket, chosen),
          }),
          total,
        }
      : null;
  const attempt = useEntryAttempt(plan);

  /** Anything the vault was sent is stale once a choice changes. See the header. */
  function forgetSubmitted() {
    if ("submitted" in attempt.state && attempt.state.submitted) attempt.detailsChanged();
  }

  function pickCategory(next: number) {
    setChosenCategory(next);
    setSelection(EMPTY_SELECTION);
    setSizesAsked(false);
    writeChoice(eventId, { categoryId: next, selection: EMPTY_SELECTION });
    forgetSubmitted();
  }

  function pickSelection(next: Selection) {
    setSelection(next);
    writeChoice(eventId, { categoryId: category.categoryId, selection: next });
    forgetSubmitted();
  }

  function changeDetails(next: RunnerDetails) {
    setDetails(next);
    forgetSubmitted();
  }

  function continueFromDistance() {
    if (missingPackSizes(basket, chosen).length > 0) {
      // Not a disabled button: pressing it says what is missing and where.
      setSizesAsked(true);
      document.getElementById("entry-race-pack")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setStep("details");
  }

  function continueFromDetails() {
    const missing = missingRunnerDetails(details, today);
    if (missing.length > 0) {
      setDetailsAsked(true);
      focusField(missing[0].focusId);
      return;
    }
    setStep("pay");
  }

  function pay() {
    setPayOpen(true);
    attempt.start();
  }

  return (
    <Page>
      <div className="flex flex-col gap-2">
        <Link
          href={`/events/${eventId}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-teal-500 underline-offset-4 hover:underline"
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4" />
          {summary.event.name}
        </Link>
        <h1 className="heading-strong text-3xl text-ink">Enter {summary.event.name}</h1>
        <p className="numeric text-sm text-n-500">
          {[formatEventDate(summary.event.startsAt), venue].filter(Boolean).join(" · ")}
        </p>
      </div>

      <Stepper steps={ENTRY_STEPS} current={step} />

      {/*
        Three children so a phone reads the form, the summary and payment, then
        the way back or on (mockup block 8), while from `lg` the summary column
        sits beside both.
      */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="lg:col-start-1 lg:row-start-1">
          {step === "distance" ? (
            <StepDistance
              categories={summary.categories}
              categoryId={category.categoryId}
              basket={basket}
              selection={chosen}
              missingSizes={missingSizes}
              onCategory={pickCategory}
              onSelection={pickSelection}
            />
          ) : null}
          {step === "details" ? (
            <StepRunner
              details={details}
              onChange={changeDetails}
              today={today}
              showMissing={detailsAsked}
              defaultCountry={defaultCountry}
            />
          ) : null}
          {step === "pay" ? (
            <StepPay category={category} basket={basket} selection={chosen} details={details} onEdit={setStep} />
          ) : null}
        </div>

        {/*
          Sticky on the column, not on the card: the column is only as tall as
          its content, so a sticky card inside it had nowhere to move.
        */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <EntrySummary
            event={summary.event}
            category={category}
            basket={basket}
            selection={chosen}
            total={total}
          />
          {step === "pay" ? <PayPanel runner={address} total={total} busy={attempt.running} onPay={pay} /> : null}
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between lg:col-start-1 lg:row-start-2">
          {step === "distance" ? (
            <>
              <Button variant="link" asChild className="px-0">
                <Link href={`/events/${eventId}`}>Back to the race</Link>
              </Button>
              <Button className="w-full sm:w-auto" onClick={continueFromDistance}>
                Continue
              </Button>
            </>
          ) : step === "details" ? (
            <>
              <Button variant="link" className="px-0" onClick={() => setStep("distance")}>
                Back
              </Button>
              <Button className="w-full sm:w-auto" onClick={continueFromDetails}>
                Continue
              </Button>
            </>
          ) : (
            <Button variant="link" className="px-0" onClick={() => setStep("details")}>
              Back
            </Button>
          )}
        </div>
      </div>

      {step === "pay" ? (
        <PayDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          raceName={summary.event.name}
          eventId={eventId}
          runner={address}
          total={total}
          attempt={attempt}
          onChangeDistance={() => {
            setPayOpen(false);
            setStep("distance");
          }}
          onDone={(tokenId) => {
            clearChoice(eventId);
            router.push(`/events/${eventId}/entered/${tokenId}`);
          }}
        />
      ) : null}
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">{children}</div>;
}
