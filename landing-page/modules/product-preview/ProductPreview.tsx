"use client";

/**
 * Product preview: the one section that shows the thing instead of describing it.
 *
 * Everything else on this page is typography. A reader who has just been told
 * four steps has no reason to believe any of them, and the contract links in
 * Problem send them to stellar.expert, which is a foreign technical surface.
 * This sends them into our own working app, so the link is the evidence and the
 * picture is only the invitation.
 *
 * MEASURED FROM nbnzia.com, the CTO Bees panel, at 1440x900, sampled every 30px
 * of scroll. Do not adjust these by eye; re-measure.
 *
 * The panel itself does not animate. Its top moves exactly 1px per 1px of
 * scroll. What reads as a reveal is a panel exactly one viewport tall arriving
 * against a hard colour edge, over a previous section that is being HELD.
 *
 * Geometry, as fractions of their 1425x900 panel:
 *
 *   side padding      16px            1.1% of the width
 *   title row         top 80px        one row, title in the left corner and a
 *                                     label in the right one
 *   title             64px / 500      not enormous. The hierarchy is the gap
 *                                     between it and the copy, not its size
 *   copy              16px / 500      a quarter of the title, in a 36.5% column
 *   link              bottom at 847   level with the image's bottom edge
 *   image             607 square      43% of the panel width, right edge 16px in
 *
 * What moves, and how:
 *
 *   text    opacity 0 to 1 while rising 50px, both driven by one eased
 *           progress. power1.out fits their samples to two decimals.
 *   image   the WRAPPER's clip-path opens downward, inset(0 0 100%) to
 *           inset(0 0 0%), while the picture inside slides from -12% of the
 *           wrapper height to 0 on the same progress. That is the wipe: the
 *           window grows down and the picture arrives into it.
 *           Its curve is a far stronger ease-in-out than the text (their
 *           progress is still 0.009 a fifth of the way through) and it runs
 *           about 1.4x as long: in their samples the title reaches opacity 1
 *           after roughly 15 of them and the image finishes after roughly 21.
 *   link    does not animate at all.
 *
 * Order of entry, by the panel's top edge when each one starts: title at 730,
 * label at 640, image at 610, copy at 550. The image begins BEFORE the copy,
 * which is what stops the left column arriving as one block.
 */

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const TEXT = { rise: 50, duration: 0.7, ease: "power1.out" };
const IMAGE = { slide: "-12%", duration: 1.0, ease: "power3.inOut" };
/** Start times, in the order measured: title, label, image, copy. */
const AT = { title: 0, label: 0.12, image: 0.16, copy: 0.24 };
/** The panel's top edge, as a fraction of the viewport, when the title starts. */
const START = "top 81%";

export function ProductPreview() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const q = gsap.utils.selector(root);

      const tl = gsap.timeline({
        paused: true,
        defaults: { duration: TEXT.duration, ease: TEXT.ease },
      });
      for (const name of ["title", "label", "copy"] as const) {
        tl.fromTo(
          q(`[data-pp="${name}"]`),
          { opacity: 0, y: TEXT.rise },
          { opacity: 1, y: 0, stagger: 0.06 },
          AT[name],
        );
      }
      tl.fromTo(
        q("[data-pp-frame]"),
        { clipPath: "inset(0% 0% 100% 0%)" },
        { clipPath: "inset(0% 0% 0% 0%)", duration: IMAGE.duration, ease: IMAGE.ease },
        AT.image,
      ).fromTo(
        q("[data-pp-picture]"),
        { y: IMAGE.slide },
        { y: "0%", duration: IMAGE.duration, ease: IMAGE.ease },
        AT.image,
      );

      // It plays again every time the reader comes back down to it, rather than
      // once for the life of the page.
      const st = ScrollTrigger.create({
        trigger: root,
        start: START,
        onEnter: () => tl.restart(),
        onEnterBack: () => tl.restart(),
        onLeaveBack: () => tl.pause(0),
      });

      return () => {
        st.kill();
        tl.kill();
      };
    });

    return () => mm.revert();
  }, []);

  return (
    <section
      ref={rootRef}
      id="product"
      data-nav-theme="dark"
      /* Exactly one screen tall, so it lands filling the viewport the moment it
         arrives. The negative margin is what makes it rise OVER the held How it
         works box instead of pushing it: that section carries a matching extra
         screen of height, so the page is no taller than it was. */
      className="relative z-10 -mt-[100svh] h-[100svh] overflow-hidden bg-teal text-paper [--pp-pt:6rem] sm:[--pp-pt:8rem]"
    >
      <div className="relative mx-auto flex h-full max-w-[1500px] flex-col px-5 sm:px-6 lg:px-4">
        {/* Title in the left corner, label in the right one, on one row, the way
            the reference composes its hat. */}
        <div
          className="flex items-start justify-between gap-6"
          style={{ paddingTop: "var(--pp-pt)" }}
        >
          <h2 className="heading-hero tracking-[-0.015em] [--pp-title:clamp(4rem,11.5vw,11rem)]">
            <span data-pp="title" className="block text-[length:var(--pp-title)] leading-[0.82]">
              Open it.
            </span>
            <span
              data-pp="title"
              className="mt-[calc(var(--pp-title)*0.2)] block text-[clamp(1.5rem,3.2vw,3rem)] leading-[1]"
            >
              No wallet needed.
            </span>
          </h2>

          <span
            data-pp="label"
            className="mt-[0.9em] shrink-0 text-right text-base font-medium leading-tight"
          >
            Live on
            <br />
            Stellar testnet
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 pt-8 lg:pt-10">
          <div className="flex flex-col lg:h-full lg:w-[36%]">
            <p data-pp="copy" className="max-w-[46ch] text-sm leading-[1.6] text-teal-50">
              The event directory and every event page read straight from the chain. Browse them the
              way a runner would, before you connect anything.
            </p>

            <a
              href="#"
              className="wipe-underline relative mt-8 inline-flex w-fit items-center gap-3 text-base font-medium leading-tight text-paper lg:mt-auto lg:mb-[7vh]"
            >
              Browse live events
              <svg
                width="17"
                height="17"
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

          {/* The frame is the mask: its clip-path opens downward and the picture
              slides into the opening. It sits hard against the panel's bottom
              edge and close to its right one.

              PLACEHOLDER. Replaced by a screenshot of one real event page once a
              demo event exists: every event in the app today is test data named
              TESTING or e2e, and none has a poster. */}
          <div
            data-pp-frame
            className="ml-auto min-h-0 w-full overflow-hidden lg:absolute lg:bottom-0 lg:right-[6.7%] lg:top-[26.3%] lg:h-auto lg:w-[44.3%]"
          >
            <div
              data-pp-picture
              className="grid h-full min-h-[34svh] w-full place-items-center bg-paper lg:min-h-0"
            >
              <span className="text-sm text-n-600">Screenshot of an event page</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
