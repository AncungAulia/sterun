"use client";

/**
 * Anything revealed by a glowing bar sweeping across it, scrubbed to scroll.
 *
 * Everything is driven by one number, `--sweep-p` (0 to 100), which this
 * component scrubs and the CSS in globals.css reads. The text is clipped to the
 * bar's position, a gradient trail rides behind the bar, and a thin glowing
 * edge sits at it.
 *
 * Why GSAP rather than a native scroll-driven animation: this page already runs
 * Lenis and ScrollTrigger, and `animation-timeline` would be a second system
 * reading the same scroll position. The folder's own rule is that two of those
 * end up fighting, and it is the rule that stopped the How it works stage from
 * jittering. One system, and it works in every browser rather than the ones
 * that have shipped the spec.
 *
 * The caller supplies the scroll range through `trigger`, so this component
 * does not care how tall the section is or whether it is pinned. By default the
 * range is the trigger's whole scroll; `start` and `end` narrow it when
 * something else (a panel rising over it, say) has to wait for the sweep.
 */

import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface SweepRevealProps {
  children: ReactNode;
  /** The element whose scroll range drives the sweep. */
  trigger: RefObject<HTMLElement | null>;
  /** ScrollTrigger start and end of the range. Default: the trigger's whole scroll. */
  start?: string;
  end?: string;
  /** Where in that range the sweep starts and finishes, 0 to 1. */
  from?: number;
  to?: number;
  /** Brand colour for the bar and its glow. Any CSS colour; a token by default. */
  brand?: string;
  /** How much of the word the trail may cover, as a percentage. */
  cap?: number;
  /** How far the glow spills past the top and bottom edges. Behind glyphs it
      shows through the letters and needs almost none; behind a solid plate it
      only exists outside the plate. */
  bleed?: string;
  /** Leave the edge line in place at the end instead of fading it out. */
  keepEdge?: boolean;
  className?: string;
}

export function SweepReveal({
  children,
  trigger,
  start = "top top",
  end = "bottom bottom",
  from = 0.1,
  to = 0.75,
  brand = "var(--color-teal)",
  cap = 40,
  bleed = "6%",
  keepEdge = false,
  className,
}: SweepRevealProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    const host = trigger.current;
    if (!el || !host) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const state = { p: 0, glow: 1 };
      const write = () => {
        el.style.setProperty("--sweep-p", String(state.p));
        el.style.setProperty("--sweep-glow", String(state.glow));
      };
      write();

      const tl = gsap.timeline({
        scrollTrigger: { trigger: host, start, end, scrub: 0.4 },
      });
      // A gentle ease rather than a linear map, so the bar does not crawl at a
      // constant rate: it leans in, then eases off as the word completes.
      tl.to(state, { p: 100, ease: "power1.inOut", duration: to - from, onUpdate: write }, from);
      if (!keepEdge) {
        tl.to(state, { glow: 0, ease: "none", duration: 0.12, onUpdate: write }, to);
      }

      return () => {
        tl.scrollTrigger?.kill();
        tl.kill();
      };
    });

    return () => mm.revert();
  }, [trigger, start, end, from, to, keepEdge]);

  return (
    <span
      ref={ref}
      className={`sweep ${className ?? ""}`}
      style={{ "--sweep-brand": brand, "--sweep-cap": cap, "--sweep-bleed": bleed } as CSSProperties}
    >
      <span className="sweep__text">{children}</span>
      <span aria-hidden className="sweep__trail" />
      <span aria-hidden className="sweep__edge" />
    </span>
  );
}
