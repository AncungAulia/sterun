"use client";

/**
 * What a wallet sees when it is not on the organiser allowlist (STE-36), in
 * the two places it can meet that.
 *
 * It says what is true and what to do, and it does not pretend the wallet did
 * something wrong. Publishing a race under a name that is not yours is the
 * fraud this product exists to close, and a list of wallets allowed to publish
 * is how that is closed, so the reason is worth stating rather than hiding
 * behind "not authorised".
 *
 * The address is shown in full in both. Somebody asking to be added has to be
 * able to copy it, and a truncated address is the one thing that would make
 * the next step harder than it needs to be.
 *
 * **Both name where to ask** (Ancung, 2026-09-23). They used to say "send this
 * address to the Sterun team" and stop there, which is a dead end dressed as an
 * instruction, at exactly the point where somebody had decided to try. The
 * account lives in `lib/contact.ts`, so this and `/organisers` cannot drift.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { X_HANDLE, X_URL } from "@/lib/contact";

/**
 * The console's note. Not the full screen: here the wallet may still run races
 * of its own, and those have to stay visible below it.
 */
export function NotAllowedNotice({ address }: { address: string }) {
  return (
    <div className="rounded-lg border border-border bg-n-50 px-5 py-4">
      <p className="heading-strong text-lg text-ink">This wallet cannot publish new races yet</p>
      <p className="mt-1 max-w-3xl text-base text-n-600">
        Sterun keeps a list of the wallets allowed to publish a race, so nobody can put one up in
        somebody else{"'"}s name. Send this address to us on X at{" "}
        <a
          href={X_URL}
          target="_blank"
          rel="noreferrer"
          className="text-teal-500 underline underline-offset-4"
        >
          {X_HANDLE}
        </a>{" "}
        to be added. Races this wallet already runs stay yours to manage.
      </p>
      <p className="numeric mt-3 break-all text-sm text-foreground">{address}</p>
    </div>
  );
}

/** The full screen in front of the create wizard, where there is nothing else to do. */
export function NotAllowedScreen({ address }: { address: string }) {
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
        Send that address to us on X at {X_HANDLE} to be added. Nothing else about your wallet
        changes: if you already have races here, you can still manage them, add distances and
        scanners, and publish results.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <a href={X_URL} target="_blank" rel="noreferrer">
            Message us on X
          </a>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/organisers">What Sterun does for organisers</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/">Browse races</Link>
        </Button>
      </div>
    </div>
  );
}
