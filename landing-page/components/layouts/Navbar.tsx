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
 * Everything is white: the header only ever sits on the hero video or on the
 * overlay, and both are dark. There is no light-background state to invert for.
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

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 h-16 sm:h-[86px]">
        <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between px-5 sm:px-10 lg:px-[68px]">
          <Link
            href="/"
            aria-label="Sterun home"
            className={`transition-opacity duration-300 motion-reduce:transition-none ${
              open ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            <Wordmark variant="white" />
          </Link>

          <div className="flex items-center gap-4 sm:gap-8 lg:gap-10">
            {/* Rendered whether or not APP_URL is set: the header's right side
                is composed around this control, and a hole there reads as an
                unfinished page. Deployment must set NEXT_PUBLIC_APP_URL
                (STE-32) or this ships pointing at nothing. */}
            {/* Outline at rest so the video reads through it, filled on hover.
                The label rolls to its own duplicate; the arrow holds still,
                because a control that moves while you aim at it is harder to
                hit. Both halves of the roll say the same thing, so the second
                is hidden from the accessibility tree. */}
            <a
              href={APP_URL || "#"}
              className="cta inline-flex items-center gap-2.5 px-5 py-3 text-[15px] font-medium text-paper sm:px-7 sm:py-3.5"
            >
              <span className="cta-roll">
                <span>
                  <span>Launch app</span>
                  <span aria-hidden>Launch app</span>
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
              className="heading-hero wipe-underline relative text-[26px] uppercase leading-none tracking-[-0.03em] text-paper sm:text-[34px]"
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
