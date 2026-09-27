"use client";

/**
 * `/scan`: S1, pick a race and download its roster while there is signal.
 *
 * Two sources, joined by event id, because they answer at different times:
 *
 *   - **The races this wallet may scan**, from the chain. Needs a wallet and a
 *     signal.
 *   - **The rosters this phone already holds**, from IndexedDB. Needs neither.
 *
 * A volunteer who reloads at the venue has no signal and may have no wallet
 * restored yet, and must still reach the desk. So a stored roster is always
 * listed, whether or not the chain answered, and the wallet is asked for only
 * where a download needs it.
 */
import { useState } from "react";

import { ErrorNotice } from "@/components/feedback/ErrorNotice";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/hooks/useOnline";
import { useWallet } from "@/hooks/useWallet";
import { friendlyError } from "@/lib/api/errors";
import type { EventSummary } from "@/lib/event/events";

import { RosterCard } from "./components/RosterCard";
import { useDownloadRoster } from "./hooks/useDownloadRoster";
import { useScannableEvents, useStoredRosters } from "./hooks/useScannerEvents";
import type { StoredRoster } from "./lib/scanner-store";
import { InstallApp } from "@/components/layout/InstallApp";

interface Row {
  eventId: number;
  summary: EventSummary | null;
  roster: StoredRoster | null;
}

function joinRows(summaries: EventSummary[], rosters: StoredRoster[]): Row[] {
  const rows = new Map<number, Row>();
  for (const summary of summaries) {
    rows.set(summary.event.eventId, { eventId: summary.event.eventId, summary, roster: null });
  }
  for (const roster of rosters) {
    const row = rows.get(roster.eventId);
    if (row) row.roster = roster;
    else rows.set(roster.eventId, { eventId: roster.eventId, summary: null, roster });
  }
  // The chain's order (soonest race first), then anything only this phone knows.
  return [...rows.values()];
}

export function ScanEventsPage() {
  const online = useOnline();
  const { address, isRestoring, isConnecting, connect } = useWallet();
  const scannable = useScannableEvents(address);
  const stored = useStoredRosters();
  const download = useDownloadRoster(address);
  const [notes, setNotes] = useState<Record<number, { ok: boolean; text: string }>>({});

  const rows = joinRows(scannable.data ?? [], stored.data ?? []);

  function downloadFor(summary: EventSummary) {
    const eventId = summary.event.eventId;
    setNotes((current) => {
      const next = { ...current };
      delete next[eventId];
      return next;
    });
    download.mutate(summary, {
      onSuccess: ({ missingFromIndex }) => {
        if (missingFromIndex > 0) {
          setNotes((current) => ({
            ...current,
            [eventId]: {
              ok: false,
              text: `${missingFromIndex} entries are still on their way. Download again in a minute so they are on this phone too.`,
            },
          }));
        }
      },
      onError: (error) => {
        setNotes((current) => ({ ...current, [eventId]: { ok: false, text: friendlyError(error) } }));
      },
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-8">
      <div className="flex justify-end">
        <span className="text-sm text-n-600">{online ? "Online" : "Offline"}</span>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="heading-strong text-3xl text-ink">Scan check-in</h1>
        <p className="text-lg text-n-600">
          Pick the race and download its roster while you still have signal.
        </p>
      </header>

      {!address && !isRestoring ? (
        <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-paper p-5">
          <p className="text-base text-n-700">
            Connect the wallet the organiser added as a scanner to see the races you can check in
            for.
          </p>
          <Button size="lg" className="h-14 text-base" onClick={() => void connect()} disabled={isConnecting}>
            {isConnecting ? "Connecting" : "Connect wallet"}
          </Button>
        </div>
      ) : null}

      {scannable.isError && online ? (
        <ErrorNotice
          title="We could not load your races"
          detail="Anything already on this phone is still listed below."
          onRetry={() => void scannable.refetch()}
        />
      ) : null}

      {rows.map((row) => {
        const summary = row.summary;
        const raceName = summary?.event.name ?? row.roster?.raceName ?? `Race ${row.eventId}`;
        const entries = row.roster
          ? row.roster.entries.length
          : (summary?.categories.reduce((total, category) => total + category.enteredCount, 0) ?? 0);
        const distances = summary
          ? summary.categories.map((category) => category.code)
          : (row.roster?.categories.map((category) => category.code) ?? []);
        const note = notes[row.eventId];
        const downloadingThis = download.isPending && download.variables?.event.eventId === row.eventId;

        return (
          <RosterCard
            key={row.eventId}
            eventId={row.eventId}
            raceName={raceName}
            entries={entries}
            distances={distances}
            roster={row.roster}
            onDownload={summary && address && online ? () => downloadFor(summary) : null}
            downloading={downloadingThis}
            note={
              note ? (
                <p role="alert" className="text-base text-danger">
                  {note.text}
                </p>
              ) : null
            }
          />
        );
      })}

      {address && scannable.isSuccess && rows.length === 0 ? (
        <p className="text-base text-n-600">
          This wallet is not a scanner for any race yet. Ask the organiser to add it, then come back.
        </p>
      ) : null}

      <p className="text-base text-n-600">
        The download needs signal once. After that the whole desk works offline.
      </p>

      <InstallApp what="desk" />
    </div>
  );
}
