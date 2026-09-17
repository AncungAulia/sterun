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
 * THE LINE. "WHY" is set in our own display face; the second half is Stellar's
 * own mark on a white plate, because naming a network in someone else's
 * lettering is a claim about them and their mark is the only accurate way to
 * write it. No question mark: the plate ends the line.
 *
 * The gap between the two halves is 0.41 of WHY's cap height, measured from
 * the layout Nabil drew. The mark itself is what the bar sweeps open.
 *
 * The answer is not here yet. The sentence that answers it, and the treatment
 * it gets, come next.
 */

import Image from "next/image";
import { useRef } from "react";
import { SweepReveal } from "@/components/elements/SweepReveal";

/** Scroll the sweep is scrubbed over, from the heading reaching the top. With
    from 0.12 and to 0.7 plus the 0.12 glow fade, the bar is full at 0.7 / 0.82
    of it, about 171vh. */
const SWEEP_END = "+=200%";

export function WhyStellar() {
  const rootRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={rootRef}
      id="why-stellar"
      /* Deliberately unmarked for the header. An unmarked section counts as
         light, and marking it would hand the header a light band occupying
         exactly the same scroll range as the blue panel's dark one, which is
         how the logo ended up ink on blue. The blue panel's rect is the only
         band here. */
      /* Starts under the blue panel and outlives it. The sweep runs over its
         own fixed two screens (SWEEP_END), not over the whole section, and the
         photograph below only starts rising over it at 390 - 200 = 190svh. The
         bar reaches 100% at about 171vh, so the word is whole, with a short
         beat of stillness, before anything covers it. Tie the two numbers
         together if either changes. */
      className="relative z-0 -mt-[100svh] h-[390svh] bg-paper text-ink"
    >
      <div className="sticky top-0 grid h-[100svh] place-items-center overflow-hidden px-5 sm:px-6">
        {/* One line, and every size on it derives from --why. --cap is the ink
            height of WHY, measured in the browser at 0.80 of the font size, and
            every other size on this line is a ratio of it. */}
        <h2
          className="flex items-center justify-center [--cap:calc(var(--why)*0.80)] [--why:clamp(2.6rem,14vw,10rem)]"
          style={{ gap: "calc(var(--cap) * 0.41)" }}
        >
          <span className="heading-hero text-[length:var(--why)] uppercase leading-[0.8] tracking-[-0.015em]">
            Why
          </span>

          {/* No plate: the mark sits on the page. Its own cap height is 0.731
              of the file's height (measured off the rendered SVG), so drawing it
              at cap / 0.731 puts the S of Stellar on exactly the line WHY sits
              on. The two halves then read as one word rather than as a word
              beside a logo. */}
          <SweepReveal trigger={rootRef} end={SWEEP_END} from={0.12} to={0.7} bleed="14%">
            <Image
              src="/third-party/stellar-logo.svg"
              alt="Stellar"
              width={106}
              height={26}
              /* Centring the two boxes leaves the baselines 1.6% of a cap apart,
                 because the mark's file has more room under its descender than
                 over its cap. The nudge is a ratio so it holds at every size. */
              style={{
                height: "calc(var(--cap) / 0.731)",
                width: "auto",
                transform: "translateY(calc(var(--cap) * -0.016))",
              }}
            />
          </SweepReveal>
        </h2>
      </div>
    </section>
  );
}
