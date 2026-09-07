"use client";

/**
 * STE-17 — creating an event, one irreversible step at a time.
 *
 * This is a wizard rather than a form because creating an event is not one
 * save. It is a document to publish, then `create_event`, then one
 * `add_category` per distance, then `set_event_status`: four or more
 * transactions, each signed separately, because Soroban allows a single
 * contract invocation per transaction and RaceRecord has no batch call.
 *
 * A single Save button over that would leave people with a half-created event
 * and no way to tell which half landed. Nothing here can be edited or deleted
 * afterwards either (WEB_APP_IA.md §2.2), so each step is shown, signed and
 * confirmed on its own, and the transaction hash of every one stays on screen.
 *
 * Events are born `Draft`, which is what makes stopping halfway safe: until the
 * last step nobody can enter, so an abandoned wizard leaves an invisible event
 * rather than a broken one.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { WalletGate } from "@/components/layouts/WalletGate";
import { useCreateEvent, useSetEventStatus } from "@/hooks/useOrganiser";
import { EXPLORER_BASE } from "@/lib/env";
import { buildEventDocument, documentHash } from "@/lib/event-document";
import { formatEventDateTime } from "@/utils/format";

import { StepCategories, type AddedCategory } from "./component/StepCategories";
import { StepDetails, EMPTY_DETAILS, type EventDetails } from "./component/StepDetails";
import { StepDocument, type PublishedDocument } from "./component/StepDocument";

/**
 * `metadata_hash` is a required `BytesN<32>`, so an event without a document
 * still has to store something. All zeroes is that something, and it is safe
 * to read as "no document" because `uri` is empty in the same event and the
 * page never fetches anything to compare it against.
 */
const NO_DOCUMENT_HASH = "0".repeat(64);

const STEPS = ["details", "document", "create", "categories", "open"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  details: "Details",
  document: "Document",
  create: "Create",
  categories: "Categories",
  open: "Open",
};

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
  const [published, setPublished] = useState<PublishedDocument | null>(null);
  const [skipDocument, setSkipDocument] = useState(false);
  const [eventId, setEventId] = useState<number | null>(null);
  const [createdTx, setCreatedTx] = useState<string | null>(null);
  const [categories, setCategories] = useState<AddedCategory[]>([]);
  const [openedTx, setOpenedTx] = useState<string | null>(null);

  const createEvent = useCreateEvent();
  const setStatus = useSetEventStatus();

  const startsAt = useMemo(() => toUnixSeconds(details.startsAtLocal), [details.startsAtLocal]);
  const detailsComplete = details.name.trim().length > 0 && startsAt !== null;

  // Derived, not stored. The text on screen is always the text its hash covers,
  // with no effect in between that could leave the two out of step for a render.
  const documentText = useMemo(
    () =>
      startsAt === null
        ? ""
        : buildEventDocument({
            startsAt,
            description: details.description,
            locationName: details.locationName,
            locationLink: details.locationLink,
            posterUrl: details.posterUrl,
            waiverUrl: details.waiverUrl,
            registrationOpens: toIso(details.registrationOpens),
            registrationCloses: toIso(details.registrationCloses),
            racepackStarts: toIso(details.racepackStarts),
            racepackEnds: toIso(details.racepackEnds),
            racepackVenue: details.racepackVenue,
            racepackVenueLink: details.racepackVenueLink,
            cutOff: toIso(details.cutOff),
          }),
    [details, startsAt],
  );

  // Hashing is async (crypto.subtle), so it is a query keyed by the exact text
  // rather than an effect writing into state.
  const { data: hash = "" } = useQuery({
    queryKey: ["event-document-hash", documentText],
    queryFn: () => documentHash(documentText),
    enabled: documentText.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
  });

  /**
   * A published document counts only while it still describes what is on
   * screen. Editing any detail changes the bytes, so the URL the organiser
   * checked a minute ago now serves something else, and treating it as verified
   * would commit a hash for bytes nobody fetched. Derived rather than cleared
   * in an effect, so there is no render where the stale one is still trusted.
   */
  const verified = published && published.hash === hash ? published : null;

  async function create() {
    if (startsAt === null) return;
    const sent = await createEvent.write({
      name: details.name.trim(),
      metadataHash: verified?.hash ?? NO_DOCUMENT_HASH,
      uri: verified?.uri ?? "",
      startsAt,
    });
    setEventId(sent.value);
    setCreatedTx(sent.txHash);
    setStep("categories");
  }

  async function open() {
    if (eventId === null) return;
    const sent = await setStatus.write({ eventId, status: "Open" });
    setOpenedTx(sent.txHash);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-12">
      <header>
        <Link href="/org" className="text-sm text-teal-500 underline underline-offset-4">
          Organiser console
        </Link>
        <h1 className="heading-hero mt-3 text-4xl text-ink">New event</h1>
        <p className="mt-2 max-w-2xl text-base text-n-600">
          Four steps, and you confirm each one in your wallet. Nothing here can be edited or
          deleted afterwards, so the review comes first.
        </p>
      </header>

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((name, index) => (
          <li key={name}>
            <Badge variant={name === step ? "accent" : "secondary"}>
              <span className="numeric mr-2">{index + 1}</span>
              {STEP_LABELS[name]}
            </Badge>
          </li>
        ))}
      </ol>

      <Card className="px-6">
        {step === "details" ? (
          <>
            <StepDetails details={details} onChange={setDetails} />
            <div className="mt-8 flex items-center gap-3">
              <Button onClick={() => setStep("document")} disabled={!detailsComplete}>
                Continue
              </Button>
              {!detailsComplete ? (
                <p className="text-sm text-n-500">A name and a gun start are required.</p>
              ) : null}
            </div>
          </>
        ) : null}

        {step === "document" ? (
          <>
            <StepDocument
              text={documentText}
              hash={hash}
              published={verified}
              onPublished={(doc) => {
                setPublished(doc);
                if (doc) setSkipDocument(false);
              }}
            />
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => setStep("details")}>
                Back
              </Button>
              <Button onClick={() => setStep("create")} disabled={!verified && !skipDocument}>
                Continue
              </Button>
              {!verified ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSkipDocument(true);
                    setStep("create");
                  }}
                >
                  Create without a document
                </Button>
              ) : null}
            </div>
            {!verified ? (
              <p className="mt-3 max-w-2xl text-sm text-n-500">
                An event with no details file still works. It just has no poster, no location and
                no schedule on its page, and you cannot add one later.
              </p>
            ) : null}
          </>
        ) : null}

        {step === "create" ? (
          <div className="flex flex-col gap-6">
            <h2 className="heading text-xl text-n-700">Review</h2>
            <dl className="grid gap-x-6 gap-y-2 text-base sm:grid-cols-[auto_1fr]">
              <dt className="text-n-500">Name</dt>
              <dd className="text-ink">{details.name}</dd>
              <dt className="text-n-500">Gun start</dt>
              <dd className="numeric text-ink">
                {startsAt === null ? "" : formatEventDateTime(startsAt)}
              </dd>
              <dt className="text-n-500">Details file</dt>
              <dd className="numeric break-all text-ink">
                {verified ? verified.uri : "None"}
              </dd>
              <dt className="text-n-500">Fingerprint</dt>
              <dd className="numeric break-all text-ink">
                {verified ? verified.hash : "Not applicable"}
              </dd>
            </dl>

            {createEvent.error ? (
              <ErrorNotice title="The event was not created" detail={createEvent.error.message} />
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => setStep("document")}>
                Back
              </Button>
              <Button onClick={() => void create()} disabled={createEvent.isBusy}>
                {createEvent.phase === "signing"
                  ? "Confirm in your wallet"
                  : createEvent.phase === "confirming"
                    ? "Creating"
                    : "Create event"}
              </Button>
            </div>
          </div>
        ) : null}

        {step === "categories" && eventId !== null ? (
          <div className="flex flex-col gap-6">
            <Created eventId={eventId} txHash={createdTx} />
            <StepCategories
              eventId={eventId}
              added={categories}
              onAdded={(category) => setCategories((all) => [...all, category])}
            />
            <div className="flex items-center gap-3">
              <Button onClick={() => setStep("open")} disabled={categories.length === 0}>
                Continue
              </Button>
              {categories.length === 0 ? (
                <p className="text-sm text-n-500">
                  Add at least one category. Nobody can enter a race with no distances.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === "open" && eventId !== null ? (
          <div className="flex flex-col gap-6">
            <h2 className="heading text-xl text-n-700">Open for entries</h2>
            <p className="max-w-2xl text-base text-n-600">
              This is the switch that lets people enter. Until you press it the event is a draft,
              visible but closed. You can close it again later, and you can reopen it, but the
              categories and their quotas are already fixed.
            </p>

            {setStatus.error ? (
              <ErrorNotice title="The event was not opened" detail={setStatus.error.message} />
            ) : null}

            {openedTx ? (
              <div className="rounded-lg border border-success-border bg-success-surface px-5 py-4">
                <p className="heading-strong text-lg text-success">The event is open</p>
                <p className="mt-1 text-base text-n-700">
                  It is on the public list of races now.
                </p>
                <div className="mt-3 flex flex-wrap gap-4">
                  <Link
                    href={`/events/${eventId}`}
                    className="text-base text-teal-500 underline underline-offset-4"
                  >
                    Open the event page
                  </Link>
                  <TxLink txHash={openedTx} />
                </div>
              </div>
            ) : (
              <div>
                <Button onClick={() => void open()} disabled={setStatus.isBusy}>
                  {setStatus.phase === "signing"
                    ? "Confirm in your wallet"
                    : setStatus.phase === "confirming"
                      ? "Opening"
                      : "Open for entries"}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function Created({ eventId, txHash }: { eventId: number; txHash: string | null }) {
  return (
    <div className="rounded-lg border border-success-border bg-success-surface px-5 py-4">
      <p className="heading-strong text-base text-success">
        Event <span className="numeric">{eventId}</span> created
      </p>
      <p className="mt-1 text-base text-n-700">
        Write that number down. If you close this page the event is still there, and the console
        can pick it up again.
      </p>
      {txHash ? (
        <div className="mt-2">
          <TxLink txHash={txHash} />
        </div>
      ) : null}
    </div>
  );
}

function TxLink({ txHash }: { txHash: string }) {
  if (!EXPLORER_BASE) return <span className="numeric text-sm text-n-500">{txHash.slice(0, 12)}</span>;
  return (
    <a
      href={`${EXPLORER_BASE}/tx/${txHash}`}
      target="_blank"
      rel="noreferrer"
      className="numeric text-base text-teal-500 underline underline-offset-4"
    >
      View the receipt
    </a>
  );
}

/** `datetime-local` is wall-clock time with no zone; the browser's own is meant. */
function toUnixSeconds(local: string): bigint | null {
  if (!local) return null;
  const ms = new Date(local).getTime();
  if (Number.isNaN(ms)) return null;
  return BigInt(Math.floor(ms / 1000));
}

function toIso(local: string): string {
  if (!local) return "";
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
