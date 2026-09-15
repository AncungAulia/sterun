# Polish pass (STE-23)

Everything that is live, measured rather than looked at, at a phone width and a laptop width. The
findings are addressed to whoever owns the code they live in, with a status per row. Nothing here is
a redesign: this pass is about consistency and finish.

| What | Where |
| --- | --- |
| The tool | [`../tools/audit-pages.cjs`](../tools/audit-pages.cjs) |
| Raw numbers | [`audit.json`](audit.json) |
| Screenshots, per page per width | [`exports/`](exports/) |

```bash
# both dev servers first
cd landing-page && pnpm exec next dev --port 3000
cd fe          && pnpm exec next dev --port 3001
node docs/design/tools/audit-pages.cjs
```

Measured on **15 September 2026**. What the tool checks, per page and per width:

- **contrast**: every visible run of text, its colour composited against the first opaque ground
  behind it, against the AA threshold for its own size and weight
- **target size**: every interactive element against the 24x24 CSS px floor (WCAG 2.5.8) and the
  44x44 comfortable size (2.5.5)
- **focus**: pressing Tab for real and comparing the focused element against itself unfocused
- **overflow**: whether the document scrolls sideways at 390px
- plus `lang`, `<h1>` count, `<img>` without `alt`, console errors, and the page title

---

## 1. What passes

Worth stating, because a findings list on its own reads as though everything is broken.

| Check | Result |
| --- | --- |
| Focus rings | **Every** focusable element in our code changes appearance on a real Tab press. The only element without one is the Next.js dev overlay, which does not ship |
| Horizontal overflow at 390px | None, on any page |
| Raw hex in `fe` | **0** |
| Default Tailwind palette classes in `fe` | **0** |
| `lang` attribute | `en` on every page |
| `<img>` without `alt` | **0** |
| Terminology in `fe` | Consistent. Prose says "race pack", and the one-word `racepack` appears only as a variable or a data key |

The 18 arbitrary Tailwind values in `fe` are almost all shadcn's own (15 of them are in
`components/ui/`, mostly the 3px focus ring). Two are ours, in `EventView.tsx`.

The 39 hex values in `landing-page` are all in `app/tokens/page.tsx`, the token reference page,
whose job is to print the hex values. Not a violation.

## 2. Findings

Priority is about what a visitor notices or what an assistive technology gets wrong, not about how
hard it is to fix.

### High

**F1. The muted grey fails AA, everywhere it is used on a light ground.**
`fe/app/globals.css:48` maps `--color-muted-foreground` to `--color-n-500`. Measured on the live
pages: **4.22:1** on `paper` and **3.92:1** on `n-100`, where AA wants 4.5 for text under 18.66px.

Seen on real screens as: the "No image" label on every event card in the directory (20 instances on
one screen), "This race has not published a poster." on the event page, and the unit word inside
the entries-left readout.

Scale: 57 uses of `text-muted-foreground` across 25 files, all fed by that one token line, plus
**59** direct `text-n-500` uses on text across 33 files. `n-600` measures **6.58:1** on paper and
reads as the same quiet grey.

Note the split: the four `text-n-500` uses on icons are fine as they are. Non-text contrast (WCAG
1.4.11) wants 3:1 and `n-500` clears it.

*Owner: Ancung (`fe/`). Status: reported, not fixed, per the handoff-only decision for this ticket.*
*One line fixes 57 of them; the rest is a find and replace with icons left alone.*

**F2. Every page has the same title.**
`fe/app/layout.tsx` is the only file in the app that sets metadata. No page defines its own, so the
directory, an event, the 404 and the whole console all render `<title>Sterun</title>`.

This one is worse here than in most products. Sterun's argument is a link you can send someone as
proof, so an event page shared into a chat, a bookmarked race, and a search result all say "Sterun"
and nothing else. The event page already has the race's name in hand when it renders.

*Owner: Ancung (`fe/`). Status: reported.*

### Medium

**F3. The "All races" back link is 358x21 on a phone.**
Its height breaks the 24px floor in WCAG 2.5.8. Formally it probably survives on the spacing
exception, since nothing else sits within 24px of it, but a 21px-tall standalone back link at the
top of a phone screen is an awkward thing to hit. Vertical padding fixes it without moving anything.

The two address links measured at 20px and 23px tall are **exempt**: they are inline in a sentence,
which 2.5.8 excludes by name. No change needed.

*Owner: Ancung (`fe/`). Status: reported.*

**F4. Header and toolbar controls sit at 32 to 40px tall.**
"Connect wallet" (138x36), the search field (308x36), "Filters" (42x36), "All locations" (128x32),
the refresh button (32x32), and every tab on the event page (40px tall). All clear the 24px AA
floor, so this is not a failure; all are under the 44x44 that 2.5.5 asks for and that a thumb wants.

The refresh button at 32x32 is the one worth raising on its own: it is square, it is small, and it
sits next to other controls.

*Owner: Ancung (`fe/`). Status: reported as advisory.*

**F5. The 404 page has no `<h1>`.**
Every other page has exactly one. A screen reader's heading list is empty on the one page where the
reader is already lost.

*Owner: Ancung (`fe/`). Status: reported.*

### Fixed in this pass

**F6. `n-500` on the race-day mockups.** The same bug as F1, in my own work, found by measuring the
profile screens. Six declarations raised to `n-600`. Recorded in that board's contrast table so it
is not rediscovered later. *Fixed, commit on this branch.*

**F7. "racepack" written as one word in prose.** `fe` has always spelled it "race pack" in every
user-facing string, and the one-word form only as an identifier. My work did the opposite in 12
places across the race-day board, the motion page, the two design specs and the landing token page.
Now matching `fe`, which was right. The contract function `claim_racepack`, the state
`RacepackClaimed` and the `racepack` phase key are identifiers and are untouched. *Fixed.*

## 3. Not audited, and why

| Flow | Why not |
| --- | --- |
| Entry and the QR pass (STE-21) | Not built. No code exists to audit |
| Scanner PWA (STE-22) | Not built |
| Organiser console (STE-17) | **Being written right now.** It was measured today and the two pages that exist are in the numbers above, but Ancung has commits landing in it daily, so a full pass belongs after STE-17 merges |
| The landing page | **Not on `main`.** See below |

**The landing page is not on `main`.** `main` still carries a placeholder that renders the words
"Empty page for landing page". The real landing lives on `feat/8-landing-page`, which is **38
commits ahead of `main` and 266 commits behind it**. It cannot be audited as a live flow because it
is not live, and the drift is worth naming on its own: that branch has not seen `main` since before
the v2 contracts, the organiser allowlist, the bib change and the quota change all landed. The
longer it sits, the more the merge costs.

*Owner: Nabil (me). Next step: rebase or merge STE-12, then run this tool against it.*

## 4. Re-running this

The tool is committed, so the next pass is one command and produces comparable numbers rather than a
fresh opinion. Two things about it are worth knowing, because both were wrong in its first version
and both produced false confidence:

1. **Text over a gradient or an image is reported, not skipped.** The first run silently dropped
   every run of text it could not resolve a ground for, which made a page with an image behind its
   text look clean.
2. **Focus is tested by pressing Tab.** A programmatic `element.focus()` does not reliably match
   `:focus-visible`, which is what focus rings are written against, so the first version reported
   missing rings on elements that have them.

Text hidden with the `sr-only` pattern is excluded from the contrast check. It is clipped to a 1px
box on purpose, and measuring it reports an alarming 1:1 on a label only a screen reader reads.
