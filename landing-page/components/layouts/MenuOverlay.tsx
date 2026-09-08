"use client";

import { useEffect, useRef } from "react";

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

/** Time from opening until the last panel has landed. Content waits for it. */
const CONTENT_DELAY_MS = 430;

/**
 * One scale for the nav, referenced by everything that has to line up with it.
 *
 * The brief asked for 13vw and for the four items to fill 75-85% of the
 * viewport height. Those two cannot both hold: 13vw alone measured 126% of a
 * short, wide window and would under-fill a tall narrow one, because it ties a
 * height target to the width. Taking the smaller of a width-based and a
 * height-based value keeps the ratio near 80% whichever way the window is
 * shaped, and 13vw still wins on ordinary laptop proportions.
 */
const NAV_SIZE = "clamp(3.5rem, min(13vw, 21vh), 16rem)";

/**
 * Where Big Shoulders' capitals begin inside its line box, as a fraction of the
 * font size. Anything meant to sit level with the top of a nav word is offset by
 * this: the 01-04 numbers, and the first group heading in the right column.
 */
const CAP_TOP = `calc(${NAV_SIZE} * 0.2)`;

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
function SecondaryGroup({ title, links }: { title: string; links: SecondaryLink[] }) {
  return (
    <div>
      <h3 className="text-[clamp(0.75rem,1.1vw,1rem)] uppercase leading-none tracking-[0.12em] text-paper/60">
        {title}
      </h3>
      <ul className="mt-[0.9em] flex flex-col gap-[0.35em] text-[clamp(1.25rem,2.2vw,2.75rem)]">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="wipe-underline relative inline-flex items-center leading-tight text-paper"
            >
              {link.label}
              {link.external ? <ArrowUpRight /> : null}
            </a>
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

      <div
        ref={panelRef}
        className={`absolute inset-0 overflow-y-auto text-paper transition-opacity duration-300 motion-reduce:duration-0 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDelay: `${open ? CONTENT_DELAY_MS : 0}ms` }}
      >
        {/* Same container and gutter as the header, so the wordmark, CLOSE, the
            01-04 numbers and the footer all sit on one line. */}
        <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col px-5 pb-8 pt-20 sm:px-10 sm:pt-[86px] lg:px-[68px]">
          <div className="flex flex-1 flex-col gap-12 pt-6 lg:flex-row lg:gap-16 lg:pt-8">
            {/* Primary nav. In-page anchors, because there is no second page.

                72/28 rather than the 55/45 the brief asked for: "HOW IT WORKS"
                is twelve characters, and at this size it needs most of the width
                to stay on one line. Letting it wrap instead pushed the list to
                103% of the viewport and broke the height target it was sized
                for. The right column loses nothing by it — its longest link is
                a third of the space it still has. */}
            <nav aria-label="Sections" className="lg:w-[72%]">
              <ul>
                {/* Size and leading sit on the li so every descendant inherits
                    them. Setting leading only on the innermost span left the
                    wrapping block boxes at their default 1.5, which quietly made
                    the list almost twice as tall as intended. */}
                {SECTIONS.map((item) => (
                  <li
                    key={item.n}
                    className="relative leading-[0.95] tracking-[-0.01em]"
                    style={{ fontSize: NAV_SIZE }}
                  >
                    <a href={item.href} onClick={onClose} className="nav-item block text-paper">
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
                              faded in, so the colour looks poured rather than
                              switched. */}
                          <span aria-hidden className="nav-fill absolute inset-0 text-teal-300">
                            {item.label}
                          </span>
                          {item.label}
                        </span>
                      </span>
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
              className="flex flex-col gap-14 lg:w-[28%]"
              style={{
                paddingTop: CAP_TOP,
                rowGap: `max(3.5rem, calc(${NAV_SIZE} * 0.95))`,
              }}
            >
              <SecondaryGroup title="Sterun" links={STERUN_LINKS} />
              <SecondaryGroup title="Live on testnet" links={CHAIN_LINKS} />
            </div>
          </div>

          <div className="mt-14 flex flex-col gap-2 pt-2 text-[clamp(0.875rem,1.4vw,1.25rem)] text-paper sm:flex-row sm:items-center sm:justify-between">
            <p>Verified race records for running events, built on Stellar.</p>
            <p>&copy; {new Date().getFullYear()} Sterun</p>
          </div>
        </div>
      </div>
    </div>
  );
}
