"use client";

import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { CONTRACTS, REPO_URL, SDK_URL, SECTIONS, X_URL } from "@/lib/links";

/** Links that leave the site get the diagonal arrow and the new-tab treatment. */
type SecondaryLink = { label: string; href: string; external?: boolean };

const STERUN_LINKS: SecondaryLink[] = [
  { label: "Source", href: REPO_URL, external: true },
  { label: "SDK", href: SDK_URL, external: true },
  { label: "Updates", href: X_URL, external: true },
];

const CHAIN_LINKS: SecondaryLink[] = [
  { label: "EventRegistry", href: CONTRACTS.eventRegistry.url, external: true },
  { label: "RaceRecord", href: CONTRACTS.raceRecord.url, external: true },
  { label: "sUSD", href: CONTRACTS.susd.url, external: true },
];

/**
 * The three panels that sweep down before the menu appears.
 *
 * Paper, then teal, then ink: the brand's own order, each covering the last so
 * the eye reads a stack being dealt rather than one curtain. Leaving, the order
 * reverses, so ink lifts first and paper is the last thing gone. The delays flip
 * with direction, which is the only reason this needs JS at all.
 */
const LAYERS = [
  { key: "paper", className: "bg-paper", openDelay: 0, closeDelay: 200 },
  { key: "teal", className: "bg-teal", openDelay: 90, closeDelay: 100 },
  { key: "ink", className: "bg-n-950", openDelay: 180, closeDelay: 0 },
] as const;

/**
 * Motion of the content, which is deliberately not symmetrical.
 *
 * Coming in, each line rises into place behind a mask, one after another, so
 * the panel reads as being set rather than switched on. Going out there is no
 * second performance: the text is treated as printed on the dark panel and
 * leaves with it in one piece, which is both quicker and more convincing than
 * watching a dozen elements dismiss themselves.
 *
 * That asymmetry is why the durations below are per-direction rather than one
 * shared transition.
 */
const PANEL_MS = 620;
/** The ink panel starts at 180ms, so it has landed by here. */
const REVEAL_START_MS = 700;
const REVEAL_MS = 700;
/** Between nav lines; the right column moves faster because its lines are smaller. */
const NAV_STEP_MS = 70;
const SIDE_STEP_MS = 50;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_PANEL = "cubic-bezier(0.76, 0, 0.24, 1)";

/** Where the right column picks up after the last nav line. */
const SIDE_START_MS = REVEAL_START_MS + SECTIONS.length * NAV_STEP_MS;
const sideDelay = (order: number) => SIDE_START_MS + order * SIDE_STEP_MS;
/** Eight rows on the right: two headings and six links. */
const FOOTER_DELAY_MS = sideDelay(8) + 60;

/**
 * One scale for the nav, referenced by everything that has to line up with it.
 *
 * A height target cannot be met with a width unit: 13vw alone measured 126% of
 * a short, wide window and would under-fill a tall narrow one. Taking the
 * smaller of a width-based and a height-based value holds the ratio steady
 * whichever way the window is shaped.
 *
 * Tuned to about 70% rather than the 83% the brief's range allows, because the
 * panel also carries an 86px header offset and a footer. At 83% those three
 * together came to more than one screen and the menu scrolled; at 70% it fits.
 */
const NAV_SIZE = "clamp(3rem, min(11vw, 18vh), 13rem)";

/**
 * Where Big Shoulders' capitals begin inside its line box, as a fraction of the
 * font size. Anything meant to sit level with the top of a nav word is offset by
 * this: the 01-04 numbers, and the first group heading in the right column.
 */
const CAP_TOP = `calc(${NAV_SIZE} * 0.2)`;

/**
 * One line of content behind a mask.
 *
 * Opening, the inner element rises from a full line below into view. Closing,
 * it does not move at all: it stays where it is and rides the panel out, then
 * snaps back below the mask once the panel has gone, ready for the next open.
 * The reset is what the close delay is for; without it the line would vanish
 * from under the reader mid-exit.
 */
function Reveal({
  open,
  delay,
  reduced,
  className,
  children,
}: {
  open: boolean;
  delay: number;
  reduced: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`block overflow-hidden ${className ?? ""}`}>
      <span
        className="block"
        style={{
          translate: open ? "0 0" : "0 100%",
          transitionProperty: "translate",
          transitionTimingFunction: EASE_OUT,
          transitionDuration: reduced ? "0ms" : open ? `${REVEAL_MS}ms` : "0ms",
          transitionDelay: reduced ? "0ms" : open ? `${delay}ms` : `${PANEL_MS + 40}ms`,
        }}
      >
        {children}
      </span>
    </span>
  );
}

function ArrowUpRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="ml-[0.3em] inline-block h-[0.6em] w-[0.6em] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

/**
 * The underline used on every secondary link and on the MENU control: it grows
 * from the left on the way in and is pulled off to the right on the way out,
 * which is why the origin flips rather than the scale simply reversing.
 */
function SecondaryGroup({
  title,
  links,
  open,
  reduced,
  firstOrder,
}: {
  title: string;
  links: SecondaryLink[];
  open: boolean;
  reduced: boolean;
  /** Position of this group's heading in the right column's reveal order. */
  firstOrder: number;
}) {
  return (
    <div>
      <Reveal open={open} reduced={reduced} delay={sideDelay(firstOrder)}>
        <h3 className="text-[clamp(0.75rem,1.1vw,1rem)] uppercase leading-none tracking-[0.12em] text-paper/60">
          {title}
        </h3>
      </Reveal>
      <ul className="mt-[0.7em] flex flex-col gap-[0.28em] text-[clamp(1.25rem,2.2vw,2.75rem)]">
        {links.map((link, index) => (
          <li key={link.label}>
            <Reveal open={open} reduced={reduced} delay={sideDelay(firstOrder + 1 + index)}>
              <a
                href={link.href}
                {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="wipe-underline relative inline-flex items-center leading-tight text-paper"
              >
                {link.label}
                {link.external ? <ArrowUpRight /> : null}
              </a>
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MenuOverlay({
  open,
  onClose,
  closeButtonRef,
}: {
  open: boolean;
  onClose: () => void;
  /** The MENU/CLOSE control lives in the header, so the trap has to reach it. */
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  // Escape closes, Tab stays inside. The close button joins the loop even
  // though it renders in the header, otherwise the only way out of an open
  // menu would be the mouse.
  useEffect(() => {
    if (!open) return;

    function focusables(): HTMLElement[] {
      const inPanel = panelRef.current
        ? Array.from(
            panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
          )
        : [];
      return closeButtonRef.current ? [closeButtonRef.current, ...inPanel] : inPanel;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && (active === first || !items.includes(active as HTMLElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, closeButtonRef]);

  // Lock the page behind the overlay. Restoring the previous value rather than
  // clearing it keeps this from fighting anything else that sets overflow.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div
      id="site-menu"
      // Hidden from the tree entirely when closed: a screen reader should not
      // find four headings and a dozen links in a panel nobody opened.
      aria-hidden={!open}
      inert={!open}
      className={`fixed inset-0 z-40 ${open ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      {LAYERS.map((layer) => (
        <div
          key={layer.key}
          aria-hidden
          className={`absolute inset-0 transition-transform duration-[620ms] ease-[cubic-bezier(0.76,0,0.24,1)] motion-reduce:duration-0 ${layer.className}`}
          // Inline rather than a `-translate-y-full` class: Tailwind emitted no
          // rule for that here, so the class sat on the element doing nothing
          // and the panels never moved. The delay has to be inline anyway,
          // since it flips with direction, so both live together.
          style={{
            translate: open ? "0 0" : "0 -100%",
            transitionDelay: `${open ? layer.openDelay : layer.closeDelay}ms`,
          }}
        />
      ))}

      {/* The content is fixed to the ink panel rather than fading against it.
          Leaving, it travels up on the panel's own timing and easing, so the
          text reads as printed on the surface being lifted away. Arriving, it
          is put in place instantly — every line is masked at that moment, so
          there is nothing to see until the reveals begin. */}
      <div
        ref={panelRef}
        className="absolute inset-0 overflow-y-auto text-paper"
        style={{
          translate: open ? "0 0" : "0 -100%",
          transitionProperty: "translate",
          transitionTimingFunction: EASE_PANEL,
          transitionDuration: open || reduced ? "0ms" : `${PANEL_MS}ms`,
        }}
      >
        {/* Same container and gutter as the header, so the wordmark, CLOSE, the
            01-04 numbers and the footer all sit on one line. */}
        <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col px-5 pb-6 pt-20 sm:px-10 sm:pt-[86px] lg:px-[68px]">
          <div className="flex flex-1 flex-col gap-12 pt-2 lg:flex-row lg:gap-16 lg:pt-4">
            {/* Primary nav. In-page anchors, because there is no second page.

                64/36 rather than the 55/45 the brief asked for: "HOW IT WORKS"
                is twelve characters and has to stay on one line. Letting it wrap
                put the list at 103% of the viewport and broke the height target
                it had just been sized for. */}
            <nav aria-label="Sections" className="lg:w-[64%]">
              <ul>
                {/* Size and leading sit on the li so every descendant inherits
                    them. Setting leading only on the innermost span left the
                    wrapping block boxes at their default 1.5, which quietly made
                    the list almost twice as tall as intended. */}
                {SECTIONS.map((item, index) => (
                  <li key={item.n} className="leading-[0.95] tracking-[-0.01em]" style={{ fontSize: NAV_SIZE }}>
                    <a href={item.href} onClick={onClose} className="nav-item block text-paper">
                      <Reveal
                        open={open}
                        reduced={reduced}
                        delay={REVEAL_START_MS + index * NAV_STEP_MS}
                      >
                        {/* The number is positioned against this element rather
                            than the li, so it rides inside the mask with the
                            word instead of hanging in the open while the word
                            is still below the line. */}
                        <span className="relative block">
                          {/* At the gutter, level with the cap-top of the word
                              beside it rather than centred against it. */}
                          <span
                            className="absolute left-0 text-[clamp(0.7rem,1.1vw,1rem)] font-medium leading-none tabular-nums text-paper/60"
                            style={{ top: CAP_TOP }}
                          >
                            {item.n}
                          </span>
                          <span className="block pl-[2.4vw]">
                            <span className="heading-hero relative inline-block whitespace-nowrap uppercase">
                              {/* The fill. A 1:1 copy of the word underneath,
                                  revealed bottom-up by a clip-path rather than
                                  faded in, so the colour looks poured rather
                                  than switched. */}
                              <span aria-hidden className="nav-fill absolute inset-0 text-teal-300">
                                {item.label}
                              </span>
                              {item.label}
                            </span>
                          </span>
                        </span>
                      </Reveal>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Padding matches the nav's cap-top exactly, so the first group
                heading starts on the same line as "01". The gap between groups
                is one nav line-pitch, which is what ties the two columns to the
                same rhythm as the nav grows. */}
            <div
              className="flex flex-col gap-14 lg:w-[36%]"
              style={{
                paddingTop: CAP_TOP,
                // One nav line-pitch, but capped: unbounded it made the right
                // column taller than the nav it was meant to echo, and the
                // panel scrolled for a reason that had nothing to do with the
                // nav size.
                rowGap: `clamp(2.5rem, calc(${NAV_SIZE} * 0.95), 4rem)`,
              }}
            >
              <SecondaryGroup
                title="Sterun"
                links={STERUN_LINKS}
                open={open}
                reduced={reduced}
                firstOrder={0}
              />
              <SecondaryGroup
                title="Live on testnet"
                links={CHAIN_LINKS}
                open={open}
                reduced={reduced}
                firstOrder={STERUN_LINKS.length + 1}
              />
            </div>
          </div>

          <Reveal open={open} reduced={reduced} delay={FOOTER_DELAY_MS} className="mt-8 pt-2">
            <span className="flex flex-col gap-2 text-[clamp(0.875rem,1.4vw,1.25rem)] text-paper sm:flex-row sm:items-center sm:justify-between">
              <span>Verified race records for running events, built on Stellar.</span>
              <span>&copy; {new Date().getFullYear()} Sterun</span>
            </span>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
