"use client";

/**
 * The answer to "Why Stellar": three claims over a photograph of a runner on a
 * track, two screens tall.
 *
 * THE TRANSITION IN. The photograph rises over the held WHY Stellar heading
 * rather than pushing it away, the same move Product preview makes over How it
 * works: this section carries -100svh and a higher z-index, and the heading's
 * section is tall enough that its sweep has finished before the photograph
 * starts to rise at all.
 *
 * LAYOUT. Nabil's layout, measured off the mockup as fractions of the image:
 *
 *   claim   left    top     width
 *   one     39.9%    8.9%   48.1%
 *   two     51.0%   40.8%   44.8%
 *   three   28.5%   74.6%   44.8%
 *
 * The section keeps the photograph's own aspect ratio on anything wider than a
 * phone, so those percentages land on the same lanes at every width. A phone
 * would shrink the whole thing to under one screen, so there it is two screens
 * tall, the photograph is cropped to cover, and the claims widen.
 *
 * MOTION. Each claim appears on its own as the reader reaches it, never all at
 * once: its lines rise out of a mask, one after the other, the way Apple sets a
 * headline in. Scrolling back above it lowers them again quickly, and coming
 * back down raises them again; a claim already on screen is never replayed.
 *
 * SHADOW. Drop shadow x 22, y 19, blur 6.8, 57% opacity, as specified at the
 * 1440 design width and scaled with the section so a phone does not get a
 * shadow a third of the letter's size. A line mask clips everything outside the
 * line, shadow included, so the mask is padded right and down by the shadow's
 * reach and pulled back with a negative margin: layout unchanged, shadow whole.
 */

import Image from "next/image";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

const CLAIMS = [
  {
    text: "Non-transferable records mean a bib can't be resold.",
    place: "sm:left-[39.9%] sm:top-[8.9%] sm:w-[48.1%]",
    phone: "top-[9%]",
  },
  {
    text: "Organiser-signed finish results mean a time can't be forged.",
    place: "sm:left-[51%] sm:top-[40.8%] sm:w-[44.8%]",
    phone: "top-[41%]",
  },
  {
    text: "Settlement reaches the organiser directly.",
    place: "sm:left-[28.5%] sm:top-[74.6%] sm:w-[44.8%]",
    phone: "top-[74%]",
  },
] as const;

const START = "top 78%";
/** Where a hidden line waits, clear of its padded mask. */
const HIDDEN = 160;

export function WhyStellarTrack() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    gsap.registerPlugin(ScrollTrigger, SplitText);

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const cleanups = gsap.utils.toArray<HTMLElement>("[data-why-claim]", root).map((claim) => {
        const split = SplitText.create(claim, {
          type: "lines",
          mask: "lines",
          linesClass: "why-line",
          aria: "auto",
        });
        const lines = split.lines;
        // Hidden lines sit at 160%, not 110%: the mask is padded downwards to
        // keep the shadow whole, and a line pushed just past its own height
        // still showed its tops through that padding.
        gsap.set(lines, { yPercent: HIDDEN });

        // Showing and hiding are two tweens from wherever the lines are now, not
        // one timeline restarted. restart() on the way back up made a claim that
        // was already on screen vanish and replay as it came back into view, and
        // pause(0) dropped it out in a single frame when the reader scrolled above
        // it. overwrite hands over mid-flight, so reversing direction halfway
        // through never jumps.
        const show = () =>
          gsap.to(lines, { yPercent: 0, duration: 1.1, ease: "expo.out", stagger: 0.12, overwrite: true });
        const hide = () =>
          gsap.to(lines, {
            yPercent: HIDDEN,
            duration: 0.45,
            ease: "power2.in",
            stagger: { each: 0.05, from: "end" },
            overwrite: true,
          });

        const st = ScrollTrigger.create({ trigger: claim, start: START, onEnter: show, onLeaveBack: hide });
        // Reloaded further down the page: already past it, so simply shown.
        if (st.scroll() > st.start) gsap.set(lines, { yPercent: 0 });

        return () => {
          st.kill();
          gsap.killTweensOf(lines);
          split.revert();
        };
      });
      return () => cleanups.forEach((c) => c());
    });

    return () => mm.revert();
  }, []);

  return (
    <section
      ref={rootRef}
      id="why-stellar-answer"
      data-nav-theme="dark"
      className="why-track relative z-10 -mt-[100svh] h-[200svh] overflow-hidden bg-teal-800 text-paper sm:aspect-[1052/1495] sm:h-auto"
    >
      <Image
        src="/images/why-stellar/track.webp"
        alt=""
        fill
        sizes="100vw"
        className="object-cover object-[32%_50%] sm:object-center"
      />

      <h2 className="sr-only">Why Stellar</h2>

      {CLAIMS.map((claim) => (
        <p
          key={claim.text}
          data-why-claim
          className={`why-claim heading-hero absolute left-[7%] w-[86%] text-[clamp(2.25rem,5.2vw,6rem)] uppercase leading-[0.92] ${claim.phone} ${claim.place}`}
        >
          {claim.text}
        </p>
      ))}
    </section>
  );
}
