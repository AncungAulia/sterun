"use client";

/**
 * Why Stellar: the question, alone on a screen.
 *
 * THE TRANSITION IN. The blue panel above does not slide away to make room for
 * this one; it lifts off it. This section carries a matching -100svh so it
 * starts underneath Product preview, at a lower z-index, with its contents
 * already in place and held by a sticky inner. Product preview then scrolls up
 * as a whole, components and all, and what it uncovers was never moving.
 *
 * That is the opposite of the move one section earlier, where the new panel
 * rose over the held old one, and the pair reads as one gesture: something
 * arrives over you, then it is taken off you.
 *
 * THE HEADING. "Why" is simply there when the panel lifts. "Stellar?" is
 * revealed by a glowing bar sweeping across it, scrubbed to the scroll through
 * this section's own height. See SweepReveal for why that is GSAP rather than a
 * native scroll-driven animation.
 *
 * The answer is not here yet. The sentence that answers it, and the treatment
 * it gets, come next; this screen is only the question, at the size a question
 * deserves when it is the only thing on it.
 */

import { useRef } from "react";
import { SweepReveal } from "@/components/elements/SweepReveal";

export function WhyStellar() {
  const rootRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={rootRef}
      id="why-stellar"
      /* Deliberately unmarked. An unmarked section counts as light, and marking
         it would hand the header a light band occupying exactly the same scroll
         range as the blue panel's dark one, which is how the logo ended up ink
         on blue. The blue panel's own rect is the only band here. */
      /* Starts under the blue panel and outlives it. The extra height beyond
         the first screen is the scroll the sweep is scrubbed to. */
      className="relative z-0 -mt-[100svh] h-[280svh] bg-paper text-ink"
    >
      <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden px-5 sm:px-6 lg:px-4">
        <div className="mx-auto w-full max-w-[1500px]">
          <h2 className="heading-hero tracking-[-0.015em] [--why-size:clamp(3.5rem,13vw,12rem)]">
            <span className="block text-[length:var(--why-size)] leading-[0.86]">Why</span>
            <SweepReveal
              trigger={rootRef}
              className="mt-[calc(var(--why-size)*0.06)] text-[length:var(--why-size)] leading-[0.86]"
            >
              Stellar?
            </SweepReveal>
          </h2>

        </div>
      </div>
    </section>
  );
}
