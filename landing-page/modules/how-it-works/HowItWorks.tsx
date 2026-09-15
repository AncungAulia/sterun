"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type CSSProperties, useEffect, useLayoutEffect, useRef } from "react";

import { HANDOVER_SCREEN, SCROLL_PER_BOX_HEIGHT } from "@/lib/hiwMotion";
import { HowItWorksTrack } from "@/modules/how-it-works/HowItWorksTrack";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * STE-12 How it works, opened by the two blocks that close Problem.
 *
 * Scrubbed to the scroll, and the page never stops moving until the steps:
 *
 *  1. While the blocks rise, the coal block wipes right across the content
 *     width and uncovers the heading, and at the same time the blue runway
 *     wipes left until it runs edge to edge.
 *  2. Straight on, still scrolling, the runway pours down as one plain blue
 *     box, the box that holds the steps (HowItWorksTrack); its contents stay
 *     put while its edge comes down over them. The pour is done as the section
 *     reaches the top of the screen.
 *  3. From halfway through the pour, the box opens: a layered colour wipe
 *     inside it lifts off its cover while the heading carries on up and off
 *     the screen, and it finishes exactly as the box reaches the top.
 *  4. The box holds, a full screen, and the steps run through it.
 *
 * The one hold is a sticky element with a negative top, the heading's height,
 * so it catches the moment the box reaches the top. No scripted pin, so nothing
 * shifts layout.
 *
 * Everything that moves is a transform, so the compositor carries it and no
 * frame has to repaint or lay out. The coal wipe is a mask (the block moves one
 * way, its contents the other) rather than an animated width or clip-path for
 * the same reason, and so is the box.
 *
 * The markup is the finished state. Reduced motion keeps it as it is, without
 * the long scroll.
 */

/**
 * Where the wipes hand over to the pour (lib/hiwMotion.ts). The wipes run from
 * 85% to here, the pour from here until the section reaches the top: at
 * 1440x900, 405px of scroll for the wipes and 232px for the pour.
 */
const HANDOVER = `top ${HANDOVER_SCREEN * 100}%`;

/** Everything above the box: the gap under the header, then the coal row. */
const HEAD = "(var(--stage-pt) + var(--coal-h))";
/** The box is a screen tall plus the 1px it tucks under the runway. */
const TRACK = `${SCROLL_PER_BOX_HEIGHT} * (100svh + 1px)`;

export function HowItWorks() {
  const revealRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const coalRef = useRef<HTMLDivElement>(null);
  const coalInnerRef = useRef<HTMLDivElement>(null);
  const coalProbeRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const runwayRef = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const reveal = revealRef.current;
    const stage = stageRef.current;
    const row = rowRef.current;
    const coal = coalRef.current;
    const coalInner = coalInnerRef.current;
    const probe = coalProbeRef.current;
    const fill = fillRef.current;
    const runway = runwayRef.current;
    if (!reveal || !stage || !row || !coal || !coalInner || !probe || !fill || !runway) return;

    const panels = gsap.utils.toArray<HTMLElement>(":scope > [data-panel]", fill);

    // Read at every refresh, so a resize re-derives the start positions.
    const coalWidth = () => probe.offsetWidth;
    const coalOffset = () => row.clientWidth - coalWidth();
    const runwayStart = () => row.getBoundingClientRect().left + coalWidth();

    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // Phase one. Linear, because the edges are meant to feel pushed by the
      // scroll rather than animated on their own.
      gsap
        .timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: row,
            start: "top 85%",
            end: HANDOVER,
            scrub: true,
            invalidateOnRefresh: true,
          },
        })
        .fromTo(coal, { x: () => -coalOffset() }, { x: 0 }, 0)
        .fromTo(coalInner, { x: () => coalOffset() }, { x: 0 }, 0)
        .fromTo(runway, { x: () => runwayStart() }, { x: 0 }, 0);

      // Phase two, picking up exactly where phase one stops and landing exactly
      // where the track starts. Percentages only, so nothing here needs
      // invalidating on refresh: an invalidated tween forgets its start values
      // until the playhead reaches it, and a panel waiting its turn in the
      // stagger was measured sitting fully down before it began.
      const pour = gsap.timeline({
        defaults: { ease: "power2.inOut", duration: 1 },
        scrollTrigger: {
          trigger: row,
          start: HANDOVER,
          endTrigger: reveal,
          end: "top top",
          scrub: true,
        },
      });
      panels.forEach((panel) => {
        pour.fromTo(panel, { yPercent: -100 }, { yPercent: 0 }, 0);
        // The box's contents travel the other way, so they hold still while
        // its edge comes down over them.
        const inner = panel.querySelector<HTMLElement>(":scope > [data-panel-inner]");
        if (inner) pour.fromTo(inner, { yPercent: 100 }, { yPercent: 0 }, 0);
      });
    });

    return () => mm.revert();
  }, []);

  return (
    <section
      id="how-it-works"
      data-nav-theme="light"
      aria-labelledby="how-it-works-heading"
      // overflow-x-clip rather than hidden: hidden would make the section the
      // scroll container of the sticky element and it would never stick.
      className="relative overflow-x-clip bg-paper [--stage-pt:6rem] sm:[--stage-pt:8rem]"
      style={
        {
          // Coal block landscape at 1.7:1, runway 30% of its height.
          "--coal-w": "max(21vw, 9rem)",
          "--coal-h": "calc(var(--coal-w) / 1.7)",
        } as CSSProperties
      }
    >
      <div
        ref={revealRef}
        data-hiw-reveal
        className="relative motion-reduce:!h-auto"
        style={{ height: `calc(${HEAD} + 100svh + ${TRACK})` }}
      >
        {/* For the header, which caches document offsets. The only dark thing
            that passes under it here is the coal row with the runway, and it
            only does so while the stage is moving with the page, so its plain
            document position is the right one. */}
        <div
          aria-hidden
          data-nav-theme="dark"
          className="pointer-events-none absolute inset-x-0 top-[var(--stage-pt)] h-[var(--coal-h)]"
        />

        {/* The hold. Its top is negative by the heading's height, so it catches
            the moment the box, a screen tall, reaches the top of the screen. */}
        <div
          ref={stageRef}
          data-hiw-stage
          className="sticky overflow-hidden pt-[var(--stage-pt)] motion-reduce:static"
          style={{ top: `calc(-1 * ${HEAD})`, height: `calc(${HEAD} + 100svh)` }}
        >
          {/* Same container and gutter as every other section. */}
          <div className="mx-auto w-full max-w-[1600px] px-5 max-[359px]:px-4 sm:px-10 lg:px-[68px]">
            <div ref={rowRef} data-hiw-row className="relative overflow-hidden" style={{ height: "var(--coal-h)" }}>
              <div ref={coalProbeRef} aria-hidden className="invisible absolute h-0 w-[var(--coal-w)]" />
              <div ref={coalRef} className="absolute inset-0 overflow-hidden bg-ink">
                <div ref={coalInnerRef} className="absolute inset-x-0 top-0 flex h-[70%] items-center justify-end">
                  <h2
                    id="how-it-works-heading"
                    className="heading-hero whitespace-nowrap uppercase leading-none text-paper"
                    style={{
                      fontSize: "calc(var(--coal-h) * 0.42)",
                      paddingRight: "calc(var(--coal-h) * 0.18)",
                    }}
                  >
                    How it works
                  </h2>
                </div>
              </div>
            </div>
          </div>

          {/* The runway: full bleed, so it can reach both edges of the page, and
              laid over the bottom 30% of the coal block. */}
          <div
            ref={runwayRef}
            aria-hidden
            className="absolute inset-x-0 bg-teal will-change-transform"
            style={{ top: "calc(var(--stage-pt) + var(--coal-h) * 0.7)", height: "calc(var(--coal-h) * 0.3)" }}
          />

          {/* The fill starts on the runway's bottom edge and is a full screen
              tall, so the box it lands fills the viewport once the heading has
              gone. It tucks 1px under the runway: both edges land on fractional
              pixels, rounded separately, and on a 390px phone the gap between
              them showed as a hairline of page colour mid-pour. */}
          {/* data-nav-bounds: the header cuts the blue cover inside the box to
              this rectangle. A static document band cannot follow the cover:
              it slides down while the page scrolls up, and the first version
              drew the header dark over the rows the wipe had already
              uncovered. */}
          <div
            ref={fillRef}
            data-nav-bounds
            className="absolute inset-x-0 overflow-hidden"
            style={{ top: "calc(var(--stage-pt) + var(--coal-h) - 1px)", height: "calc(100svh + 1px)" }}
          >
            <HowItWorksTrack />
          </div>
        </div>
      </div>
    </section>
  );
}
