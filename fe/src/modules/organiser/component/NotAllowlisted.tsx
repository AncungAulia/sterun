"use client";

/**
 * The screen a wallet sees when it is not on the organiser allowlist (STE-36).
 *
 * It says what is true and what to do, and it does not pretend the wallet did
 * something wrong. Publishing a race under a name that is not yours is the
 * fraud this product exists to close, and a list of wallets allowed to publish
 * is how that is closed, so the reason is worth stating rather than hiding
 * behind "not authorised".
 *
 * The address is shown in full. Somebody asking to be added has to be able to
 * copy it, and a truncated address is the one thing on this screen that would
 * make the next step harder than it needs to be.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function NotAllowlisted({ address }: { address: string }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-16">
      <div>
        <h1 className="heading-hero text-4xl text-ink">This wallet cannot publish races yet</h1>
        <p className="mt-3 max-w-2xl text-lg text-n-600">
          Sterun keeps a list of the wallets allowed to publish a race, so nobody can put up a race
          in somebody else{"'"}s name. Yours is not on it.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-n-50 px-5 py-4">
        <p className="text-sm text-n-500">The wallet you are connected with</p>
        <p className="numeric mt-1 break-all text-base text-foreground">{address}</p>
      </div>

      <p className="max-w-2xl text-base text-n-600">
        Send that address to the Sterun team to be added. Nothing else about your wallet changes:
        if you already have races here, you can still manage them, add distances and scanners, and
        publish results.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/">Browse races</Link>
        </Button>
      </div>
    </div>
  );
}
