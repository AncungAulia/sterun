"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type CSSProperties, Fragment, useEffect, useRef } from "react";

/**
 * STE-12 Problem, the first light section after the hero.
 *
 * The only motion here is three things: the claim lines fade up once, the copy
 * is revealed character by character against the scroll, and two colour blocks
 * rise out of their masks once. No parallax and nothing floating, so the section
 * reads as still and clean once each has run.
 *
 * Copy is fixed by docs/landing-copy.md.
 */

/** Rendered in sentence case and set in capitals by CSS, so screen readers get words, not letters. */
const PROOF_LINES = [
  "Verified on Stellar.",
  "Bound to the runner.",
  "Outlives the organiser.",
  "Checked by anyone.",
] as const;

const PARAGRAPHS = [
  "Bibs get resold in group chats, and the organiser has one name on the roster while someone else runs the course. A finish time is a row in one organiser’s database. When the company folds, the row goes with it.",
  "Runners keep screenshots, and nobody can verify a screenshot. Sterun makes the record outlive the race.",
] as const;

/**
 * How many characters are mid-transition at any moment. Each character takes
 * BAND timeline units to go faded, to blue, to ink, and the next one starts one
 * unit later, so BAND is also the width of the travelling colour band. Narrower
 * reads as a cursor crawling along the line; wider and the blue smears across
 * whole phrases.
 */
const BAND = 40;

/** Take a computed rgb() colour and return it at the given alpha. */
function withAlpha(color: string, alpha: number): string {
  const channels = color.match(/[\d.]+/g);
  if (!channels || channels.length < 3) return color;
  const [r, g, b] = channels;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * One span per visible character, wrapped per word.
 *
 * The word wrapper is inline-block and nowrap so a line can only break at a
 * space, never inside a word. Spaces are plain text between words rather than
 * character spans: they have no colour to show, and counting them would make
 * the band look narrower over short words.
 */
function Characters({ text }: { text: string }) {
  const words = text.split(" ");
  return words.map((word, w) => (
    <Fragment key={w}>
      <span className="inline-block whitespace-nowrap">
        {Array.from(word).map((char, c) => (
          <span key={c} data-char>
            {char}
          </span>
        ))}
      </span>
      {w < words.length - 1 ? " " : null}
    </Fragment>
  ));
}

export function Problem() {
  const stripRef = useRef<HTMLUListElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef<HTMLDivElement>(null);
  const inkProbeRef = useRef<HTMLSpanElement>(null);
  const accentProbeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const strip = stripRef.current;
    const copy = copyRef.current;
    const blocks = blocksRef.current;
    const inkProbe = inkProbeRef.current;
    const accentProbe = accentProbeRef.current;
    if (!strip || !copy || !blocks || !inkProbe || !accentProbe) return;

    // Everything is set up inside a reduced-motion query. If the preference
    // is on, nothing here runs, the text keeps its CSS colour, and the blocks
    // sit in place. If it changes mid-session, matchMedia reverts the lot.
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // Colours are read from elements carrying the token classes rather than
      // written here, so a token change reaches the animation too.
      const ink = getComputedStyle(inkProbe).color;
      const accent = getComputedStyle(accentProbe).color;
      const chars = gsap.utils.toArray<HTMLElement>("[data-char]", copy);

      // Faded -> brand light blue -> ink, one character after another in
      // reading order, scrubbed to the scroll so scrolling back runs it back.
      gsap.set(chars, { color: withAlpha(ink, 0.1) });
      gsap
        .timeline({
          scrollTrigger: { trigger: copy, start: "top 80%", end: "top 30%", scrub: 0.5 },
        })
        .to(chars, {
          keyframes: [
            { color: accent, ease: "none" },
            { color: ink, ease: "none" },
          ],
          duration: BAND,
          stagger: 1,
          ease: "none",
        });

      gsap.from(gsap.utils.toArray<HTMLElement>(strip.children), {
        autoAlpha: 0,
        y: 12,
        duration: 0.6,
        ease: "power2.out",
        stagger: 0.06,
        scrollTrigger: { trigger: strip, start: "top 85%", once: true },
      });

      // power2.inOut is cubic in-out, the same curve as
      // cubic-bezier(0.65, 0, 0.35, 1).
      gsap.from(gsap.utils.toArray<HTMLElement>("[data-block]", blocks), {
        yPercent: 100,
        duration: 0.7,
        ease: "power2.inOut",
        stagger: 0.15,
        scrollTrigger: { trigger: blocks, start: "top 85%", once: true },
      });
    });

    return () => mm.revert();
  }, []);

  return (
    <section
      id="problem"
      data-header-tone="light"
      aria-labelledby="problem-heading"
      className="relative flex min-h-[100svh] flex-col bg-paper text-ink"
    >
      <h2 id="problem-heading" className="sr-only">
        The problem
      </h2>
      <span ref={inkProbeRef} aria-hidden className="hidden text-ink" />
      <span ref={accentProbeRef} aria-hidden className="hidden text-teal-300" />

      {/* The page gutter, not a section-specific one, so the claim lines and
          the dark block start on the same line as the wordmark and the hero
          headline above. */}
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-5 pb-5 pt-28 max-[359px]:px-4 sm:px-10 sm:pb-10 sm:pt-36 lg:px-[68px] lg:pb-[68px]">
        {/* 36/64 of the content width puts the copy's left edge at about 37%
            of the viewport, and the right gutter ends it at about 96%. */}
        <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-[minmax(0,36fr)_minmax(0,64fr)] md:gap-0">
          <ul
            ref={stripRef}
            className="text-[clamp(0.625rem,0.95vw,0.75rem)] uppercase leading-[1.15] tracking-[0.02em] text-ink"
          >
            {PROOF_LINES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <div ref={copyRef} className="text-[clamp(1.125rem,2.26vw,1.75rem)] leading-[1.45]">
            {PARAGRAPHS.map((text, index) => (
              // Two lines of space between paragraphs: 2 x 1.45 line-height.
              <p key={index} className={index > 0 ? "mt-[2.9em]" : undefined}>
                {/* Read once, as a sentence. The split copy is hidden from
                    assistive tech, which would otherwise spell it out. */}
                <span className="sr-only">{text}</span>
                <span aria-hidden>
                  <Characters text={text} />
                </span>
              </p>
            ))}
          </div>
        </div>

        {/* Dark block landscape at 1.7:1, blue runway 30% of its height,
            touching it with no gap and running to the right gutter. Bottoms
            align so the blue reads as a ledge leaving the dark block. Each is
            clipped by its own wrapper for the slide-up. */}
        <div
          ref={blocksRef}
          aria-hidden
          className="mt-auto flex items-end pt-16 sm:pt-24"
          style={{ "--coal-w": "max(21vw, 9rem)" } as CSSProperties}
        >
          <div
            className="shrink-0 overflow-hidden"
            style={{ width: "var(--coal-w)", height: "calc(var(--coal-w) / 1.7)" }}
          >
            <div data-block className="h-full w-full bg-ink" />
          </div>
          <div
            className="min-w-0 flex-1 overflow-hidden"
            style={{ height: "calc(var(--coal-w) / 1.7 * 0.3)" }}
          >
            <div data-block className="h-full w-full bg-teal" />
          </div>
        </div>
      </div>
    </section>
  );
}
