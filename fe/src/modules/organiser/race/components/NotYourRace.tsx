/**
 * What a wallet sees when it opens a race somebody else organises.
 *
 * A page of its own, with none of the console around it (Ancung, 2026-09-14).
 * The rail, the bell and a race title over a sentence saying none of it can be
 * used read as a broken console, not as the wrong door. It is not a 404: the
 * race exists and is public. It is simply not this wallet's to manage.
 *
 * It covers the console rather than living on a route of its own, because who
 * organises a race is only known once the chain has answered in the browser,
 * and by then the console layout has already drawn its frame. One way out, to
 * the races that are this wallet's.
 */
import { ShieldAlertIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function NotYourRace() {
  return (
    <div
      role="alertdialog"
      aria-labelledby="not-your-race-title"
      aria-describedby="not-your-race-detail"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-n-50 px-4 py-16"
    >
      <div className="flex max-w-xl flex-col items-center text-center">
        <span className="grid size-12 place-items-center rounded-full bg-n-100 text-n-500">
          <ShieldAlertIcon aria-hidden className="size-6" />
        </span>
        <h1 id="not-your-race-title" className="heading-hero mt-6 text-4xl text-ink">
          This race isn&apos;t yours to manage
        </h1>
        <p id="not-your-race-detail" className="mt-3 text-lg text-n-600">
          It was created by another wallet, and only that wallet can manage it.
        </p>
        <Button asChild className="mt-8">
          <Link href="/org">Go to your races</Link>
        </Button>
      </div>
    </div>
  );
}
