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
 * Proportions measured from the layout Nabil drew, in units of WHY's cap
 * height: the plate is 1.70 tall, sits 0.41 away, is 2.88 times as wide as it
 * is tall, and is centred on the same line. The plate is what the bar sweeps
 * open.
 *
 * The answer is not here yet. The sentence that answers it, and the treatment
 * it gets, come next.
 */

import Image from "next/image";
import { useRef } from "react";
import { SweepReveal } from "@/components/elements/SweepReveal";

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
      /* Starts under the blue panel and outlives it. The height beyond the
         first screen is the scroll the sweep is scrubbed to. */
      className="relative z-0 -mt-[100svh] h-[280svh] bg-n-200 text-ink"
    >
      <div className="sticky top-0 grid h-[100svh] place-items-center overflow-hidden px-5 sm:px-6">
        {/* One line, and every size on it derives from --why. Cap height in this
            face is about 0.72em, which is what the measured ratios apply to. */}
        <h2
          className="flex items-center justify-center [--cap:calc(var(--why)*0.72)] [--why:clamp(2.6rem,14vw,10rem)]"
          style={{ gap: "calc(var(--cap) * 0.41)" }}
        >
          <span className="heading-hero text-[length:var(--why)] uppercase leading-[0.8] tracking-[-0.015em]">
            Why
          </span>

          <SweepReveal trigger={rootRef} from={0.12} to={0.7} bleed="26%">
            <span
              className="flex items-center justify-center bg-paper"
              style={{
                height: "calc(var(--cap) * 1.7)",
                width: "calc(var(--cap) * 1.7 * 2.88)",
              }}
            >
              <Image
                src="/third-party/stellar-logo.svg"
                alt="Stellar"
                width={106}
                height={26}
                style={{ height: "calc(var(--cap) * 0.62)", width: "auto" }}
              />
            </span>
          </SweepReveal>
        </h2>
      </div>
    </section>
  );
}
