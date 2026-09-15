"use client";

/**
 * `/events/[id]/enter`: from a race page to a paid entry (STE-21, round 1).
 *
 * Design: `docs/superpowers/specs/2026-09-15-entry-flow-design.md`. Mockup:
 * `2026-09-15-entry-flow-mockup.html`, blocks 1 to 4, 7 and 8.
 *
 * ## What is read before the form
 *
 * The race, this wallet's records (from chain: they decide whether somebody
 * pays twice), the add-on stock and the race's document. Nothing is drawn until
 * all of them have answered, because a race pack that appears a second after
 * Continue was pressed is a jersey that was never reserved.
 *
 * ## What survives a reload
 *
 * The distance and the race pack and add-on choices, in sessionStorage, so an
 * accidental refresh does not start over. Personal details never do: a laptop
 * can be shared, and an identity number must not be left in browser storage.
 * A saved choice is only restored for the distance the link asks for, and is
 * sanitised against current stock before it is shown.
 */
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { useState } from "react";

import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { Stepper } from "@/components/elements/Stepper";
import { WalletGate } from "@/components/layouts/WalletGate";
import { Button } from "@/components/ui/button";
import { useEventMetadata } from "@/hooks/useEventMetadata";
import { useEvent, useEventAddOns } from "@/hooks/useEvents";
import { useRunnerRecords } from "@/hooks/useRunnerRecords";
import { useWallet } from "@/hooks/useWallet";
import { joinAddOns } from "@/modules/event-detail/component/TabAddOns";
import { formatEventDate } from "@/utils/format";

import {
  EMPTY_SELECTION,
  buildBasket,
  missingPackSizes,
  sanitizeSelection,
  totalStroops,
  type Selection,
} from "./basket";
import { EntrySummary } from "./component/EntrySummary";
import { GateNotice } from "./component/GateNotice";
import { StepDistance } from "./component/StepDistance";
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

  const [restored] = useState<SavedChoice | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = readChoice(eventId);
    return saved && (requestedCategory === null || saved.categoryId === requestedCategory) ? saved : null;
  });
  const [chosenCategory, setChosenCategory] = useState<number | null>(restored?.categoryId ?? null);
  const [selection, setSelection] = useState<Selection>(restored?.selection ?? EMPTY_SELECTION);
  const [step, setStep] = useState<EntryStep>("distance");
  const [sizesAsked, setSizesAsked] = useState(false);

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
  if (gate.kind !== "open") return <GateNotice gate={gate} summary={summary} />;

  const categoryId =
    chosenCategory !== null &&
    summary.categories.some((c) => c.categoryId === chosenCategory && c.slotsLeft > 0)
      ? chosenCategory
      : gate.categoryId;
  const category = summary.categories.find((c) => c.categoryId === categoryId);
  if (!category) return <GateNotice gate={{ kind: "no-distance" }} summary={summary} />;

  const raceDocument = metadata.data?.status === "verified" ? metadata.data.document : undefined;
  const basket = buildBasket(joinAddOns(raceDocument?.addOns ?? [], onChain.data ?? []), category.code);
  const chosen = sanitizeSelection(basket, selection);
  const total = totalStroops(category, basket, chosen);
  const missingSizes = sizesAsked ? missingPackSizes(basket, chosen) : [];
  const venue = raceDocument?.location?.name ?? raceDocument?.location?.city;

  function pickCategory(next: number) {
    setChosenCategory(next);
    setSelection(EMPTY_SELECTION);
    setSizesAsked(false);
    writeChoice(eventId, { categoryId: next, selection: EMPTY_SELECTION });
  }

  function pickSelection(next: Selection) {
    setSelection(next);
    writeChoice(eventId, { categoryId, selection: next });
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
        Three children so a phone reads the form, the summary, then the button
        (mockup block 8), while from `lg` the summary sits beside both.
      */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="lg:col-start-1 lg:row-start-1">
          {step === "distance" ? (
            <StepDistance
              categories={summary.categories}
              categoryId={categoryId}
              basket={basket}
              selection={chosen}
              missingSizes={missingSizes}
              onCategory={pickCategory}
              onSelection={pickSelection}
            />
          ) : null}
        </div>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <EntrySummary
            event={summary.event}
            category={category}
            basket={basket}
            selection={chosen}
            total={total}
          />
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
          ) : (
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => setStep(step === "pay" ? "details" : "distance")}
            >
              Back
            </Button>
          )}
        </div>
      </div>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">{children}</div>;
}
