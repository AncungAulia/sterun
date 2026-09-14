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
let lenisOff: (() => void) | null = null;

/**
 * Per-frame scroll listeners, for work that has to land on the exact frame the
 * page moves (the adaptive header's split line).
 *
 * A window "scroll" listener is not enough on its own while Lenis runs. Lenis
 * moves the page inside its requestAnimationFrame callback, and the browser
 * only dispatches the resulting scroll event at the start of the next frame,
 * so anything positioned from it trails the page by one frame. Lenis's own
 * "scroll" event fires synchronously right after it moves the page, so while
 * Lenis runs, listeners are called from there. The window listener stays
 * attached for native scrolling (reduced motion, keyboard, scrollbar drags);
 * when both fire for the same position, the second call finds nothing to
 * change, so listeners must be idempotent.
 */
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeScroll(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("scroll", emit, { passive: true });
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("scroll", emit);
  };
}

/** Start Lenis. Returns the function that tears it down again. */
export function startSmoothScroll(): () => void {
  if (lenis) return () => {};
  lenis = new Lenis({ autoRaf: true });
  lenisOff = lenis.on("scroll", emit);
  return () => {
    lenisOff?.();
    lenisOff = null;
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
