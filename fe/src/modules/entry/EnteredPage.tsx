"use client";

/**
 * `/events/[id]/entered/[tokenId]`: the entry went through (STE-21, mockup block 5).
 *
 * ## Two sources, and why
 *
 * The race, its date, the distance and the bib number are read from chain, so a
 * refresh, or this link opened anywhere, still shows them. The name on the bib
 * and the receipt code are on no chain and returned by no route, so they come
 * from this device (`lib/entry-store.ts`) and only appear in the browser that
 * entered. Elsewhere the page says where the receipt is.
 *
 * ## The way on waits for the receipt
 *
 * "Back to the race" stays off until "I've saved my receipt" is ticked, because
 * the receipt code shown here is shown nowhere else. In round 2 the same button
 * becomes the way to the pass.
 *
 * Once. The tick is remembered on this device, so a runner coming back through
 * View my entry is not asked again and is not celebrated again: the entry is
 * old news, and a box they already ticked reads as the page forgetting them
 * (Ancung, 2026-09-15). A runner who never ticked it is still asked. Confetti is
 * likewise for this device's fresh entry only, not for another device.
 *
 * ## This page never asks for a signature
 *
 * Linking the vault row to the record used to be retried here with a signed
 * message, which put wallet popups over a page somebody opened only to look at
 * their bib, twice (Ancung, 2026-09-15). The backend now links it from the
 * chain (STE-59), so nothing on this page needs the wallet at all.
 *
 * ## The stored entry is read fresh
 *
 * Every visit reads it again, and ticking the receipt box updates the page's
 * copy at once. A read kept for the life of the tab made Back to the race then
 * View my entry ask about a receipt that had already been saved.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ErrorNotice } from "@/components/feedback/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useEvent } from "@/hooks/useEvents";
import { fireConfetti } from "@/lib/confetti";
import { markReceiptSaved, readEntry, type StoredEntry } from "@/lib/entry-store";
import { readClient } from "@/lib/chain/sterun";
import { formatEventDate } from "@/utils/format";

import { Bib } from "./components/Bib";
import { ReceiptBox } from "./components/ReceiptBox";
import { downloadReceipt } from "./lib/receipt-pdf";

export function EnteredPage({ eventId, tokenId }: { eventId: number; tokenId: number }) {
  const record = useQuery({
    queryKey: ["race-record", tokenId],
    queryFn: () => readClient.recordOf(tokenId),
    staleTime: 30_000,
  });
  const race = useEvent(eventId);
  const storedKey = ["stored-entry", tokenId] as const;
  const stored = useQuery({
    queryKey: storedKey,
    queryFn: async () => (await readEntry(tokenId)) ?? null,
    // Fresh on every visit: see the header.
    staleTime: 0,
  });
  const queryClient = useQueryClient();

  const [saved, setSaved] = useState(false);
  const celebrated = useRef(false);

  const belongs = record.data !== undefined && record.data.eventId === eventId;
  const entry = stored.data && stored.data.eventId === eventId ? stored.data : null;

  // A fresh entry: made on this device, receipt not yet confirmed saved.
  const fresh = entry !== null && entry.receiptSaved !== true;

  useEffect(() => {
    // Strict Mode mounts twice in development; the burst should not.
    if (!belongs || !race.data || !fresh || celebrated.current) return;
    celebrated.current = true;
    fireConfetti();
  }, [belongs, race.data, fresh]);

  if (record.isError || race.isError) {
    return (
      <Page>
        <ErrorNotice
          title="We could not load this entry"
          detail="Check your connection and try again."
          onRetry={() => {
            void record.refetch();
            void race.refetch();
          }}
        />
      </Page>
    );
  }

  if (record.isPending || race.isPending || stored.isPending) {
    return (
      <Page>
        <div role="status" aria-label="Loading your entry" className="flex flex-col items-center gap-6">
          <div className="h-12 w-48 animate-pulse rounded-md bg-n-100" />
          <div className="aspect-[3/2] w-full max-w-lg animate-pulse rounded-lg bg-n-100" />
        </div>
      </Page>
    );
  }

  if (!belongs) {
    return (
      <Page>
        <ErrorNotice
          title="This entry is not part of this race."
          detail="Check the link you followed."
        />
        <BackToRace eventId={eventId} />
      </Page>
    );
  }

  const summary = race.data;
  const distanceCode =
    summary.categories.find((c) => c.categoryId === record.data.categoryId)?.code ?? entry?.distanceCode ?? "";
  // The bib, distance and race name from chain win over what this device kept.
  const receiptEntry = entry
    ? { ...entry, bibNo: record.data.bibNo, distanceCode, raceName: summary.event.name }
    : null;

  return (
    <Page>
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="grid size-13 place-items-center rounded-full border border-success-border bg-success-surface text-success">
          <CheckIcon aria-hidden="true" className="size-6" />
        </span>
        <h1 className="heading-strong text-3xl text-ink">You&apos;re in!</h1>
        <p className="text-base text-n-500">
          {summary.event.name} Â· {formatEventDate(summary.event.startsAt)}
        </p>
      </div>

      <Bib
        raceName={summary.event.name}
        bibNo={record.data.bibNo}
        bibName={entry?.bibName}
        distanceCode={distanceCode}
      />

      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        {receiptEntry ? (
          <>
            <ReceiptBox code={receiptEntry.salt} onDownload={() => void downloadReceipt(receiptEntry)} />
            {receiptEntry.receiptSaved ? (
              <WaysOn eventId={eventId} tokenId={tokenId} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="receipt-saved"
                    checked={saved}
                    onCheckedChange={(checked) => {
                      setSaved(checked === true);
                      // Remembered, so the next visit does not ask again. A
                      // device that will not store it simply asks next time.
                      if (checked === true) {
                        void markReceiptSaved(tokenId).catch(() => {});
                        // The page's own copy too, so coming back does not ask again.
                        queryClient.setQueryData<StoredEntry | null>(storedKey, (previous) =>
                          previous ? { ...previous, receiptSaved: true } : previous,
                        );
                      }
                    }}
                  />
                  <Label htmlFor="receipt-saved" className="text-base font-normal">
                    I&apos;ve saved my receipt
                  </Label>
                </div>
                {/* One button throughout: the way on is the pass, and it waits
                    for the receipt rather than changing its own label. */}
                {saved ? (
                  <Button asChild>
                    <Link href={`/pass/${tokenId}`}>Open my pass</Link>
                  </Button>
                ) : (
                  <Button disabled>Open my pass</Button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-center text-sm text-n-500">Your receipt is on the device you entered with.</p>
            <BackToRace eventId={eventId} />
          </>
        )}
      </div>
    </Page>
  );
}

/**
 * Both ways on, for a runner who has already saved their receipt. The pass
 * leads: on race morning it is the only one of the two they need.
 */
function WaysOn({ eventId, tokenId }: { eventId: number; tokenId: number }) {
  return (
    <div className="flex flex-col justify-center gap-3 sm:flex-row">
      <Button asChild>
        <Link href={`/pass/${tokenId}`}>Open my pass</Link>
      </Button>
      <Button asChild variant="secondary">
        <Link href={`/events/${eventId}`}>Back to the race</Link>
      </Button>
    </div>
  );
}

function BackToRace({ eventId }: { eventId: number }) {
  return (
    <div className="flex justify-center">
      <Button asChild variant="secondary">
        <Link href={`/events/${eventId}`}>Back to the race</Link>
      </Button>
    </div>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">{children}</div>;
}
