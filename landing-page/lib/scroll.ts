import Lenis from "lenis";

/**
 * Smooth scroll, set up the same way as nbnzia.com.
 *
 * Lenis is pinned to exactly 1.2.3 in package.json because its defaults move
 * between minor versions, and the feel comes from those defaults: this passes
 * autoRaf and nothing else, so lerp, easing and mode are Lenis's own.
 *
 * Deliberately absent: ScrollTrigger.scrollerProxy, lenis.on("scroll",
 * ScrollTrigger.update) and gsap.ticker.lagSmoothing(0). Lenis drives the real
 * window scroll position, so the browser fires native scroll events and
 * ScrollTrigger stays in step without being told. Adding a proxy or a second
 * update loop on top of that makes the two fight.
 *
 * One instance for the page. Components never hold it; they call the helpers.
 */
let lenis: Lenis | null = null;

/** Start Lenis. Returns the function that tears it down again. */
export function startSmoothScroll(): () => void {
  if (lenis) return () => {};
  lenis = new Lenis({ autoRaf: true });
  return () => {
    lenis?.destroy();
    lenis = null;
  };
}

/**
 * Freeze page scrolling, for the menu overlay. A no-op under reduced motion,
 * where Lenis never starts and the overlay's own overflow lock does the job.
 */
export function lockScroll(): void {
  lenis?.stop();
}

export function unlockScroll(): void {
  lenis?.start();
}
