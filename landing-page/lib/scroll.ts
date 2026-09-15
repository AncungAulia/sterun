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

/**
 * Run the per-frame scroll listeners now. For scripted motion that changes what
 * the listeners read (the How it works cover): calling this right after writing
 * the transform keeps the header on the same frame instead of one behind.
 */
export function notifyScroll(): void {
  emit();
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
 * Freeze page scrolling, for overlays (the menu, an opened step). The one place
 * that decides how.
 *
 * With Lenis running it is lenis.stop(), which already sets overflow: clip on
 * <html>. Without Lenis (reduced motion) it sets overflow: hidden on <html>.
 *
 * Never on <body>. Once <html> has any overflow other than visible, a hidden
 * body no longer hands its overflow up to the viewport: <body> becomes a scroll
 * container of its own, and every sticky element on the page is suddenly
 * sticky to <body> at scroll 0 instead of to the screen. The menu did exactly
 * that, and the held How it works stage jumped behind it.
 */
let previousRootOverflow: string | null = null;

export function lockScroll(): void {
  if (lenis) {
    lenis.stop();
    return;
  }
  if (previousRootOverflow !== null) return;
  previousRootOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
}

export function unlockScroll(): void {
  if (lenis) {
    lenis.start();
    return;
  }
  if (previousRootOverflow === null) return;
  document.documentElement.style.overflow = previousRootOverflow;
  previousRootOverflow = null;
}
