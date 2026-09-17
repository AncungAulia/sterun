"use client";

/**
 * The answer to "Why Stellar", written onto a running track.
 *
 * The approved sentence is one sentence with three claims in it. Here it is
 * broken at its commas into three clauses, the way Obys' Typography Principles
 * spends a whole screen on one phrase at a time, and each clause lands on the
 * track like a marking painted across the lanes.
 *
 * Plain CSS 3D, not WebGL. The track is a plane tilted back in perspective; the
 * clauses are children of that plane, so "lying on the track" is simply their
 * resting transform of none. Each one starts standing up out of the track
 * (rotateX cancelling the tilt), turned on its Z axis and lifted, and scroll
 * lays it down. The plane itself slides towards the reader across the section,
 * which is what makes it read as running along the track rather than watching
 * a floor. The text stays real text: selectable, readable by a screen reader,
 * set in our own font, at zero bytes of 3D library.
 *
 * TRACK IMAGE. `trackSrc` takes the webp once it exists. Until then the plane
 * draws its own lanes in tokens, in a deliberately high-contrast teal so the
 * motion can be judged. It is a placeholder, not a design.
 *
 * Reduced motion never builds the timeline, and the CSS resting state under
 * reduced motion is a flat plane facing the reader, so the three clauses are
 * simply three lines of text.
 */

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const CLAUSES = [
  "Non-transferable records mean a bib can't be resold,",
  "organiser-signed finish results mean a time can't be forged,",
  "and settlement reaches the organiser directly.",
] as const;

/**
 * The plane's tilt. The clauses cancel it to stand up, and rest at none to lie on
 * it. A phone gets far less: on a narrow screen 62 degrees foreshortened the
 * farthest clause to unreadable, so it lies at 40.
 */
const TILT = { wide: 62, narrow: 40 };

interface WhyStellarTrackProps {
  /** The running-track image. Omit to draw the placeholder lanes. */
  trackSrc?: string;
}

export function WhyStellarTrack({ trackSrc }: WhyStellarTrackProps) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const mm = gsap.matchMedia();
    mm.add(
      { motion: "(prefers-reduced-motion: no-preference)", narrow: "(max-width: 639px)" },
      (ctx) => {
        if (!ctx.conditions?.motion) return;
        const tilt = ctx.conditions.narrow ? TILT.narrow : TILT.wide;
        const q = gsap.utils.selector(root);
        const plane = q("[data-track-plane]");
        const clauses = q("[data-track-clause]");

        gsap.set(plane, { rotateX: tilt, yPercent: 28 });
        gsap.set(clauses, {
          rotateX: -tilt,
          rotateZ: (i: number) => [-14, 11, -8][i] ?? 0,
          z: 260,
          opacity: 0,
        });

        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut" },
          scrollTrigger: { trigger: root, start: "top top", end: "bottom bottom", scrub: 0.5 },
        });

        // The run: the whole track comes towards the reader across the section.
        tl.to(plane, { yPercent: -6, ease: "none", duration: 1 }, 0);

        // Each clause is laid down in turn, overlapping a little so there is
        // never a dead stretch of scroll where nothing moves.
        clauses.forEach((clause, i) => {
          const at = 0.06 + i * 0.26;
          tl.to(clause, { opacity: 1, duration: 0.08, ease: "none" }, at).to(
            clause,
            { rotateX: 0, rotateZ: 0, z: 0, duration: 0.3 },
            at,
          );
        });

        return () => {
          tl.scrollTrigger?.kill();
          tl.kill();
        };
      },
    );

    return () => mm.revert();
  }, []);

  return (
    <section
      ref={rootRef}
      id="why-stellar-answer"
      data-nav-theme="dark"
      className="relative h-[320svh] bg-teal-800 text-paper"
    >
      <h2 className="sr-only">Why Stellar</h2>

      <div className="sticky top-0 h-[100svh] overflow-hidden [perspective:1100px] [perspective-origin:50%_18%] motion-reduce:[perspective:none]">
        <div
          data-track-plane
          className="absolute inset-x-[-35%] bottom-[-12%] h-[118%] origin-bottom [transform-style:preserve-3d] motion-reduce:inset-x-0 motion-reduce:bottom-0 motion-reduce:h-full"
          style={
            trackSrc
              ? { backgroundImage: `url(${trackSrc})`, backgroundSize: "cover", backgroundPosition: "center bottom" }
              : undefined
          }
        >
          {trackSrc ? null : (
            /* PLACEHOLDER lanes: eight lanes of teal-700 lines, a start line near
               the reader. Replaced by the webp through `trackSrc`. */
            <div
              aria-hidden
              className="absolute inset-0 bg-teal-700 motion-reduce:hidden"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to right, transparent 0 calc(12.5% - 3px), var(--color-teal-200) calc(12.5% - 3px) 12.5%), linear-gradient(to top, transparent 9%, var(--color-paper) 9% 9.6%, transparent 9.6%)",
              }}
            />
          )}

          {/* The plane is 170% of the screen wide, so an inset of 20.6% puts this
              column exactly across the screen. A phone uses all of it; wider
              screens pull the clauses into a narrower column so they break
              into balanced lines rather than one long one. */}
          <div className="absolute inset-x-[20.6%] top-[8%] bottom-[18%] px-5 sm:inset-x-[35%] sm:px-0 flex flex-col justify-between motion-reduce:inset-0 motion-reduce:justify-center motion-reduce:gap-8 motion-reduce:px-6 motion-reduce:sm:inset-x-0 motion-reduce:sm:px-10">
            {CLAUSES.map((clause) => (
              <p
                key={clause}
                data-track-clause
                className="heading-hero text-balance text-center text-[clamp(2.25rem,5.4vw,5.5rem)] uppercase leading-[0.92] [backface-visibility:hidden] motion-reduce:text-[clamp(1.75rem,3.4vw,3.25rem)]"
              >
                {clause}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
