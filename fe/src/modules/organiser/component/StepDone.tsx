"use client";

/**
 * Step 5: the race exists, and the wizard says so and gets out of the way.
 *
 * ## Why this is a step and not a panel on Review
 *
 * It used to be a green box appended to the Review step. That put "here is
 * what you are about to sign" and "it is signed" on one screen, which reads as
 * unfinished — the form is still sitting there, editable-looking, under an
 * announcement that editing is over. A step of its own is also what the
 * stepper already promised: it counts what is left, and finishing has to be
 * one of the things it can count.
 *
 * ## Why the number is not written out
 *
 * The old copy opened with "Write down number 3", an errand handed to somebody
 * who has just finished a job. Explaining the errand only made it longer. The
 * number is not lost by leaving it out: it is in the address the button goes
 * to, so the way to keep it is to open the event and keep the page, which is
 * what a person would do anyway.
 *
 * ## Confetti
 *
 * Fires once, on mount, and never again. It is behind `prefers-reduced-motion`
 * because a full-screen burst is exactly the animation that setting exists to
 * refuse, and behind a `canvas` that ignores pointer events so it cannot eat
 * the click on the buttons underneath it.
 */
import { useEffect, useRef } from "react";
import Link from "next/link";

import { Receipt } from "@/components/elements/Receipt";
import { Button } from "@/components/ui/button";
import { fireConfetti } from "@/lib/confetti";

export interface StepDoneProps {
  eventId: number;
  eventName: string;
  /**
   * What was signed, in the order it landed.
   *
   * These used to live only inside the run dialog, which this step replaces
   * the moment the run finishes, so they went off screen before anybody could
   * read them. In a product whose whole claim is that a record can be checked,
   * the transactions that made the record are the last thing to hide.
   */
  receipts?: { id: string; label: string; txHash: string }[];
}

export function StepDone({ eventId, eventName, receipts = [] }: StepDoneProps) {
  const fired = useRef(false);

  useEffect(() => {
    // Strict mode mounts twice in development; the burst should not.
    if (fired.current) return;
    fired.current = true;
    // No cleanup: see `lib/confetti.ts` for why cancelling it broke it.
    fireConfetti();
  }, []);

  return (
    <div className="grid gap-6 py-4 text-center">
      <div className="grid gap-2">
        <p className="heading-strong text-2xl text-teal-500">Your race is live! 🎉</p>
        <p className="text-base text-foreground">
          <span className="font-medium">{eventName}</span> is on the public list of races now, and
          people can enter.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href={`/events/${eventId}`}>Open the event page</Link>
        </Button>
        {/*
         * This should go to the organiser's own list of races the day that
         * page exists. It does not yet, so the honest second action is the one
         * thing an organiser can actually do from here.
         */}
        <Button variant="secondary" asChild>
          <Link href="/org/new">Create another race</Link>
        </Button>
      </div>

      {/*
       * Under the buttons and quiet on purpose. Most organisers will never
       * open one, and the ones who do are checking something specific, so this
       * is a place to come back to rather than the headline.
       */}
      {receipts.length === 0 ? null : (
        <div className="mx-auto grid w-full max-w-md gap-2 border-t border-n-200 pt-4 text-left">
          <p className="text-sm text-n-500">Receipts</p>
          <ul className="grid gap-1.5">
            {receipts.map((receipt) => (
              <li key={receipt.id} className="flex items-center justify-between gap-4">
                <span className="text-sm text-foreground">{receipt.label}</span>
                <Receipt txHash={receipt.txHash} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
