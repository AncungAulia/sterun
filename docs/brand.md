# The Sterun brand — assets, colours, type

Owner: **Nabil** (C13, STE-7). This is guidance, not law. If a rule below makes a page worse, the
page wins — but write the reason in the PR.

Only three things are **not** flexible, and none of them is a matter of taste:

1. Colours come from tokens, never typed as hex in a component.
2. The term is **"race record"**, never "participation record".
3. Colour is never the only carrier of meaning — there is always an icon or text as well.

---

## Asset files

They all live in `landing-page/public/brand/logo/`, with identical copies in
`fe/public/brand/logo/`. Two copies is deliberate: each app has its own lockfile, `node_modules` and
deployment (see `landing-page/CLAUDE.md`). Change one, change the other in the same commit.

| File | Shape | Where it is used |
| --- | --- | --- |
| `sterun-logo-black.svg` | the mark alone, 400×400 | square slots on a light background: favicon, avatar, app header |
| `sterun-logo-white.svg` | the mark alone, 400×400 | square slots on a dark background |
| `sterun-lockup-black.svg` | mark + wordmark, 1245×400 | wide slots on a light background: site header, banners, slides |
| `sterun-lockup-white.svg` | mark + wordmark, 1245×400 | wide slots on a dark background |
| `sterun-background.png` | the mark on a `#F8F8F8` square, 400×400 | the favicon source; the X avatar |

All four SVGs are **transparent** — there is no white box behind them, so each takes on whatever
colour is underneath it.

### Pick the right file; do not use a CSS filter

The light version is not the dark one run through `invert()`. If the background is dark, use the
`-white` file. `filter: invert()` also inverts every other colour in the image, and the result is
never quite right.

---

## Size and spacing

**Minimum mark: 32px.** The runner is drawn with thin open strokes, and thin strokes are the first
thing to fall apart when scaled down. At 32px — which is what a modern browser tab actually uses —
it still reads. At 24px and below the strokes start merging into a blob.

If a mark below 32px is ever needed, the answer is not to force this file but to draw a simplified
variant for small sizes. That is a normal thing for almost every logo to have.

**Lockup:** minimum width 160px. Below that the wordmark is unreadable; use the mark alone.

**Clear space:** each file's `viewBox` already contains its safe margin. As long as the file is used
as-is without cropping, the spacing is correct. A rough guide if you have to measure by hand: leave
empty space the height of the runner's head on every side.

---

## Colour

The source of truth is `landing-page/app/tokens.css` (and its copy in `fe/`), not this document.
What follows is a summary so it can be read without opening code.

### Brand — three colours

| Token | Hex | Role |
| --- | --- | --- |
| `paper` | `#F8F8F8` | page background |
| `ink` | `#1E232B` | primary text, dark surfaces |
| `teal` | `#016985` | the only accent — if it is teal, it is clickable |

Their derivatives: `n-50`…`n-950` (ten steps of grey pulled towards ink) and `teal-50`…`teal-800`
(a button has four states that must look different).

### Status — in pairs

| Meaning | Dark (text) | Light (full screen) |
| --- | --- | --- |
| success | `#067A38` | `#0FA047` |
| danger | `#A31C11` | `#E23B22` |
| warning | `#8F5200` | `#D18700` |

The dark ones are for text on a light background; the light ones for full-screen panels on race day,
always at 32px type or above. The green is pushed towards yellow and away from teal, and the warning
towards amber and away from red, so each pair stays distinguishable to a red-green colour-blind eye.

Every text colour above passes 4.5:1 against `paper`. The `-strong` ones pass 3:1 against white,
which is enough because they are only ever used under large type.

---

## Type

| Class | Font | What for |
| --- | --- | --- |
| `.heading-hero` | Big Shoulders 700 | the landing hero, the scanner's verdict — one per screen |
| `.heading-strong` | Poppins italic 600 | the wordmark, section titles |
| `.heading` | Poppins italic 500 | card titles |
| (default) | Poppins roman 400–500 | body, forms, tables, numbers |
| `.numeric` | Poppins + tabular figures | bib numbers, 6-digit codes, contract addresses |

**Poppins never goes above 600.** Not merely a request: `layout.tsx` only loads weights 400/500/600,
so `font-bold` produces browser-synthesised faux bold that looks bad — the violation announces
itself. Emphasis comes from size, italics and colour.

`.numeric` switches on *tabular figures* and a *slashed zero*: every digit becomes the same width, so
a code that changes every 30 seconds does not jitter, and a `0` is not read as an `O` by a volunteer
reading it aloud.

---

## Favicon

`app/icon.png` (256px), `app/apple-icon.png` (180px) and `app/favicon.ico` (16/32/48) in **both**
apps. All three are generated from `sterun-background.png` by cropping the 400×400 canvas to the
mark's bounding box and adding a 14% margin, so the runner fills the space instead of floating in the
middle of padding.

Next.js installs all three automatically through file-name conventions in `app/` — there is no
`<link>` to write by hand. If the mark changes, regenerate all three rather than editing them one at
a time.

---

## Seeing it all at once

```bash
cd landing-page && npx next dev --port 4311   # then open /tokens
```

The `/tokens` route shows every token in the situation it was chosen for: the logo at four sizes, the
lockup on three backgrounds, the seven status colours side by side, the type weight ladder, and two
scanner screens. That page exists so disagreements surface before Ancung builds on top of the tokens
rather than after. Delete it or put it behind a flag once the tokens are settled.
