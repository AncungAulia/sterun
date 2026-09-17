"use client";

/**
 * Closing CTA: the last thing a reader who scrolled to the end sees before the
 * footer, so they do not arrive at a list of links with nothing to do.
 *
 * Referenced from White Desert (Malvah, Awwwards SOTD and Developer Award,
 * 11 Sep 2026): it won without WebGL by treating space as the design. So this
 * screen is quieter than the two before it on purpose. One very large line, one
 * sentence, two actions, and a lot of ink around them. After a sweep and a
 * track, what reads as an ending is stillness.
 *
 * The only movement is the heading rising out of a line mask, then the sentence
 * and the actions after it. Scrolling back above it reverses them, and coming
 * back down plays them again.
 * SplitText's own mask does the masking, so there is no wrapper to maintain.
 */

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { APP_URL, X_URL } from "@/lib/links";

const START = "top 70%";

export function ClosingCta() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    gsap.registerPlugin(ScrollTrigger, SplitText);

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const q = gsap.utils.selector(root);
      const split = SplitText.create(q("[data-cta-title]"), { type: "lines", mask: "lines", aria: "auto" });

      const tl = gsap.timeline({ paused: true });
      tl.fromTo(
        split.lines,
        { yPercent: 105 },
        { yPercent: 0, duration: 0.9, ease: "power3.out", stagger: 0.09 },
        0,
      ).fromTo(
        q("[data-cta-rise]"),
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.7, ease: "power1.out", stagger: 0.08 },
        0.35,
      );

      const st = ScrollTrigger.create({
        trigger: root,
        start: START,
        // Forward plays it; going back above the start reverses it from wherever
        // it is, faster. The old restart() on the way back up replayed an entrance
        // that was already on screen, and pause(0) dropped it out in one frame.
        onEnter: () => tl.timeScale(1).play(),
        onLeaveBack: () => tl.timeScale(2.5).reverse(),
      });
      // Reloaded further down the page: already past it, so simply shown.
      if (st.scroll() > st.start) tl.progress(1);

      return () => {
        st.kill();
        tl.kill();
        split.revert();
      };
    });

    return () => mm.revert();
  }, []);

  return (
    <section
      ref={rootRef}
      id="start"
      data-nav-theme="dark"
      className="relative flex min-h-[100svh] flex-col justify-center bg-ink px-5 py-[16vh] text-paper sm:px-6 lg:px-4"
    >
      <div className="mx-auto w-full max-w-[1500px]">
        <h2
          data-cta-title
          className="heading-hero max-w-[14ch] text-[clamp(3.25rem,10.5vw,10.5rem)] uppercase leading-[0.88] tracking-[-0.015em]"
        >
          Put your next race on the record
        </h2>

        <div className="mt-[clamp(2.5rem,6vh,4.5rem)] flex flex-col gap-10 sm:flex-row sm:items-end sm:justify-between">
          <p data-cta-rise className="max-w-[38ch] text-sm leading-[1.6] text-n-300">
            Create the event once. Every runner who enters leaves with a record they keep.
          </p>

          {/* Two actions separated by space, not by a glyph. */}
          <div data-cta-rise className="flex flex-wrap items-center gap-x-10 gap-y-4">
            <a
              href={APP_URL || "#"}
              className="wipe-underline relative inline-flex items-center gap-3 text-base font-medium leading-tight"
            >
              Launch app
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h13M12.5 5.5 19 12l-6.5 6.5" />
              </svg>
            </a>
            <a
              href={X_URL}
              target="_blank"
              rel="noreferrer"
              className="wipe-underline relative inline-flex items-center gap-3 text-base font-medium leading-tight"
            >
              Follow @sterunxyz
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 17 17 7M8 7h9v9" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
