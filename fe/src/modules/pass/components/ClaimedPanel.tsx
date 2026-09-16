/**
 * What replaces the QR once the race pack has been handed over.
 *
 * No code at all: a second scan can only be refused, so offering one would send
 * a runner back to a desk to be told no. The panel states the fact and its
 * time. The desk is not named, because what the chain carries is a scanner
 * address and no name for it (docs/design/race-day/README.md section 9).
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatClaimedAt } from "@/utils/format";

export function ClaimedPanel({
  eventId,
  tokenId,
  claimedAt,
}: {
  eventId: number;
  tokenId: number;
  /** Null until this device has read the chain once. */
  claimedAt: bigint | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-success-border bg-success-surface px-6 py-10 text-center">
        {/*
          Drawn rather than dropped in (the design, section 6.2, M7): the one
          decorative movement in the whole flow, and the only one allowed to
          take --motion-slow, because nothing waits on it. Written out rather
          than taken from lucide so the stroke can be dashed and drawn.
        */}
        <svg
          data-testid="claimed-check"
          className="pass-check size-18 text-success"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 12.5 9.5 18 20 6.5" />
        </svg>
        <p className="heading-hero text-3xl text-success">Race pack collected</p>
        {claimedAt ? <p className="numeric text-base text-n-600">{formatClaimedAt(claimedAt)}</p> : null}
      </div>

      <p className="text-center text-sm text-n-600">
        The pass stops making codes once the race pack is collected. Keep it for the race record.
      </p>

      <Button asChild variant="secondary">
        <Link href={`/events/${eventId}/entered/${tokenId}`}>View race record</Link>
      </Button>
    </div>
  );
}
