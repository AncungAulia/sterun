"use client";

/**
 * One race on S1: what it is, whether this phone holds its roster, and the one
 * thing to do next.
 *
 * Downloaded: the time and the ledger it was taken at, because that is the
 * only honest answer to "how current is what this desk checks against?", and
 * a way into the desk. Not downloaded: one button, and nothing else to read.
 *
 * Labels sit over their values in ordinary case, the way the pass lays out its
 * facts (Ancung dropped the uppercase labels there on 2026-09-16).
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { formatLedger } from "@/utils/format";

import { formatClock } from "../lib/roster-facts";
import type { StoredRoster } from "../lib/scanner-store";

export interface RosterCardProps {
  eventId: number;
  raceName: string;
  entries: number;
  distances: string[];
  roster: StoredRoster | null;
  /** Null when there is no way to download right now: no wallet, or no signal. */
  onDownload: (() => void) | null;
  downloading: boolean;
  /** A sentence about this card's last download, good or bad. */
  note?: ReactNode;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-n-600">{label}</dt>
      <dd className="text-lg text-ink tabular-nums">{value}</dd>
    </div>
  );
}

export function RosterCard({
  eventId,
  raceName,
  entries,
  distances,
  roster,
  onDownload,
  downloading,
  note,
}: RosterCardProps) {
  return (
    <article
      aria-label={raceName}
      className="flex flex-col gap-5 rounded-lg border border-n-200 bg-paper p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="heading-strong text-xl text-ink">{raceName}</h2>
        {roster ? <Badge variant="success">Downloaded</Badge> : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
        <Fact label="Entries" value={formatLedger(entries)} />
        <Fact label="Distances" value={distances.length > 0 ? distances.join(", ") : "None yet"} />
        {roster ? (
          <>
            <Fact label="Downloaded" value={formatClock(roster.downloadedAt)} />
            <Fact label="Ledger" value={formatLedger(roster.snapshotLedger)} />
          </>
        ) : null}
      </dl>

      {roster ? null : <p className="text-base text-n-600">Not downloaded yet</p>}

      {note}

      <div className="flex flex-col gap-3">
        {roster ? (
          <Button asChild size="lg" className="h-14 text-base">
            <Link href={`/scan/${eventId}`}>Open scanner</Link>
          </Button>
        ) : null}
        {onDownload ? (
          <Button
            size="lg"
            variant={roster ? "outline" : "default"}
            className="h-14 text-base"
            onClick={onDownload}
            disabled={downloading}
          >
            {downloading ? "Check your wallet" : roster ? "Download again" : "Download roster"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
