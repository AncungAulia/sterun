"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useEffect, useRef } from "react";

import { CONTRACTS, REPO_URL } from "@/lib/links";

/**
 * STE-12 Problem, the first light section after the hero.
 *
 * Two kinds of motion and nothing else: the left column fades up once, and the
 * copy is revealed character by character against the scroll. No parallax,
 * nothing floating. The colour blocks that used to close this section now open
 * How it works, which animates them.
 *
 * Copy is fixed by docs/landing-copy.md.
 */

/** Rendered in sentence case and set in capitals by CSS, so screen readers get words, not letters. */
const CLAIMS = [
  "Verified on Stellar.",
  "Bound to the runner.",
  "Outlives the organiser.",
  "Checked by anyone.",
] as const;

const CONTRACT_LINKS = [
  { label: "EventRegistry", href: CONTRACTS.eventRegistry.url },
  { label: "RaceRecord", href: CONTRACTS.raceRecord.url },
  { label: "sUSD", href: CONTRACTS.susd.url },
  { label: "Source", href: REPO_URL },
] as const;

/** One paragraph per problem: the roster that does not match the runner, and the result that does not outlive the organiser. */
const PARAGRAPHS = [
  "Bibs get resold in group chats, and the organiser has one name on the roster while someone else runs the course. Nobody finds out until it matters. When someone goes down at kilometre 8, the medical team opens the wrong file.",
  "A finish time is a row in one organiser’s database. When the company folds, the row goes with it. Runners keep screenshots, and nobody can verify a screenshot. Sterun makes the record outlive the race.",
] as const;

/**
 * Copy size, shared with the block row beneath it so the gap above the blocks
 * is the same 2.9em as the gap between paragraphs.
 */
/** 1.5x the first size, clamp(1.125rem, 2.26vw, 1.75rem). */
const COPY_SIZE = "clamp(1.6875rem, 3.39vw, 2.625rem)";

/**
 * How many characters are mid-transition at any moment. Each character takes
 * BAND timeline units to go faded, to highlight, to ink, and the next starts
 * one unit later, so BAND is also the width of the travelling band. Narrower
 * reads as a cursor crawling along the line; wider and the colour smears across
 * whole phrases.
 */
const BAND = 40;

/** Stroke added at the peak of the highlight. About a weight step heavier at this size. */
const HIGHLIGHT_STROKE = "0.035em";

function ArrowUpRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="ml-[0.35em] inline-block h-[0.75em] w-[0.75em] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

export function Problem() {
  const stripRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const inkProbeRef = useRef<HTMLSpanElement>(null);
  const accentProbeRef = useRef<HTMLSpanElement>(null);
  const paperProbeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger, SplitText);

    const strip = stripRef.current;
    const copy = copyRef.current;
    const inkProbe = inkProbeRef.current;
    const accentProbe = accentProbeRef.current;
    const paperProbe = paperProbeRef.current;
    if (!strip || !copy || !inkProbe || !accentProbe || !paperProbe) return;

    // Everything is set up inside a reduced-motion query. With the preference
    // on, the text is never split and keeps its CSS colour. If it changes
    // mid-session, matchMedia reverts the lot.
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // Colours are read from elements carrying the token classes rather than
      // written here, so a token change reaches the animation too.
      const ink = getComputedStyle(inkProbe).color;
      const accent = getComputedStyle(accentProbe).color;
      const paper = getComputedStyle(paperProbe).color;

      // Words are kept whole so lines only break at spaces; aria "auto" labels
      // each paragraph with its full text and hides the split pieces, so a
      // screen reader reads sentences rather than spelling them.
      const split = SplitText.create(copy.querySelectorAll("p"), {
        type: "words,chars",
        charsClass: "problem-char",
        aria: "auto",
      });

      // Page colour -> brand blue, thickened -> ink, one character after another in
      // reading order across both paragraphs, scrubbed to the scroll so
      // scrolling back runs it back. The end is measured from the bottom of the
      // copy rather than its top, so the last line is revealed while it is on
      // screen however tall the copy runs (on a phone it is several screens of
      // text). With these two points the moving edge of the reveal travels from
      // 80% of the way down the screen to 60%, so it is always in view.
      //
      // The end is clamped to the page's scrollable range. Unclamped, it sat
      // past the bottom of the page whenever little followed the copy: measured
      // 33px beyond the last scroll position at 1440 and 168px at 375, which
      // left 20 and 112 characters blue and thickened forever at the foot of the
      // page. Clamping finishes the reveal at the bottom instead, and does
      // nothing once there is enough page below.
      // Before its turn a character is the colour of the page itself rather than
      // a faint ink, so the copy is simply not there until the band reaches it.
      gsap.set(split.chars, { color: paper, "--char-bold": "0em" });
      gsap
        .timeline({
          scrollTrigger: { trigger: copy, start: "top 80%", end: "clamp(bottom 60%)", scrub: 0.5 },
        })
        .to(split.chars, {
          keyframes: [
            { color: accent, "--char-bold": HIGHLIGHT_STROKE, ease: "none" },
            { color: ink, "--char-bold": "0em", ease: "none" },
          ],
          duration: BAND,
          stagger: 1,
          ease: "none",
        });

      gsap.from(gsap.utils.toArray<HTMLElement>("[data-strip-line]", strip), {
        autoAlpha: 0,
        y: 12,
        duration: 0.6,
        ease: "power2.out",
        stagger: 0.06,
        scrollTrigger: { trigger: strip, start: "top 85%", once: true },
      });

      return () => split.revert();
    });

    return () => mm.revert();
  }, []);

  return (
    <section
      id="problem"
      data-nav-theme="light"
      aria-labelledby="problem-heading"
      className="relative flex min-h-[100svh] flex-col bg-paper text-ink"
    >
      <h2 id="problem-heading" className="sr-only">
        The problem
      </h2>
      <span ref={inkProbeRef} aria-hidden className="hidden text-ink" />
      <span ref={accentProbeRef} aria-hidden className="hidden text-teal-400" />
      <span ref={paperProbeRef} aria-hidden className="hidden text-paper" />

      {/* The page gutter, not a section-specific one, so the left column and
          the dark block start on the same line as the wordmark and the hero
          headline above. */}
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-5 pb-5 pt-28 max-[359px]:px-4 sm:px-10 sm:pb-10 sm:pt-36 lg:px-[68px] lg:pb-[68px]">
        {/* 36/64 of the content width puts the copy's left edge at about 37%
            of the viewport, and the right gutter ends it at about 96%. */}
        <div className="grid grid-cols-1 items-start gap-14 md:grid-cols-[minmax(0,36fr)_minmax(0,64fr)] md:gap-0">
          {/* The left column carries the proof: four claims, then the contracts
              they rest on, so a reader can go and check before reading on. */}
          <div ref={stripRef} className="md:pr-10">
            <ul className="text-[clamp(0.625rem,0.95vw,0.75rem)] uppercase leading-[1.6] tracking-[0.02em]">
              {CLAIMS.map((claim) => (
                <li key={claim} data-strip-line>
                  {claim}
                </li>
              ))}
            </ul>

            <div id="proof" className="mt-10 scroll-mt-28 text-sm leading-[1.5]">
              <p data-strip-line className="max-w-[26ch]">
                The contracts are already running. Read them yourself.
              </p>
              <ul className="mt-4 flex flex-col gap-2">
                {CONTRACT_LINKS.map((link) => (
                  <li key={link.label} data-strip-line>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="wipe-underline relative inline-flex items-center font-medium"
                    >
                      {link.label}
                      <ArrowUpRight />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div ref={copyRef} className="leading-[1.45]" style={{ fontSize: COPY_SIZE }}>
            {PARAGRAPHS.map((text, index) => (
              // Two lines of space between paragraphs: 2 x 1.45 line-height.
              <p key={index} className={index > 0 ? "mt-[2.9em]" : undefined}>
                {text}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
