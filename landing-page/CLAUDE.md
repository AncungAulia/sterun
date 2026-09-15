@AGENTS.md

# `landing-page/`: the landing page (CLAUDE.md)

The `@AGENTS.md` block above is rewritten by `next dev`. Leave it, and commit it with your work.
What follows belongs to Sterun.

Owner: **Nabil**. Component C13 (landing page + design system).

The stack: **Next.js 16.3.3**, React 19.2.8, Tailwind v4, TypeScript 5, ESLint 9.

**This folder is a pnpm workspace member** (`pnpm-workspace.yaml` at the root), so the only lockfile
that applies is the root `pnpm-lock.yaml`:

```bash
pnpm install                       # from the repository ROOT
pnpm --filter landing-page dev
pnpm --filter landing-page build
pnpm --filter landing-page lint
```

> **There is a stray `landing-page/pnpm-lock.yaml` in the repo, and it should be deleted.** It is
> what a `pnpm install` run from inside this folder leaves behind: nothing reads it (CI installs the
> root lockfile with `--frozen-lockfile`), but it gets committed and it drifts. Do not run an install
> from inside this folder.

## What is already here

The design system landed with STE-7: `app/tokens.css` holds the brand, greyscale and status tokens,
and the `app/tokens` route renders every one of them in the situation it was chosen for. The usage
rules (asset files, minimum sizes, the type ladder, the contrast reasoning) are in
[`../docs/brand.md`](../docs/brand.md).

`app/tokens.css` is duplicated into `fe/`, deliberately: the two apps deploy separately. Change one,
change the other in the same commit. That duplication is the agreed answer until a shared package is
worth its cost; an honest duplicate beats a wrong abstraction.

## The limits of what the copy may claim

The landing page sells the protocol, so a claim on it has to be true:

- **Non-transferable** may be stated as fact, proven from the wasm export surface
  (`sc/contracts/race_record/CLAUDE.md`), not promised. Since v2 that claim has a boundary worth
  keeping: it is about the deployed wasm plus the admin key, not about an address forever
  (`docs/specs/INTERFACE.md` §4).
- **"Live on Stellar testnet" is true.** Take the addresses and explorer links from
  `docs/deployments.md` rather than retyping them; that is the only source updated when an address
  changes, and the addresses did change when v2 landed.
- Testnet uses **sUSD**, not USDC. USDC only applies on mainnet.


- The landing page's own copy: **English** (Nabil's decision, STE-12). Its readers are Instawards
  reviewers and the wider Stellar ecosystem; an Indonesian version for local organisers is a
  different conversation and not this page. The text lives in
  [`docs/landing-copy.md`](../docs/landing-copy.md) along with the claims it may not make. When the
  copy in the code differs from that file, bring the two level in the same commit.
- Accessibility and performance are not later polish. This is the page a grant reviewer opens first.
- Update this file as soon as the design system takes shape (tokens, components, how `fe/` consumes
  them).

## Sections and the header

The header is `fixed` above every section, **always visible** (never hidden on scroll, never faded,
never translated), and its colour **follows the section underneath it**. When a section edge crosses
the header, the header **splits horizontally** exactly on that line: one colour above, another
below. Every full-width section carries:

```tsx
<section data-nav-theme="dark">   // hero, and any dark-ground section
<section data-nav-theme="light">  // Problem, and any light one (the default when unmarked)
```

An unmarked section counts as light. A block that is not full width and never reaches the header
(the coal box under Problem, for instance) needs no marking.

How it works (`components/layouts/Navbar.tsx`, `lib/navTheme.ts`):

- **Four copies of the header row** with identical geometry: `nav__layer--onLight` (ink plus a teal
  CTA), two `nav__layer--onDark` (paper), and `nav__layer--hit`, which is **invisible**
  (`opacity: 0`) but holds the real links and buttons. The painted layers are `aria-hidden`,
  `inert`, `pointer-events: none`. The hit layer is separate because `clip-path` clips hit testing
  too: a button cut in half would only be clickable in half.
- Every frame, the script works out the dark bands overlapping the header and writes an inline
  `clip-path`: `inset()` per band for onDark (pooled across the two layers), the inverse for onLight
  (an even-odd polygon). **Never** put a `transition` on these layers' `clip-path`, or the line lags
  behind the section edge.
- Updates come from `subscribeScroll` (`lib/scroll.ts`; Lenis's scroll event in the same frame, or
  native scroll without Lenis), plus resize, `ScrollTrigger` refresh, `ResizeObserver` and
  `document.fonts.ready`. Section offsets are cached; never read layout inside a scroll loop.
- The menu overlay panel is marked `data-nav-surface` plus `data-nav-theme`; while the menu is
  moving its position is read live each frame, so the header splits over the panel on its way down.
- Hover and keyboard focus are stored on the `<header>` as `data-hover` / `data-focus`
  (`cta` | `menu` | `logo`) and styled from there, so both halves of the CTA wipe together. **Do
  not** use `:hover` for a header effect: only one layer ever receives it.
- The logo is inline SVG using `currentColor` (`components/elements/Lockup.tsx`, generated from
  `public/brand/logo/sterun-lockup-black.svg`). One `<symbol>`, one `<use>` per layer.
- The header does **not** use `mix-blend-mode`.

A surface that a script moves, rather than one that only scroll moves (the plain blue layer inside
the How it works box), is marked `data-nav-surface data-nav-live data-nav-theme`: the header reads
its rect on **every** update, clipped to its `data-nav-bounds` ancestor. Whatever script moves it
calls `notifyScroll()` immediately after writing the transform, so the header never lags a frame.

A section that holds the screen (a `sticky` stage, such as How it works) cannot be read through
cached offsets, because its position changes while it is held. Mark its dark part with an empty
`absolute` element at its **final** position, once the stage has been released (see the marker in
`modules/how-it-works/HowItWorks.tsx`). While the stage is held, that dark part stays under the
header anyway, so one static position is correct in both phases.

## Motion

The `--motion-*` and `--ease-*` tokens govern **UI state changes**: a hover, a menu, a button
settling. Scroll choreography does not use them, and should not: 200ms on a 50px rise triggered by
scroll reads as a flinch rather than an entrance. Those timings are **measured from the reference
they came from** and the measurement is recorded in the module that uses it, so the next person can
check it rather than taste it. `lib/hiwMotion.ts` holds akaru's numbers;
`modules/product-preview/ProductPreview.tsx` holds nbnzia's.

### Smooth scroll: Lenis

- **`lenis` is pinned to exactly `1.2.3`** (no `^`). Its defaults change between minor versions, and
  the way this page scrolls comes from those defaults.
- The only initialisation is `new Lenis({ autoRaf: true })` in `lib/scroll.ts`. **Do not** override
  `lerp`, `duration` or `easing`.
- **Do not** use `ScrollTrigger.scrollerProxy`, `lenis.on("scroll", ScrollTrigger.update)` or
  `gsap.ticker.lagSmoothing(0)`. Lenis moves the window's real scroll position, so the browser fires
  native scroll events and ScrollTrigger stays in sync on its own. A proxy, or a second update loop
  on top, makes the two fight. Measured with a mouse wheel: reveal progress follows scroll position.
- Lock scrolling **only** through `lockScroll()` / `unlockScroll()` in `lib/scroll.ts`:
  `lenis.stop()` when Lenis is running, `overflow: hidden` on `<html>` when it is not. **Never** put
  `overflow: hidden` on `<body>`: when Lenis stops, `<html>` is already `overflow: clip`, so body
  becomes a scroll container of its own and every `sticky` element comes unstuck. This is what sent
  the How it works stage jumping behind the menu.
- An element that scrolls inside the page (the menu panel) gets `data-lenis-prevent`.
- Under `prefers-reduced-motion`, Lenis **is not started at all**
  (`components/elements/SmoothScroll.tsx`), and the preference is honoured immediately.

### GSAP

- **GSAP 3.15** (the free standard licence). Registered plugins: **ScrollTrigger** and **SplitText**.
  Flip and InertiaPlugin ship in the package but are only registered if something actually uses them.
- GSAP is used **only** for movement CSS cannot express cleanly: per-character reveals scrubbed to
  scroll, and viewport-triggered entrances with a stagger. Hover, underlines, the CTA roll and the
  menu panel stay CSS and transitions (`app/globals.css`, `MenuOverlay.tsx`). Do not add another
  animation library.
- Every GSAP setup sits inside `gsap.matchMedia().add("(prefers-reduced-motion: no-preference)")`.
  Reduced motion then means no movement without any extra work, and `mm.revert()` in cleanup clears
  inline styles, ScrollTriggers and SplitText when the component unmounts.
- Split text with **SplitText** (`type: "words,chars"`, `aria: "auto"`), never hand-rolled spans.
  The word wrapper keeps lines breaking only at spaces, and `aria: "auto"` makes a screen reader
  read the sentence rather than spell it out.
- Animated colours are read **from an element carrying the token class** (`getComputedStyle`), never
  written as a hex. Tailwind v4 only emits the `--color-*` variables some class actually uses, so
  reading `var(--color-…)` straight off `:root` can come back empty.
- **Hold a section on screen with CSS `sticky`, not ScrollTrigger's `pin`.** No pin spacer shifts the
  layout on refresh, and section offsets stay static for the header. The stage's ancestor must be
  `overflow-x-clip`, not `overflow-hidden`: `hidden` turns it into a scroll container and the stage
  never sticks.
- **Scrub `transform` only** (`x`, `y`, `yPercent`), so the compositor does the work and no frame
  repaints. A wipe that opens content uses a two-layer mask (the box moves one way, its content the
  other), never `width` or `clip-path`.
- **Beware `invalidateOnRefresh` on a staggered timeline.** An invalidated tween forgets its start
  value until the playhead reaches it, so a panel whose turn has not come measures as already fully
  down. Function values (measured pixels) are for tweens that start at time 0; everything else uses
  percentages.
- **The How it works horizontal track** (`modules/how-it-works/HowItWorksTrack.tsx`, the model in
  `lib/hiwMotion.ts`). Its movement is **measured from akaru.fr**, not invented: their page was
  sampled in headless Chrome (1440x900, every 50px of scroll) and every curve in `hiwMotion.ts` is a
  fit to that data. Do not "tidy up" the numbers without measuring again.
  - The track sits **inside the blue box**. That box is the last pour panel and also the container
    that clips the track, and it is one screen tall. Its contents are counter-translated during the
    pour, so they hold still while the box edge comes down. **Nothing ever stops**: the coal and
    runway wipe, then the pour runs while the page keeps scrolling (the heading rises out of view),
    and the pour lands exactly as the box reaches the top of the screen, where the box is then held.
    The pour is **one layer** (the blue box) and finishes as the section reaches the top. The box
    carries `data-hiw-cover`, five colour layers over the track, wiped down **in sequence** (blue
    leaves first, ink last) from the middle of the pour until the box touches the top, so the
    content is already opening while the heading is still visible. The only thing holding the screen
    is the sticky stage with a negative `top` (the height of the heading). The handover from the
    coal wipe to the pour is `HANDOVER_SCREEN` in `lib/hiwMotion.ts`, which `HowItWorks.tsx` turns
    into the ScrollTrigger position `HANDOVER`. Every size is relative to the **box width** (`--bw`,
    kept current by a `ResizeObserver`), and the track's scroll length is `3450/900 x` the box
    height.
  - A panel that is waiting: its window scales from its left-centre and drops slightly, and the
    image inside it scales `2 - scale`. Its pull to the right is released by the **previous**
    panel's progress, not by its own position. Title, pill, details and button are played on a timer
    when the panel's left edge crosses its threshold, and run backwards (faster, without the
    stagger) when the page is scrolled back.
  - Enter occupies akaru's intro slot, so it starts shifted `0.5 - 0.666` to the left.
  - The arrow button opens that step into a dialog filling the box (`StepDetail.tsx`, data in
    `steps.ts`): the card expands from where it sits (clip-path), the image starts exactly as it was
    in the card and becomes a crop the width of the box, the title slides to the left column, and
    the description and links appear on the right. While it is open: scrolling is locked
    (`lockScroll` plus wheel, touch and scroll keys prevented), the track is `inert`, Tab is trapped
    in the dialog, Escape closes it, and focus returns to the arrow **after** the next render
    (before that the track is still inert and `focus()` is ignored).
  - akaru's scroll lengths follow viewport **height**, not width (measured at 1440x700).
  - **`gsap.quickSetter(el, "scale")` silently writes nothing** (`scale` is an alias). Write
    `style.transform` directly for an element that owns its own transform.
- **Do not animate `font-weight` on text that flows.** A heavier weight is also a wider one, so every
  character after it shifts and a line can move. For a bold effect, use `-webkit-text-stroke` in the
  same colour (see `.problem-char` in `globals.css`).
