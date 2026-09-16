"use client";

/**
 * `/pass/[tokenId]`: the runner pass at a pickup desk (STE-21, round 2).
 *
 * ## It is drawn from this device first
 *
 * Everything the desk needs was written here at entry: the secret, the bib
 * name, the race and its distance. The chain is read when there is a signal, to
 * correct the bib and to learn whether the race pack has been collected, and
 * what it says is written back to the device so the next visit is right with no
 * signal at all. A failed read changes nothing on screen.
 *
 * ## The code is computed here, never fetched
 *
 * `usePassCode` runs the frozen TOTP definition against the stored secret. The
 * secret does not leave this phone, and the QR carries only its output for one
 * 30-second step.
 *
 * ## Without the secret there is no pass
 *
 * A phone that did not enter has nothing to compute from, so it is offered the
 * way to fetch it rather than an empty frame.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { readClient } from "@/lib/chain/sterun";
import { readEntry, rememberPassFacts } from "@/lib/entry-store";

import { ClaimedPanel } from "./components/ClaimedPanel";
import { GetPassHere } from "./components/GetPassHere";
import { LiveCode } from "./components/LiveCode";
import { PassFacts } from "./components/PassFacts";
import { OfflineNotice } from "./components/PassNotices";
import { useOnline } from "./hooks/useOnline";


export function PassPage({ tokenId }: { tokenId: number }) {
  const online = useOnline();

  const stored = useQuery({
    queryKey: ["stored-entry", tokenId],
    queryFn: async () => (await readEntry(tokenId)) ?? null,
    staleTime: 0,
  });

  const record = useQuery({
    queryKey: ["race-record", tokenId],
    queryFn: () => readClient.recordOf(tokenId),
    staleTime: 30_000,
    retry: false,
  });

  const entry = stored.data ?? null;

  // What the chain said, kept for the next visit, which may have no signal.
  useEffect(() => {
    if (!record.data || !entry) return;
    void rememberPassFacts(tokenId, {
      state: record.data.state,
      bibNo: record.data.bibNo,
      claimedAt: record.data.claimedAt?.toString(),
    }).catch(() => {});
  }, [record.data, entry, tokenId]);

  if (stored.isPending) {
    return (
      <div className="mx-auto my-auto w-full max-w-md px-5 py-6">
        <div
          role="status"
          aria-label="Opening your pass"
          className="h-96 animate-pulse rounded-lg bg-n-100"
        />
      </div>
    );
  }

  if (!entry) return <GetPassHere tokenId={tokenId} />;

  const state = record.data?.state ?? entry.state ?? "Entered";
  const claimed = state !== "Entered";
  const claimedAt = record.data?.claimedAt ?? (entry.claimedAt ? BigInt(entry.claimedAt) : null);
  const bibNo = record.data?.bibNo ?? entry.bibNo;

  return (
    /*
      Centred both ways (Ancung, 2026-09-16). `my-auto` rather than a centring
      container: it centres while there is room and behaves like ordinary
      padding once the pass is taller than the screen, so nothing is ever cut
      off the top on a small phone.
    */
    <div className="mx-auto my-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      {!online && !claimed ? <OfflineNotice /> : null}

      <PassFacts
        raceName={entry.raceName}
        distanceCode={entry.distanceCode}
        startsAt={BigInt(entry.startsAt)}
        city={entry.city}
        bibNo={bibNo}
        bibName={entry.bibName || undefined}
        claimed={claimed}
      />

      {claimed ? (
        <ClaimedPanel eventId={entry.eventId} tokenId={tokenId} claimedAt={claimedAt} />
      ) : (
        /*
          The clock lives in here, not in this page: a tick a second must not
          re-render the race, the date and the bib, none of which change while
          a runner stands at a desk.
        */
        <LiveCode tokenId={tokenId} secretHex={entry.totpSecret} />
      )}
    </div>
  );
}
