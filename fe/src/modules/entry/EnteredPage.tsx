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
 * ## Confirming a second time
 *
 * If linking the vault row to the token failed in the background, it is tried
 * once more here. Only for the wallet that owns the entry and is connected now:
 * it needs a signature, and a wallet prompt appearing on a page somebody only
 * opened to look is a prompt they learn to decline.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useEvent } from "@/hooks/useEvents";
import { useWallet } from "@/hooks/useWallet";
import { fireConfetti } from "@/lib/confetti";
import { markConfirmed, markReceiptSaved, readEntry } from "@/lib/entry-store";
import { confirmParticipant } from "@/lib/participants";
import { readClient } from "@/lib/sterun";
import { formatEventDate } from "@/utils/format";

import { Bib } from "./component/Bib";
import { ReceiptBox } from "./component/ReceiptBox";
import { downloadReceipt } from "./receipt-pdf";

export function EnteredPage({ eventId, tokenId }: { eventId: number; tokenId: number }) {
  const record = useQuery({
    queryKey: ["race-record", tokenId],
    queryFn: () => readClient.recordOf(tokenId),
    staleTime: 30_000,
  });
  const race = useEvent(eventId);
  const stored = useQuery({
    queryKey: ["stored-entry", tokenId],
    queryFn: async () => (await readEntry(tokenId)) ?? null,
    staleTime: Infinity,
  });
  const address = useWallet((state) => state.address);

  const [saved, setSaved] = useState(false);
  const celebrated = useRef(false);
  const confirming = useRef(false);

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

  useEffect(() => {
    if (!entry || entry.confirmed || !entry.participantId || !entry.txHash) return;
    if (address !== entry.runner || confirming.current) return;
    confirming.current = true;
    const { participantId, txHash, runner } = entry;
    void (async () => {
      try {
        const { signMessage } = await import("@/lib/wallet");
        await confirmParticipant({ participantId, tokenId, txHash, address: runner, sign: signMessage });
        await markConfirmed(tokenId);
      } catch {
        // Left unconfirmed. The entry is real on chain either way, and the
        // backend sweeps rows that stay unconfirmed (STE-50).
      }
    })();
  }, [entry, address, tokenId]);

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
          {summary.event.name} · {formatEventDate(summary.event.startsAt)}
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
              <BackToRace eventId={eventId} />
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
                      if (checked === true) void markReceiptSaved(tokenId).catch(() => {});
                    }}
                  />
                  <Label htmlFor="receipt-saved" className="text-base font-normal">
                    I&apos;ve saved my receipt
                  </Label>
                </div>
                {saved ? (
                  <Button asChild>
                    <Link href={`/events/${eventId}`}>Back to the race</Link>
                  </Button>
                ) : (
                  <Button disabled>Back to the race</Button>
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
