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

import { Button } from "@/components/ui/button";

/**
 * The confetti colours, taken from the same custom properties the rest of the
 * app paints with, so a change to Nabil's palette carries here too and no hex
 * value is written down twice. Returns an empty list where the properties do
 * not resolve, which the caller turns into "say nothing about colour".
 */
function tealRamp(): string[] {
  const style = getComputedStyle(document.documentElement);
  return ["--color-teal-500", "--color-teal-400", "--color-teal-300", "--color-teal-200"]
    .map((name) => style.getPropertyValue(name).trim())
    .filter((value) => value.length > 0);
}

export interface StepDoneProps {
  eventId: number;
  eventName: string;
}

export function StepDone({ eventId, eventName }: StepDoneProps) {
  const fired = useRef(false);

  useEffect(() => {
    // Strict mode mounts twice in development; the burst should not.
    if (fired.current) return;
    fired.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /*
     * No cleanup, deliberately. The first version cancelled the burst on
     * unmount, which in Strict Mode meant it never fired at all: the effect
     * ran and started the import, the cleanup cancelled it, and the second run
     * hit the ref guard above and returned. Two mounts, zero confetti, and
     * nothing in the console to say so. The burst is fire and forget, since
     * canvas-confetti removes its own canvas when the animation ends, so there
     * is nothing here that needs tearing down.
     *
     * Imported here rather than at the top so the library stays out of the
     * bundle for the four steps that come before this one.
     */
    void import("canvas-confetti")
      .then(({ default: confetti }) => {
        /*
         * Omitted rather than passed empty when the ramp comes back with
         * nothing: `colors: []` is not "use your defaults" to canvas-confetti,
         * it is a list to pick from, and picking from an empty list throws on
         * the first frame. Anywhere the custom properties do not resolve, this
         * falls back to the library's own palette instead of to a crash.
         */
        const teal = tealRamp();
        const palette = teal.length > 0 ? { colors: teal } : {};
        confetti({ particleCount: 70, spread: 62, origin: { y: 0.7 }, ...palette });
        window.setTimeout(
          () => confetti({ particleCount: 40, spread: 90, origin: { y: 0.65 }, ...palette }),
          220,
        );
      })
      // Swallowed on purpose. This is decoration on the screen that tells an
      // organiser their race is live; a canvas that will not paint, or a chunk
      // that will not load, must never be what they see instead of it.
      .catch(() => {});
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
    </div>
  );
}
