"use client";

/**
 * `/scan/[eventId]/flagged`: S11, the claims that were not accepted.
 *
 * Built for reconciliation after the fact, not for a decision at the desk: by
 * the time a claim is refused the runner has usually left (design §10 of the
 * STE-18 handoff separates this from ALREADY CLAIMED at scan time).
 *
 * ## What a refusal here means
 *
 * This desk handed a race pack over, and when its claim was sent, another desk
 * had already collected that record. So a second pack may really have gone out.
 * The handoff's copy called that "the system working"; the guard on chain did
 * work, but the pack in a runner's hands is not undone by it, and an organiser
 * reading this list needs to know that is what they are checking for.
 *
 * The list can be copied as plain lines, so it reaches an organiser through
 * whatever chat the race runs on, with no account and no export.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/hooks/useOnline";

import { scannerQueryKeys } from "./lib/query-keys";
import { formatClock } from "./lib/roster-facts";
import { listClaims, readRoster, type QueuedClaim } from "./lib/scanner-store";

function collectedAt(claim: QueuedClaim): string | null {
  return claim.claimedAt ? formatClock(new Date(Number(claim.claimedAt) * 1000).toISOString()) : null;
}

/** What went wrong with one row, in the words the screen and the copied list share. */
export function refusalLine(claim: QueuedClaim): string {
  if (claim.reason === "not-found") return "Not an entry in this race";
  const at = collectedAt(claim);
  return at ? `Already collected elsewhere at ${at}` : "Already collected elsewhere";
}

export function listForOrganiser(raceName: string | null, claims: QueuedClaim[]): string {
  const lines = claims.map(
    (claim) => `Bib ${claim.bibNo}: ${refusalLine(claim)}. Handed over at this desk at ${formatClock(claim.scannedAt)}.`,
  );
  return [`Refused claims${raceName ? ` for ${raceName}` : ""}`, ...lines].join("\n");
}

export function FlaggedPage({ eventId }: { eventId: number }) {
  const online = useOnline();
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  const claims = useQuery({
    queryKey: scannerQueryKeys.claims(eventId),
    queryFn: () => listClaims(eventId),
    staleTime: 0,
  });
  const roster = useQuery({
    queryKey: scannerQueryKeys.roster(eventId),
    queryFn: async () => (await readRoster(eventId)) ?? null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const refused = (claims.data ?? []).filter((claim) => claim.status === "refused");
  const collectedElsewhere = refused.some((claim) => claim.reason === "already-claimed");

  async function copy() {
    try {
      await navigator.clipboard.writeText(listForOrganiser(roster.data?.raceName ?? null, refused));
      setCopied("yes");
    } catch {
      // No clipboard over plain http, and some in-app browsers refuse it.
      setCopied("failed");
    }
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col gap-6 bg-n-950 px-5 py-6 text-paper">
      <div className="flex justify-between text-sm text-n-300">
        <Link href={`/scan/${eventId}/claims`} className="underline-offset-4 hover:underline">
          Back to claims
        </Link>
        <span>{online ? "Online" : "Offline"}</span>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="heading-strong text-3xl">
          {refused.length === 0 ? "Nothing refused" : `${refused.length} refused`}
        </h1>
        <p className="text-lg text-n-300">
          {refused.length === 0
            ? "Every claim sent from this phone was accepted."
            : "These were not accepted when they were sent. They are kept here for the organiser to check."}
        </p>
      </header>

      {refused.length > 0 ? (
        <>
          <ul aria-label="Refused claims">
            {refused.map((claim) => (
              <li
                key={claim.tokenId}
                className="flex items-center justify-between gap-4 border-b border-n-800 py-4 last:border-b-0"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-xl tabular-nums">Bib {claim.bibNo}</span>
                  <span className="text-base text-n-300">{refusalLine(claim)}</span>
                  <span className="text-sm text-n-300 tabular-nums">
                    Handed over here at {formatClock(claim.scannedAt)}
                  </span>
                </div>
                <Badge variant="destructive">Refused</Badge>
              </li>
            ))}
          </ul>

          {collectedElsewhere ? (
            <p className="text-base text-n-300">
              Another desk collected these first, so a second race pack may have gone out. Only chase
              it if the runner is still in front of you.
            </p>
          ) : null}

          <div className="mt-auto flex flex-col gap-3">
            <Button className="h-14 w-full bg-n-100 text-base text-ink hover:bg-n-200" onClick={() => void copy()}>
              {copied === "yes" ? "Copied" : "Copy list for the organiser"}
            </Button>
            {copied === "failed" ? (
              <p role="alert" className="text-base text-n-300">
                This browser would not copy. Take a screenshot of this list instead.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
