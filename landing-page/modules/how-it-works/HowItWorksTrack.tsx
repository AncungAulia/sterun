"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { HANDOVER_SCREEN, PANEL_WIDTH, SCROLL_PER_BOX_HEIGHT, panelFrame, trackX } from "@/lib/hiwMotion";
import { notifyScroll } from "@/lib/scroll";
import { StepDetail } from "@/modules/how-it-works/StepDetail";
import { STEPS, STEP_TITLE_SIZE } from "@/modules/how-it-works/steps";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The four steps of How it works, inside the blue box that the pour lands.
 *
 * The box is the last panel of the pour (HowItWorks.tsx) and the container of
 * the track: the track is clipped by it, and its blue is the bottom layer under
 * every step. Once the box reaches the top of the screen it holds and the track
 * runs through it, driven by the model in lib/hiwMotion.ts, which is measured
 * from akaru.fr rather than designed:
 *
 *  - The track eases out and stops when the last step reaches the left edge.
 *  - Waiting steps are pulled toward the right edge and let go as the step
 *    before them opens.
 *  - Each step's picture window opens from its left-centre edge while rising
 *    into place, and the picture inside shrinks by the inverse.
 *  - Once a step's left edge passes a line, its title, meta and button play
 *    in on a timer (not scrubbed), and play out if the reader scrolls back.
 *
 * A step's arrow opens it to fill the box (StepDetail) with its description and
 * the links behind it.
 *
 * Everything is sized from the box, not the viewport: --bw is the box's width.
 * Pictures are placeholders until the STE-18 mockups exist.
 */

/**
 * Sizes as fractions of the box width, from akaru at 1440: 10px gutter and
 * small type, 12px pill type, 60px button, 96px title. Floors keep the small
 * pieces usable on a phone.
 */
const BOX_VARS = {
  "--bw": "100vw",
  "--g": "max(8px, calc(var(--bw) * 0.00694))",
  "--small": "max(10px, calc(var(--bw) * 0.00694))",
  "--pill": "max(11px, calc(var(--bw) * 0.00833))",
  "--cta": "max(44px, calc(var(--bw) * 0.0417))",
} as CSSProperties;

/**
 * The cover over the box's contents, bottom of the stack first. The pour lands
 * the box showing only the top layer, brand blue; opening, the layers leave
 * from the top down, so the edge travelling over the steps goes blue to coal.
 */
const COVER_LAYERS = ["bg-ink", "bg-teal-800", "bg-teal-700", "bg-teal-600", "bg-teal"] as const;

/** Offset between cover layers, as a fraction of one layer's travel. */
const COVER_STAGGER = 0.12;

/** Timed reveal, from frame-by-frame recordings of akaru's second project. */
const REVEAL_IN = { chars: 0.5, charStagger: 0.04, meta: 0.55, pillDelay: 0.15, detailDelay: 0.25, detailStagger: 0.1, buttonDelay: 0.2 };
const REVEAL_OUT = { duration: 0.3, buttonDelay: 0.3 };

function ArrowUpRight({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 19 19" aria-hidden className={className} fill="none">
      <path
        d="M1 18 18 1M9 1h9v9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HowItWorksTrack() {
  const boxRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [openStep, setOpenStep] = useState<number | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  // Focus goes back to the arrow that opened the step, but only after the next
  // render: until then the track is still inert and the focus call is ignored.
  const closeStep = useCallback(() => {
    setOpenStep(null);
    requestAnimationFrame(() => openerRef.current?.focus({ preventScroll: true }));
  }, []);

  useIsomorphicLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger, SplitText);

    const box = boxRef.current;
    const track = trackRef.current;
    const reveal = box?.closest<HTMLElement>("[data-hiw-reveal]");
    const stage = box?.closest<HTMLElement>("[data-hiw-stage]");
    if (!box || !track || !reveal || !stage) return;

    let boxWidth = box.clientWidth;
    let relayout: (() => void) | null = null;
    const setSize = () => {
      boxWidth = box.clientWidth;
      box.style.setProperty("--bw", `${boxWidth}px`);
      box.style.setProperty("--bh", `${box.clientHeight}px`);
    };
    const resize = new ResizeObserver(() => {
      setSize();
      relayout?.();
    });
    setSize();
    resize.observe(box);

    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // Topmost first: the brand blue leaves first and uncovers the darker
      // layers under it, ink last, then the steps.
      const coverLayers = gsap.utils.toArray<HTMLElement>(":scope > [data-hiw-cover]", box).reverse();
      const panels = gsap.utils.toArray<HTMLElement>("[data-hiw-panel]", track);
      const windows = panels.map((p) => p.querySelector<HTMLElement>("[data-hiw-window]")!);
      const images = panels.map((p) => p.querySelector<HTMLElement>("[data-hiw-image]")!);
      const rises = panels.map((p) => gsap.utils.toArray<HTMLElement>("[data-hiw-rise]", p));
      const buttons = panels.map((p) => p.querySelector<HTMLButtonElement>("[data-hiw-cta]")!);
      const splits = panels.map((p) =>
        SplitText.create(p.querySelector<HTMLElement>("[data-hiw-title]")!, {
          type: "lines,chars",
          mask: "lines",
          charsClass: "hiw-char",
          aria: "auto",
        }),
      );

      const revealed = panels.map(() => true);
      const playIn = (i: number) => {
        const [pill, ...details] = rises[i];
        gsap.to(splits[i].chars, { yPercent: 0, duration: REVEAL_IN.chars, stagger: REVEAL_IN.charStagger, ease: "power3.out", overwrite: true });
        gsap.to(pill, { yPercent: 0, duration: REVEAL_IN.meta, delay: REVEAL_IN.pillDelay, ease: "power3.out", overwrite: true });
        gsap.to(details, { yPercent: 0, duration: REVEAL_IN.meta, delay: REVEAL_IN.detailDelay, stagger: REVEAL_IN.detailStagger, ease: "power3.out", overwrite: true });
        gsap.to(buttons[i], { scale: 1, duration: REVEAL_IN.meta, delay: REVEAL_IN.buttonDelay, ease: "power3.out", overwrite: true });
        buttons[i].tabIndex = 0;
      };
      // Leaving is one quick move for all the type, no stagger, and the button
      // only shrinks once the type has gone.
      const playOut = (i: number) => {
        gsap.to(splits[i].chars, { yPercent: 120, duration: REVEAL_OUT.duration, ease: "power2.inOut", overwrite: true });
        gsap.to(rises[i], { yPercent: 110, duration: REVEAL_OUT.duration, ease: "power2.inOut", overwrite: true });
        gsap.to(buttons[i], { scale: 0, duration: REVEAL_OUT.duration, delay: REVEAL_OUT.buttonDelay, ease: "power2.inOut", overwrite: true });
        buttons[i].tabIndex = -1;
      };
      const setRevealed = (i: number, on: boolean, instant = false) => {
        if (revealed[i] === on) return;
        revealed[i] = on;
        if (instant) {
          gsap.set(splits[i].chars, { yPercent: on ? 0 : 120 });
          gsap.set(rises[i], { yPercent: on ? 0 : 110 });
          gsap.set(buttons[i], { scale: on ? 1 : 0 });
          buttons[i].tabIndex = on ? 0 : -1;
        } else if (on) playIn(i);
        else playOut(i);
      };

      // Last written values, so a frame only touches what moved.
      const last = panels.map(() => ({ pull: NaN, scale: NaN, drop: NaN }));
      let lastTrack = NaN;
      let progress = 0;

      const layout = (instantReveal = false) => {
        const x = trackX(progress);
        if (x !== lastTrack) {
          lastTrack = x;
          track.style.transform = `translate3d(${x * boxWidth}px, 0, 0)`;
        }
        for (let i = 0; i < panels.length; i++) {
          const f = panelFrame(i, progress, x);
          const l = last[i];
          if (f.pull !== l.pull) {
            l.pull = f.pull;
            panels[i].style.transform = `translate3d(${f.pull * boxWidth}px, 0, 0)`;
          }
          if (f.scale !== l.scale || f.drop !== l.drop) {
            l.scale = f.scale;
            l.drop = f.drop;
            // Translate first so the drop is not scaled with the window.
            windows[i].style.transform = `translate3d(0, ${f.drop * windows[i].offsetHeight}px, 0) scale(${f.scale})`;
            images[i].style.transform = `scale(${2 - f.scale})`;
          }
          setRevealed(i, f.revealed, instantReveal);
        }
      };
      relayout = () => {
        lastTrack = NaN;
        last.forEach((l) => (l.pull = l.scale = l.drop = NaN));
        layout(true);
      };

      // Start from the resting frame, with every step's reveal already settled.
      layout(true);

      // The box is a screen tall plus a 1px tuck; the stage is the heading plus
      // a screen. The hold catches the heading's height after the section
      // reaches the top, which is when the pour has landed the box, still plain
      // blue, filling the screen.
      const head = () => stage.clientHeight - (box.clientHeight - 1);
      // Offsets from the moment the section's top reaches the top of the
      // screen. The pour starts when the coal row (stage padding down) is at
      // the handover height, and the wipe starts halfway through the pour.
      const offset = (px: number) => `top${px < 0 ? "-=" : "+="}${Math.abs(px)} top`;
      const row = stage.querySelector<HTMLElement>("[data-hiw-row]")!;
      const wipeStart = () => (row.offsetTop - HANDOVER_SCREEN * window.innerHeight) / 2;

      // First the cover lifts off the contents, top edges first, travelling
      // down: a stack of colour layers dealt off one after another like the
      // menu, brand blue leaving first and ink last, so the band between the
      // steps and the blue reads as a gradient. Until it starts moving the
      // contents are not drawn at all. Drawn under the cover, they bled through
      // the box's fractional top edge while the pour brought it down and showed
      // as a pale hairline across the blue.
      const inner = box.querySelector<HTMLElement>(":scope > [data-panel-inner]")!;
      inner.style.visibility = "hidden";
      const wipe = gsap.timeline({
        defaults: { ease: "power2.inOut", duration: 1 },
        onUpdate() {
          inner.style.visibility = this.progress() > 0 ? "visible" : "hidden";
          // The header reads the cover live; tell it the layers just moved.
          notifyScroll();
        },
        scrollTrigger: {
          trigger: reveal,
          start: () => offset(wipeStart()),
          end: () => offset(head()),
          scrub: true,
        },
      });
      coverLayers.forEach((layer, index) => {
        wipe.fromTo(layer, { yPercent: 0 }, { yPercent: 100 }, index * COVER_STAGGER);
      });

      // Then, straight on, the track.
      ScrollTrigger.create({
        trigger: reveal,
        start: () => offset(head()),
        end: () => `+=${box.clientHeight * SCROLL_PER_BOX_HEIGHT}`,
        onUpdate: (self) => {
          progress = self.progress;
          layout();
        },
        onRefresh: (self) => {
          progress = self.progress;
          relayout?.();
        },
      });

      return () => {
        relayout = null;
        box.querySelector<HTMLElement>(":scope > [data-panel-inner]")!.style.visibility = "";
        splits.forEach((split) => split.revert());
        gsap.killTweensOf([...buttons, ...rises.flat()]);
        gsap.set([track, ...panels, ...windows, ...images, ...buttons, ...rises.flat()], { clearProps: "transform" });
      };
    });

    return () => {
      resize.disconnect();
      mm.revert();
    };
  }, []);

  return (
    <div
      ref={boxRef}
      data-panel
      // The box. Its blue is the bottom layer, the track sits on it, and both
      // are clipped to it. isolation keeps the clip holding for transformed
      // children in Safari.
      className="hiw absolute inset-0 isolate overflow-hidden bg-teal will-change-transform"
      style={BOX_VARS}
    >
      <div data-panel-inner className="hiw__mask absolute inset-0">
        <div
          ref={trackRef}
          role="region"
          aria-label="How it works, four steps"
          inert={openStep !== null}
          className="hiw__track"
        >
          {STEPS.map((step, i) => (
            <section
              key={step.index}
              data-hiw-panel
              aria-labelledby={`hiw-title-${i}`}
              className="hiw__panel relative h-full shrink-0 overflow-hidden text-ink"
              style={{ width: `calc(var(--bw) * ${PANEL_WIDTH})` }}
            >
              <div aria-hidden className={`absolute inset-0 ${step.bg}`} />

              <div className="relative h-[59.9%]">
                <div data-hiw-window className="hiw__window absolute inset-0 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element -- scaled
                      every frame inside a clipped window; next/image's wrapper
                      and srcset add nothing to a placeholder. */}
                  <img
                    data-hiw-image
                    src={step.image}
                    alt=""
                    className="hiw__image absolute inset-0 h-full w-full object-cover"
                  />
                </div>
              </div>

              <div className="relative h-[40.1%]">
                <div className="absolute inset-x-[var(--g)] top-[var(--g)] flex items-start justify-between gap-[var(--g)]">
                  <span className="block shrink-0 overflow-hidden rounded-full">
                    <span
                      data-hiw-rise
                      className="block rounded-full border border-ink px-[1.3em] py-[0.45em] font-semibold leading-[1.2]"
                      style={{ fontSize: "var(--pill)" }}
                    >
                      {step.pill}
                    </span>
                  </span>
                  {/* Two columns at the right, each a quarter of the panel, as on akaru.
                      A phone shows the first only. */}
                  <span
                    data-hiw-details
                    className="grid w-[47.2%] grid-cols-2 gap-x-[var(--g)] font-semibold uppercase leading-[1.4] tracking-[-0.05em] max-sm:w-auto max-sm:grid-cols-1"
                    style={{ fontSize: "var(--small)" }}
                  >
                    {step.details.map((detail, d) => (
                      <span key={detail} className={`block overflow-hidden ${d === 1 ? "max-sm:hidden" : ""}`}>
                        <span data-hiw-rise className="block">
                          {detail}
                        </span>
                      </span>
                    ))}
                  </span>
                </div>

                {/* Below the meta row, so a two-line title never runs into it.
                    The size is akaru's 6.67% of the width, capped by the box's
                    height for boxes shorter than akaru's full screen. */}
                <div
                  className="absolute inset-x-0 bottom-0 flex items-center justify-center px-[calc(var(--bw)*0.03)]"
                  style={{ top: "calc(var(--g) * 2 + var(--pill) * 2.1)" }}
                >
                  <h3
                    id={`hiw-title-${i}`}
                    data-hiw-title
                    className="text-balance text-center font-normal leading-[1.15] tracking-[-0.02em]"
                    style={{ fontSize: STEP_TITLE_SIZE }}
                  >
                    {step.title}
                  </h3>
                </div>
                <p className="sr-only">{step.body}</p>

                <span
                  aria-hidden
                  data-hiw-index
                  className="absolute bottom-[var(--g)] left-[var(--g)] font-semibold leading-none"
                  style={{ fontSize: "var(--small)" }}
                >
                  {step.index}
                </span>

                <button
                  data-hiw-cta
                  type="button"
                  aria-label={`Open ${step.title}`}
                  aria-haspopup="dialog"
                  aria-expanded={openStep === i}
                  onClick={(event) => {
                    openerRef.current = event.currentTarget;
                    setOpenStep(i);
                  }}
                  className="hiw-cta bottom-[var(--g)] right-[var(--g)]"
                >
                  <span aria-hidden className="hiw-cta__dot" />
                  <span aria-hidden className="hiw-cta__arrows">
                    <ArrowUpRight className="hiw-cta__arrow hiw-cta__arrow--rest" />
                    <ArrowUpRight className="hiw-cta__arrow hiw-cta__arrow--hover" />
                  </span>
                </button>
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Plain blue over the contents. The pour lands the box with this on
          top, so it fills the screen as a single colour, and the scroll then
          slides it down and out of the box. Clipped by the box, and while it
          covers the steps it also takes their clicks. Not drawn under reduced
          motion. */}
      {/* Live surfaces for the header: their edges move by script, so the
          header reads their rectangles every update, cut to the pour's fill.
          Later in the list is higher in the stack, so brand blue is on top. */}
      {COVER_LAYERS.map((className) => (
        <div
          key={className}
          aria-hidden
          data-hiw-cover
          data-nav-surface
          data-nav-live
          data-nav-theme="dark"
          className={`absolute inset-0 z-[5] will-change-transform motion-reduce:hidden ${className}`}
        />
      ))}

      {openStep !== null ? (
        <StepDetail key={openStep} step={STEPS[openStep]} index={openStep} onClosed={closeStep} />
      ) : null}
    </div>
  );
}
