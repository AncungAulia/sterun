"use client";

/**
 * Product preview: the one section that shows the thing instead of describing it.
 *
 * Everything else on this page is typography. A reader who has just been told
 * four steps has no reason to believe any of them, and the contract links in
 * Problem send them to stellar.expert, which is a foreign, technical surface.
 * This section sends them into our own working app instead, and the button is
 * the evidence. The screenshot is only the invitation.
 *
 * The movement is measured from nbnzia.com's case panels, at 1440x900, sampled
 * every 50px of scroll:
 *
 *   The panel itself does not animate. Its top moves exactly 1px per 1px of
 *   scroll from entering to landing. What reads as a reveal is the panel being
 *   exactly one viewport tall against a hard colour edge, nothing more.
 *
 *   The overlap is the previous section being HELD while this one rises over
 *   it. There it is a GSAP pin with a two-viewport spacer for a one-viewport
 *   panel. Here the How it works stage is already sticky, so it costs one extra
 *   viewport of height on that section and a matching negative margin here.
 *
 *   The heading fades 0 to 1 while rising 50px, on a quadratic ease-out
 *   (power1.out fits the samples to two decimals), triggered when the panel's
 *   top crosses about 77% of the viewport. A second element follows about 100px
 *   of scroll later. Their body paragraph does not animate at all.
 *
 * We have three things to bring in rather than two, so the stagger carries the
 * body and the button as well. It is the same technique, not a new one.
 */

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/** Measured from the reference: the rise, the curve, and where it starts. */
const RISE_PX = 50;
const DURATION = 0.8;
const EASE = "power1.out";
const STAGGER = 0.12;
/** The panel's top edge, as a fraction of the viewport, when the heading starts. */
const START = "top 77%";

export function ProductPreview() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const items = gsap.utils.toArray<HTMLElement>("[data-pp-rise]", root);
      gsap.set(items, { opacity: 0, y: RISE_PX });
      gsap.to(items, {
        opacity: 1,
        y: 0,
        duration: DURATION,
        ease: EASE,
        stagger: STAGGER,
        scrollTrigger: { trigger: root, start: START, once: true },
      });
    });

    return () => mm.revert();
  }, []);

  return (
    <section
      ref={rootRef}
      id="product"
      data-nav-theme="dark"
      /* The panel is exactly one screen tall, so it lands filling the viewport
         the moment it arrives. The negative margin is what makes it rise OVER
         the held How it works box instead of pushing it: that section carries a
         matching extra screen of height, so the page is no longer overall. */
      className="relative z-10 -mt-[100svh] h-[100svh] overflow-hidden bg-ink text-paper [--pp-pt:6rem] sm:[--pp-pt:8rem]"
    >
      {/* The top padding is the same gap under the fixed header that How it
          works uses, so the heading does not sit on the logo's line. */}
      <div
        className="mx-auto flex h-full max-w-[1400px] flex-col gap-8 px-6 pb-[6vh] sm:px-10 lg:flex-row lg:items-stretch lg:gap-16"
        style={{ paddingTop: "var(--pp-pt)" }}
      >
        <div className="flex flex-col lg:w-[44%] lg:shrink-0">
          <h2
            data-pp-rise
            className="heading-hero text-[clamp(2.25rem,4.6vw,3.75rem)] leading-[0.95] tracking-[-0.01em]"
          >
            Open it.
            <br />
            No wallet needed.
          </h2>

          <p
            data-pp-rise
            className="mt-6 max-w-[46ch] text-[clamp(1rem,1.25vw,1.25rem)] leading-[1.55] text-n-300"
          >
            The event directory and every event page read straight from the chain. Browse them the
            way a runner would, before you connect anything.
          </p>

          <div data-pp-rise className="mt-auto pt-10">
            <a
              href="#"
              className="wipe-underline inline-flex items-center gap-3 text-[clamp(1rem,1.4vw,1.375rem)] font-medium"
            >
              Browse live events
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12h13M12.5 5.5 19 12l-6.5 6.5" />
              </svg>
            </a>
          </div>
        </div>

        {/* PLACEHOLDER. Replaced by a screenshot of one real event page once a
            demo event exists: every event in the app today is test data named
            TESTING or e2e, and none has a poster. The caption stays neutral
            until then, because a claim about a screenshot is the easiest thing
            on this page for a reviewer to knock down. */}
        <figure data-pp-rise className="flex min-h-0 flex-1 flex-col justify-end">
          <div className="relative w-full overflow-hidden rounded-[var(--radius-lg)] border border-dashed border-n-700 bg-n-950">
            <div className="aspect-[16/11] w-full" />
            <div className="absolute inset-0 grid place-items-center">
              <span className="text-sm text-n-400">Screenshot of an event page</span>
            </div>
          </div>
          <figcaption className="mt-4 max-w-[52ch] text-sm leading-[1.6] text-n-400">
            An event page in the Sterun app, read from EventRegistry on the Stellar testnet.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
