"use client";

import { useEffect } from "react";

import { startSmoothScroll } from "@/lib/scroll";

/**
 * Runs Lenis for the whole page, unless the visitor asks for reduced motion.
 *
 * Under reduced motion Lenis is not started at all, so scrolling is the
 * browser's own. The preference is followed live: turning it on mid-session
 * tears Lenis down, and turning it off starts it again.
 */
export function SmoothScroll() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stop = query.matches ? null : startSmoothScroll();

    function onChange() {
      stop?.();
      stop = query.matches ? null : startSmoothScroll();
    }

    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
      stop?.();
    };
  }, []);

  return null;
}
