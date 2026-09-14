"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Wordmark } from "@/components/elements/Wordmark";
import { MenuOverlay } from "@/components/layouts/MenuOverlay";
import { APP_URL } from "@/lib/links";

function ArrowRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-[1em] w-[1em] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * Fixed, transparent header over the hero video.
 *
 * It sits above the overlay rather than inside it, which is the whole reason
 * the CTA and the MENU control do not move a pixel when the menu opens. Only
 * the wordmark goes, because the overlay carries its own way home.
 *
 * Its colour follows whatever section is under it. White over the hero video
 * and the overlay, ink over light sections such as Problem. A section opts in
 * by carrying data-header-tone="light" or "dark"; see useHeaderTone below.
 */
export function Navbar() {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const hasOpened = useRef(false);

  // Send focus back where it came from, so closing with the keyboard does not
  // dump the caret at the top of the document.
  //
  // Guarded by hasOpened because the effect also runs on mount, where `open` is
  // already false: every visitor arrived to find MENU focused and outlined,
  // which reads as a stray selection on a page nobody has touched yet. Restore
  // focus only to someone who actually opened the menu.
  useEffect(() => {
    if (open) {
      hasOpened.current = true;
      return;
    }
    if (hasOpened.current) menuButtonRef.current?.focus({ preventScroll: true });
  }, [open]);

  const tone = useHeaderTone();
  // The overlay is dark whatever is underneath, so an open menu is always white.
  const headerTone = open ? "dark" : tone;
  const onLight = headerTone === "light";

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 h-16 sm:h-[86px]">
        <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between px-5 max-[359px]:px-4 sm:px-10 lg:px-[68px]">
          <Link
            href="/"
            aria-label="Sterun home"
            className={`shrink-0 transition-opacity duration-300 motion-reduce:transition-none ${
              open ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            {/* Both colours are rendered and crossfaded rather than swapping
                src, which would flash an empty box while the other file loads. */}
            <span className="relative block">
              <span
                className={`block transition-opacity duration-300 motion-reduce:transition-none ${
                  onLight ? "opacity-0" : "opacity-100"
                }`}
              >
                <Wordmark variant="white" />
              </span>
              <span
                className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${
                  onLight ? "opacity-100" : "opacity-0"
                }`}
              >
                <Wordmark variant="black" alt="" />
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-3 max-[359px]:gap-2 sm:gap-8 lg:gap-10">
            {/* Rendered whether or not APP_URL is set: the header's right side
                is composed around this control, and a hole there reads as an
                unfinished page. Deployment must set NEXT_PUBLIC_APP_URL
                (STE-32) or this ships pointing at nothing. */}
            {/* Outline at rest so the video reads through it, filled on hover.
                The label rolls to its own duplicate; the arrow holds still,
                because a control that moves while you aim at it is harder to
                hit. Both halves of the roll say the same thing, so the second
                is hidden from the accessibility tree. */}
            {/* Below 640px the label shortens to "App". The full label does
                not fit: measured at 320 wide, wordmark + "Launch app" pill +
                MENU needed 361px of a 280px row and pushed MENU off screen, and
                at 375 flex squeezed the pill until it read "Launch". The
                accessible name stays "Launch app" at every width.

                Even "App" is 25px too wide for a 320px phone, so below 360 the
                gutter, gaps, pill padding and MENU size all tighten a step. */}
            <a
              href={APP_URL || "#"}
              aria-label="Launch app"
              data-tone={headerTone}
              className={`cta inline-flex h-11 items-center justify-center gap-2 px-4 text-[15px] font-medium max-[359px]:gap-1.5 max-[359px]:px-3 sm:h-auto sm:gap-2.5 sm:px-7 sm:py-3.5 ${
                onLight ? "text-ink" : "text-paper"
              }`}
            >
              {/* Each copy of the roll holds both labels and shows one by
                  breakpoint. The swap happens one level inside the copies,
                  because globals.css sets display:block on the copies
                  themselves and that would beat a utility class there. */}
              <span aria-hidden className="cta-roll">
                <span>
                  <span>
                    <span className="sm:hidden">App</span>
                    <span className="hidden sm:inline">Launch app</span>
                  </span>
                  <span>
                    <span className="sm:hidden">App</span>
                    <span className="hidden sm:inline">Launch app</span>
                  </span>
                </span>
              </span>
              <span className="cta-arrow inline-flex">
                <ArrowRight />
              </span>
            </a>

            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="site-menu"
              className={`heading-hero wipe-underline relative shrink-0 text-[26px] uppercase leading-none tracking-[-0.03em] transition-colors duration-300 motion-reduce:transition-none max-[359px]:text-[22px] sm:text-[34px] ${
                onLight ? "text-ink" : "text-paper"
              }`}
            >
              {open ? "Close" : "Menu"}
            </button>
          </div>
        </div>
      </header>

      <MenuOverlay open={open} onClose={() => setOpen(false)} closeButtonRef={menuButtonRef} />
    </>
  );
}

/**
 * Which tone of section is currently under the header.
 *
 * Watches a one-pixel line across the middle of the header, not the whole
 * viewport: the header should change colour when a section edge crosses the
 * header itself, not when the section first appears at the bottom of the
 * screen. The observer is rebuilt on resize because the margin that places the
 * line is in pixels and depends on the viewport height and the header height.
 */
function useHeaderTone(): "dark" | "light" {
  const [tone, setTone] = useState<"dark" | "light">("dark");

  useEffect(() => {
    let observer: IntersectionObserver | null = null;

    function build() {
      observer?.disconnect();
      // Half the header height: 64px below 640px, 86px from there up.
      const line = window.innerWidth < 640 ? 32 : 43;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const value = (entry.target as HTMLElement).dataset.headerTone;
            setTone(value === "light" ? "light" : "dark");
          }
        },
        { rootMargin: `-${line}px 0px -${window.innerHeight - line - 1}px 0px` },
      );
      document.querySelectorAll("[data-header-tone]").forEach((el) => observer?.observe(el));
    }

    build();
    window.addEventListener("resize", build);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", build);
    };
  }, []);

  return tone;
}
