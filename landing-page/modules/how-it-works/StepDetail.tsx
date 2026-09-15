"use client";

import gsap from "gsap";
import { useEffect, useLayoutEffect, useRef } from "react";

import { lockScroll, unlockScroll } from "@/lib/scroll";
import { STEP_TITLE_SIZE, type Step } from "@/modules/how-it-works/steps";

/**
 * One step, opened from its card to fill the box.
 *
 * The card grows out of where it is: the dialog is laid out in its open state
 * and then clipped back to the card's rectangle, and the clip opens to the box.
 * Two things ride along so nothing jumps. The picture starts exactly as the card
 * shows it (same centre, same scale, including the card's own window scale) and
 * settles into a full-width crop. The title starts on top of the card's title
 * and slides to the left column. Only then do the description, links and close
 * button come up. Closing plays it back to the card, wherever the card is now.
 *
 * Everything animated is a transform or a clip, and the page does not scroll
 * while it is open.
 */

const OPEN = { duration: 0.9, ease: "power3.inOut" };
const CLOSE = { duration: 0.8, ease: "power3.inOut" };

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

function cover(natural: { w: number; h: number }, w: number, h: number) {
  const k = Math.max(w / natural.w, h / natural.h);
  return { w: natural.w * k, h: natural.h * k };
}

function textRect(el: Element): Rect {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect();
}

function inset(outer: Rect, inner: Rect) {
  const t = Math.max(0, inner.top - outer.top);
  const r = Math.max(0, outer.right - inner.right);
  const b = Math.max(0, outer.bottom - inner.bottom);
  const l = Math.max(0, inner.left - outer.left);
  return `inset(${t}px ${r}px ${b}px ${l}px)`;
}

const FULL = "inset(0px 0px 0px 0px)";

function ArrowUpRight() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="ml-[0.35em] h-[0.75em] w-[0.75em] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

export function StepDetail({ step, index, onClosed }: { step: Step; index: number; onClosed: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const requestCloseRef = useRef<(() => void) | null>(null);
  const onClosedRef = useRef(onClosed);

  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const windowEl = windowRef.current;
    const image = imageRef.current;
    const title = titleRef.current;
    const close = closeRef.current;
    const box = root?.closest<HTMLElement>(".hiw");
    const card = box?.querySelectorAll<HTMLElement>("[data-hiw-panel]")[index];
    if (!root || !windowEl || !image || !title || !close || !box || !card) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rises = gsap.utils.toArray<HTMLElement>("[data-detail-rise]", root);
    const metaEls = ["[data-detail-pill]", "[data-detail-details]", "[data-detail-index]"].map(
      (selector) => root.querySelector<HTMLElement>(selector)!,
    );
    let timeline: gsap.core.Timeline | null = null;
    let closing = false;

    // Where the card is right now, expressed as the dialog's starting state.
    const fromCard = () => {
      const boxRect = box.getBoundingClientRect();
      const cardWindow = card.querySelector<HTMLElement>("[data-hiw-window]")!;
      const cardTitle = card.querySelector<HTMLElement>("[data-hiw-title]")!;
      const shown = cardWindow.getBoundingClientRect();
      const target = windowEl.getBoundingClientRect();
      const natural = { w: image.naturalWidth || 16, h: image.naturalHeight || 9 };

      // The card's picture: covered to its unscaled window, then scaled by the
      // window and by the picture's own inverse scale, about the window centre.
      const windowScale = shown.width / cardWindow.offsetWidth;
      const cardPicture = cover(natural, cardWindow.offsetWidth, cardWindow.offsetHeight);
      const openPicture = cover(natural, target.width, target.height);
      const pictureWidth = cardPicture.w * windowScale * (2 - windowScale);

      const cardText = textRect(cardTitle);
      const openText = textRect(title);
      // The small pieces travel too. Left where they are, the card's facts
      // vanished under the clip and reappeared at the box's right edge, and the
      // pill and index jumped by the card's offset.
      const shift = (from: Element | null, to: Element) => {
        if (!from) return { x: 0, y: 0 };
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        return { x: a.left - b.left, y: a.top - b.top };
      };
      const meta = [
        shift(card.querySelector("[data-hiw-rise]"), metaEls[0]),
        shift(card.querySelector("[data-hiw-details]"), metaEls[1]),
        shift(card.querySelector("[data-hiw-index]"), metaEls[2]),
      ];
      return {
        meta,
        size: openPicture,
        clip: inset(boxRect, card.getBoundingClientRect()),
        windowClip: inset(target, shown),
        picture: {
          x: shown.left + shown.width / 2 - (target.left + target.width / 2),
          y: shown.top + shown.height / 2 - (target.top + target.height / 2),
          scale: pictureWidth / openPicture.w,
        },
        title: { x: cardText.left - openText.left, y: cardText.top - openText.top },
      };
    };

    // Keep the page still and the keyboard inside while open.
    const stopScroll = (event: Event) => {
      const scroller = root.querySelector("[data-detail-scroll]");
      if (scroller && scroller.contains(event.target as Node) && scroller.scrollHeight > scroller.clientHeight) return;
      event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCloseRef.current?.();
        return;
      }
      if (event.key === "Tab") {
        const items = Array.from(root.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if ([" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) event.preventDefault();
    };
    lockScroll();
    window.addEventListener("wheel", stopScroll, { passive: false });
    window.addEventListener("touchmove", stopScroll, { passive: false });
    document.addEventListener("keydown", onKeyDown);

    const finish = () => {
      onClosedRef.current();
    };

    requestCloseRef.current = () => {
      if (closing) return;
      closing = true;
      timeline?.kill();
      if (reduced) {
        finish();
        return;
      }
      const from = fromCard();
      timeline = gsap
        .timeline({ onComplete: finish })
        .to(rises, { yPercent: 110, duration: 0.25, ease: "power2.in" }, 0)
        .to(close, { scale: 0, duration: 0.25, ease: "power2.in" }, 0)
        .to(root, { clipPath: from.clip, ...CLOSE }, 0.15)
        .to(windowEl, { clipPath: from.windowClip, ...CLOSE }, 0.15)
        .to(image, { x: from.picture.x, y: from.picture.y, scale: from.picture.scale, ...CLOSE }, 0.15)
        .to(title, { x: from.title.x, y: from.title.y, ...CLOSE }, 0.15);
      metaEls.forEach((el, i) => timeline!.to(el, { x: from.meta[i].x, y: from.meta[i].y, ...CLOSE }, 0.15));
    };

    const open = () => {
      const from = fromCard();
      gsap.set(image, { width: from.size.w, height: from.size.h, left: "50%", top: "50%", xPercent: -50, yPercent: -50 });
      // Visible before focusing: a hidden element refuses focus, and the first
      // version called focus while the dialog was still hidden, leaving it on
      // the page body.
      if (reduced) {
        gsap.set(root, { visibility: "visible" });
        close.focus({ preventScroll: true });
        return;
      }
      gsap.set(root, { clipPath: from.clip, visibility: "visible" });
      close.focus({ preventScroll: true });
      gsap.set(windowEl, { clipPath: from.windowClip });
      gsap.set(image, { x: from.picture.x, y: from.picture.y, scale: from.picture.scale });
      gsap.set(title, { x: from.title.x, y: from.title.y });
      metaEls.forEach((el, i) => gsap.set(el, from.meta[i]));
      gsap.set(rises, { yPercent: 110 });
      gsap.set(close, { scale: 0 });
      timeline = gsap
        .timeline()
        .to(root, { clipPath: FULL, ...OPEN }, 0)
        .to(windowEl, { clipPath: FULL, ...OPEN }, 0)
        .to(image, { x: 0, y: 0, scale: 1, ...OPEN }, 0)
        .to(title, { x: 0, y: 0, ...OPEN }, 0)
        .to(metaEls, { x: 0, y: 0, ...OPEN }, 0)
        .to(rises, { yPercent: 0, duration: 0.6, stagger: 0.06, ease: "power3.out" }, 0.55)
        .to(close, { scale: 1, duration: 0.55, ease: "power3.out" }, 0.6);
    };

    // The card's picture is already loaded, so this resolves at once; waiting
    // for it keeps the natural size from reading as zero on a cold cache.
    let cancelled = false;
    (image.complete ? Promise.resolve() : image.decode().catch(() => undefined)).then(() => {
      if (!cancelled) open();
    });

    return () => {
      cancelled = true;
      timeline?.kill();
      requestCloseRef.current = null;
      unlockScroll();
      window.removeEventListener("wheel", stopScroll);
      window.removeEventListener("touchmove", stopScroll);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [index]);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`hiw-detail-title-${index}`}
      className={`absolute inset-0 z-10 overflow-hidden text-ink ${step.bg}`}
      // Hidden until measured, so the open layout never flashes before the clip.
      style={{ visibility: "hidden" }}
    >
      <div ref={windowRef} className="relative h-[59.9%] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- sized and moved
            by script to match the card it opens from. */}
        <img ref={imageRef} src={step.image} alt="" className="absolute max-w-none" />
      </div>

      <div className="relative h-[40.1%]">
        <div className="absolute inset-x-[var(--g)] top-[var(--g)] flex items-start justify-between gap-[var(--g)]">
          <span
            data-detail-pill
            className="block shrink-0 rounded-full border border-ink px-[1.3em] py-[0.45em] font-semibold leading-[1.2]"
            style={{ fontSize: "var(--pill)" }}
          >
            {step.pill}
          </span>
          <span
            data-detail-details
            className="grid w-[31.4%] grid-cols-2 gap-x-[var(--g)] font-semibold uppercase leading-[1.4] tracking-[-0.05em] max-sm:w-auto max-sm:grid-cols-1"
            style={{ fontSize: "var(--small)" }}
          >
            {step.details.map((detail, d) => (
              <span key={detail} className={d === 1 ? "max-sm:hidden" : undefined}>
                {detail}
              </span>
            ))}
          </span>
        </div>

        <div
          data-detail-scroll
          data-lenis-prevent
          // Scrolls on a phone only. On wider screens a scroll container here
          // clipped the title while it slid in from the card below it.
          className="absolute inset-x-[var(--g)] grid grid-cols-[minmax(0,1fr)_minmax(0,31.4%)] items-center gap-x-[calc(var(--bw)*0.04)] max-sm:grid-cols-1 max-sm:content-start max-sm:gap-y-4 max-sm:overflow-y-auto"
          style={{ top: "calc(var(--g) * 2 + var(--pill) * 2.1)", bottom: "calc(var(--g) * 2 + var(--cta))" }}
        >
          {/* The same size and wrap width as on the card, so it can slide
              across without reflowing on the way. */}
          <h3
            ref={titleRef}
            id={`hiw-detail-title-${index}`}
            className="text-left font-normal leading-[1.15] tracking-[-0.02em]"
            style={{ fontSize: STEP_TITLE_SIZE, maxWidth: "calc(var(--bw) * 0.606)" }}
          >
            {step.title}
          </h3>
          <div>
            <div className="overflow-hidden">
              <p data-detail-rise className="leading-[1.55]" style={{ fontSize: "max(13px, calc(var(--bw) * 0.0097))" }}>
                {step.body}
              </p>
            </div>
            <ul className="mt-[1.4em] flex flex-wrap gap-x-6 gap-y-2" style={{ fontSize: "max(13px, calc(var(--bw) * 0.0097))" }}>
              {step.links.map((link) => (
                <li key={link.label} className="overflow-hidden">
                  <a
                    data-detail-rise
                    href={link.href}
                    {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="wipe-underline relative inline-flex items-center font-semibold"
                  >
                    {link.label}
                    {link.external ? <ArrowUpRight /> : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <span
          aria-hidden
          data-detail-index
          className="absolute bottom-[var(--g)] left-[var(--g)] font-semibold leading-none"
          style={{ fontSize: "var(--small)" }}
        >
          {step.index}
        </span>

        <button
          ref={closeRef}
          type="button"
          aria-label={`Close ${step.title}`}
          onClick={() => requestCloseRef.current?.()}
          className="hiw-cta bottom-[var(--g)] right-[var(--g)]"
        >
          <span aria-hidden className="hiw-cta__dot" />
          <svg viewBox="0 0 14 14" aria-hidden className="hiw-cta__x" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M1 1l12 12M13 1 1 13" />
          </svg>
        </button>
      </div>
    </div>
  );
}
