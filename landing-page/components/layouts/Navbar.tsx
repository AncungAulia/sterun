"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import {
  type FocusEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Lockup, LockupSymbol } from "@/components/elements/Lockup";
import { MenuOverlay } from "@/components/layouts/MenuOverlay";
import { APP_URL } from "@/lib/links";
import { bandClip, complementClip, darkBands, type Surface } from "@/lib/navTheme";
import { subscribeScroll } from "@/lib/scroll";

/** Layout effect on the client, plain effect on the server where layout effects do nothing. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * How long the menu overlay's panels keep moving after it opens or closes: the
 * last panel starts 200ms in and runs 620ms. While they move, the header reads
 * their live position every frame.
 */
const OVERLAY_MOTION_MS = 1000;

type InteractionKey = "logo" | "cta" | "menu";

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
 * One copy of the header row.
 *
 * Every layer renders this with the same classes, so the logo, CTA and MENU
 * have identical boxes in all of them; a split line only looks clean if the
 * glyphs on either side of it are in exactly the same place. The interactive
 * copy uses a link and a button, the painted copies use spans with the same
 * classes and inline-block display so their geometry matches.
 */
function NavRow({
  kind,
  open,
  layerRef,
  pool,
  menuButtonRef,
  onToggle,
  bind,
}: {
  kind: "hit" | "onLight" | "onDark";
  open: boolean;
  layerRef?: RefObject<HTMLDivElement | null>;
  pool?: number;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
  onToggle?: () => void;
  bind?: (key: InteractionKey) => {
    onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
    onPointerLeave: () => void;
    onFocus: (event: FocusEvent<HTMLElement>) => void;
    onBlur: () => void;
  };
}) {
  const hit = kind === "hit";
  const layerClass = hit
    ? "nav__layer nav__layer--hit"
    : `nav__layer nav__layer--paint nav__layer--${kind}`;

  const logoClass = "nav-logo block shrink-0";
  const ctaClass =
    "nav-cta inline-flex h-11 items-center justify-center gap-2 px-4 text-[15px] font-medium max-[359px]:gap-1.5 max-[359px]:px-3 sm:h-auto sm:gap-2.5 sm:px-7 sm:py-3.5";
  const menuClass =
    "nav-underline heading-hero inline-block shrink-0 text-[26px] uppercase leading-none tracking-[-0.03em] max-[359px]:text-[22px] sm:text-[34px]";

  // Below 640px the label shortens to "App": measured at 320 wide, the full
  // label pushed MENU off screen. Each copy of the roll holds both labels and
  // shows one by breakpoint.
  const ctaContent = (
    <>
      <span aria-hidden className="nav-cta-roll">
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
      <span className="nav-cta-arrow inline-flex">
        <ArrowRight />
      </span>
    </>
  );

  return (
    <div
      ref={layerRef}
      className={layerClass}
      data-pool={pool}
      aria-hidden={hit ? undefined : true}
      inert={!hit}
    >
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between px-5 max-[359px]:px-4 sm:px-10 lg:px-[68px]">
        {hit ? (
          <Link href="/" aria-label="Sterun home" className={logoClass} {...bind?.("logo")}>
            <Lockup />
          </Link>
        ) : (
          <span className={logoClass}>
            <Lockup />
          </span>
        )}

        <div className="flex shrink-0 items-center gap-3 max-[359px]:gap-2 sm:gap-8 lg:gap-10">
          {/* Deployment must set NEXT_PUBLIC_APP_URL (STE-32) or this points at nothing. */}
          {hit ? (
            <a href={APP_URL || "#"} aria-label="Launch app" className={ctaClass} {...bind?.("cta")}>
              {ctaContent}
            </a>
          ) : (
            <span className={ctaClass}>{ctaContent}</span>
          )}

          {hit ? (
            <button
              ref={menuButtonRef}
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-controls="site-menu"
              className={menuClass}
              {...bind?.("menu")}
            >
              {open ? "Close" : "Menu"}
            </button>
          ) : (
            <span className={menuClass}>{open ? "Close" : "Menu"}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The fixed header, drawn as a photographic negative of whatever is behind it.
 *
 * Four stacked copies of the same row:
 *   onLight   ink logo and MENU, ink-filled CTA with paper type     over light surfaces
 *   onDark x2 paper logo and MENU, paper-filled CTA with ink type   over dark surfaces
 *   hit       the real link and button, invisible, never clipped
 *
 * Each painted layer is clipped to the parts of the header band its colour
 * belongs to, so when a section boundary passes behind the header the row is
 * cut along that line: above it the old colour, below it the new one.
 *
 * The interactive layer is separate from the painted ones because clip-path
 * also clips hit-testing. Clipping the layer that holds the link and button
 * would make them unclickable wherever that layer is clipped away, which over
 * the hero is all of it. It is transparent and stays whole; the painted layers
 * are aria-hidden, inert and ignore the pointer. Hover and keyboard focus on it
 * are written onto <header> as data-hover and data-focus, and every painted
 * layer styles itself from those, so both halves of a split CTA wipe on the
 * same frame.
 *
 * The header never hides: no scroll-away, no fade. mix-blend-mode is not used,
 * because it would recolour the teal CTA and the logo unpredictably over the
 * photo and over the coal block.
 */
export function Navbar() {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const lightRef = useRef<HTMLDivElement>(null);
  const darkRefA = useRef<HTMLDivElement>(null);
  const darkRefB = useRef<HTMLDivElement>(null);
  const hasOpened = useRef(false);

  // Send focus back where it came from, so closing with the keyboard does not
  // dump the caret at the top of the document. Guarded by hasOpened because the
  // effect also runs on mount, where focusing MENU reads as a stray selection.
  useEffect(() => {
    if (open) {
      hasOpened.current = true;
      return;
    }
    if (hasOpened.current) menuButtonRef.current?.focus({ preventScroll: true });
  }, [open]);

  useAdaptiveNav(navRef, lightRef, darkRefA, darkRefB, open);

  function bind(key: InteractionKey) {
    return {
      onPointerEnter(event: PointerEvent<HTMLElement>) {
        // Touch has no hover; a tap would otherwise leave the wipe stuck on.
        if (event.pointerType === "mouse" && navRef.current) navRef.current.dataset.hover = key;
      },
      onPointerLeave() {
        if (navRef.current?.dataset.hover === key) delete navRef.current.dataset.hover;
      },
      onFocus(event: FocusEvent<HTMLElement>) {
        if (event.currentTarget.matches(":focus-visible") && navRef.current) {
          navRef.current.dataset.focus = key;
        }
      },
      onBlur() {
        if (navRef.current?.dataset.focus === key) delete navRef.current.dataset.focus;
      },
    };
  }

  return (
    <>
      <header
        ref={navRef}
        className="nav fixed inset-x-0 top-0 z-50 h-16 sm:h-[86px]"
        data-open={open ? "" : undefined}
      >
        <LockupSymbol />
        <NavRow kind="onLight" open={open} layerRef={lightRef} />
        <NavRow kind="onDark" open={open} layerRef={darkRefA} pool={0} />
        <NavRow kind="onDark" open={open} layerRef={darkRefB} pool={1} />
        <NavRow
          kind="hit"
          open={open}
          menuButtonRef={menuButtonRef}
          onToggle={() => setOpen((value) => !value)}
          bind={bind}
        />
      </header>

      <MenuOverlay open={open} onClose={() => setOpen(false)} closeButtonRef={menuButtonRef} />
    </>
  );
}

/**
 * Keeps the painted layers' clips in step with the page.
 *
 * Page sections marked data-nav-theme are measured once, in document
 * coordinates, and re-measured only on resize, on a layout change inside them,
 * and on ScrollTrigger refresh; each frame just subtracts the scroll offset. The
 * menu overlay's panels (data-nav-surface) move by CSS transition rather than
 * by scroll, so while the overlay is opening, open or closing their live rects
 * are read each frame and painted over the sections, topmost last.
 *
 * Clips are written straight to the DOM and never through React state, and no
 * transition is applied to them: the split line has to sit exactly on the
 * section edge in every frame, and an eased clip would trail behind it.
 */
function useAdaptiveNav(
  navRef: RefObject<HTMLElement | null>,
  lightRef: RefObject<HTMLDivElement | null>,
  darkRefA: RefObject<HTMLDivElement | null>,
  darkRefB: RefObject<HTMLDivElement | null>,
  open: boolean,
) {
  const updateRef = useRef<() => void>(() => {});
  const overlayRef = useRef(false);

  useIsomorphicLayoutEffect(() => {
    const nav = navRef.current;
    const light = lightRef.current;
    const darkA = darkRefA.current;
    const darkB = darkRefB.current;
    if (!nav || !light || !darkA || !darkB) return;

    let navH = 0;
    let sections: Surface[] = [];
    let panels: HTMLElement[] = [];

    function measure() {
      navH = nav!.offsetHeight;
      const y = window.scrollY;
      sections = Array.from(
        document.querySelectorAll<HTMLElement>("[data-nav-theme]:not([data-nav-surface])"),
      ).map((el) => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top + y, bottom: rect.bottom + y, dark: el.dataset.navTheme === "dark" };
      });
      panels = Array.from(document.querySelectorAll<HTMLElement>("[data-nav-surface]"));
    }

    function update() {
      const y = window.scrollY;
      const painted: Surface[] = sections.map((s) => ({
        top: s.top - y,
        bottom: s.bottom - y,
        dark: s.dark,
      }));
      if (overlayRef.current) {
        for (const panel of panels) {
          const rect = panel.getBoundingClientRect();
          painted.push({ top: rect.top, bottom: rect.bottom, dark: panel.dataset.navTheme === "dark" });
        }
      }
      const bands = darkBands(navH, painted, 2);
      light!.style.clipPath = complementClip(bands, navH);
      darkA!.style.clipPath = bandClip(bands[0], navH);
      darkB!.style.clipPath = bandClip(bands[1], navH);
    }

    function refresh() {
      measure();
      update();
    }

    // Before the first paint, so the header never shows the wrong colour on load.
    refresh();
    updateRef.current = update;

    const offScroll = subscribeScroll(update);
    window.addEventListener("resize", refresh);

    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.addEventListener("refresh", refresh);

    const observer = new ResizeObserver(refresh);
    observer.observe(nav);
    document.querySelectorAll("[data-nav-theme]").forEach((el) => observer.observe(el));

    let alive = true;
    document.fonts?.ready.then(() => alive && refresh());

    return () => {
      alive = false;
      offScroll();
      window.removeEventListener("resize", refresh);
      ScrollTrigger.removeEventListener("refresh", refresh);
      observer.disconnect();
    };
  }, [navRef, lightRef, darkRefA, darkRefB]);

  // Opening or closing the menu: follow the panels frame by frame until they
  // stop, starting in this same frame so there is no flash before the first
  // tick. Open and settled, the ink panel covers the whole band, which leaves
  // the light-on-dark layer fully shown; closed and settled, the panels are
  // ignored again.
  useIsomorphicLayoutEffect(() => {
    overlayRef.current = true;
    updateRef.current();

    const until = performance.now() + OVERLAY_MOTION_MS;
    let frame = requestAnimationFrame(function tick() {
      updateRef.current();
      if (performance.now() < until) {
        frame = requestAnimationFrame(tick);
      } else {
        overlayRef.current = open;
        updateRef.current();
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [open]);
}
