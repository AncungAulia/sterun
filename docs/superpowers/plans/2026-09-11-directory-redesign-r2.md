# Poster-first Race Directory — Revision 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Ancung's review of the live directory: full-bleed featured cards, one list filtered by the top-left location, a simpler filter drawer, a 4-column grid, and no technical wording anywhere in the UI.

**Architecture:** Builds on the first plan (`docs/superpowers/plans/2026-09-11-directory-redesign.md`, Tasks 1-10 done on `feat/directory-redesign`). The pure-function split stays: rules change in `browse.ts` / `filters.ts` / `lib/area.ts` first (R1, R2), then components (R3, R4), then copy across all pages (R5), then verification (R6).

**Tech Stack:** Next.js 16.3.3, React 19.2.8, Tailwind v4 with Nabil's tokens, shadcn/ui on `radix-ui`, React Query v5, Vitest 3 + Testing Library (jsdom), lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-11-directory-redesign-design.md`, section "Revision 2" (overrides earlier sections).

## Global Constraints

- Branch `feat/directory-redesign`. One commit per task (fix rounds add commits). **Do not push, do not open a PR, do not merge.**
- Commands from the repository root `D:\Coding\orca-workspace\sterun` (Git Bash). Focused tests: `pnpm --filter fe exec vitest run test/<file>`. Full suite only in R6.
- Every commit message is English, explains why, and ends with exactly:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01282Bg6Fch4Zhxtjz1yDHJ4
  ```
- All UI text is English, plain, and understandable by an ordinary runner or organiser: **no technical wording** (chain, registry, ledger, Soroban, RPC, hash, simulation, browser storage, and the like) and no filler descriptions. **No em dash (—) or en dash (–) in UI strings** (`fe/test/ui-rules.test.ts`).
- No hex colours, font names or raw px in components; tokens and Tailwind scale classes only. Never edit `fe/app/tokens.css`. Poppins never above 600. `heading-hero` only at `text-4xl` or larger. `.numeric` on dates, counts and amounts.
- React Compiler lint: no `Date.now()` during render, no synchronous `setState` inside `useEffect`.
- Radix `DialogContent`/`SheetContent` without a visible description must pass `aria-describedby={undefined}` so Radix does not warn.
- Tests never touch the network (mock `@/lib/events` `listEvents`, `@/lib/metadata` `fetchEventMetadata`). Test output must be pristine; fix causes, never mute the console broadly.
- A developer's `next dev` server runs from this working tree on port 3000 and hot-reloads; do not stop or restart it.
- Code comments explain *why*, in the voice of the surrounding files. Update `fe/CLAUDE.md`'s directory section in the same task when a documented decision changes.

---

### Task R1: Filter model and drawer simplification

**Files:** `fe/src/modules/directory/filters.ts`, `fe/src/modules/directory/component/FilterDrawer.tsx`, `fe/src/modules/directory/component/FilterChips.tsx` (only if needed), `fe/test/filters.test.ts`, `fe/test/FilterDrawer.test.tsx`, `fe/test/FilterChips.test.tsx`.

**Requirements:**
1. Remove location from the filter model: delete `Filters.locations`, `locationKey`, `locationGroups`, `LocationOption`, `LocationGroup` and their tests; `activeFilterCount` and `filterChips` no longer count or show locations.
2. Replace `openOnly` with `availableOnly: boolean`. It matches a race when `status === "Open"` **and** the sum of its categories' `slotsLeft` is greater than 0 (a race with no categories does not match). Chip label and checkbox label: **"Hide full and closed races"**.
3. `FilterDrawer`:
   - Remove the Location group and the `preferredCountry` prop.
   - Remove the `SheetDescription` text and pass `aria-describedby={undefined}` to `SheetContent`. Keep the title "Filter races".
   - Sort group legend **"Sort by"**, options **"Nearest date first"** (value `"soonest"`, default) and **"Furthest date first"** (value `"latest"`). Remove the RadioGroup's duplicate `aria-label` (the legend names the group).
   - "Availability" group with the single checkbox "Hide full and closed races".
   - Price and Distance groups, staging, live "Show n races", "Clear all" (resets filters and sort) unchanged.
   - Bottom sheet height `max-h-[85dvh]` instead of `85vh`.
4. Tests:
   - `filters.test.ts`: `availableOnly` keeps an Open race with places, drops a Closed race, drops an Open race whose every category is full, drops an Open race with no categories; count and chips cover it; no location tests remain.
   - `FilterDrawer.test.tsx`: radio names "Nearest date first"/"Furthest date first", apply with "Furthest date first" calls `onApply(NO_FILTERS, "latest")`; checkbox "Hide full and closed races" applies `availableOnly: true`; no "Location" text; no "Pick what matters" text; existing staging/discard/clear-all/zero-count tests adapted.

**Interfaces produced:** `interface Filters { prices: PriceBucketId[]; distances: DistanceBucketId[]; availableOnly: boolean }`, `NO_FILTERS`, `activeFilterCount`, `matchesFilters`, `filterChips`, `PRICE_BUCKETS`, `DISTANCE_BUCKETS`; `FilterDrawer({ entries, filters, order, onApply })`.

- [ ] Failing tests first, see them fail, implement, see them pass, lint + typecheck, commit.

---

### Task R2: Location as a filter (area model and picker)

**Files:** `fe/src/lib/area.ts`, `fe/src/modules/directory/browse.ts` (`inArea` only), `fe/src/modules/directory/component/AreaPicker.tsx`, `fe/src/modules/directory/component/AreaForm.tsx`, `fe/test/useArea.test.tsx`, `fe/test/browse.test.ts`, `fe/test/AreaPicker.test.tsx`.

**Requirements:**
1. `Area` becomes `{ countryCode: string; country: string; province?: string }`. `parseArea` accepts a missing or blank province (returns the area without `province`); country code and country name still required. Storage key `sterun.area` unchanged.
2. Add `export function placeLabel(area: Area): string` to `lib/area.ts`: `"{province}, {country}"` when a province is set, otherwise `"{country}"`.
3. `inArea(entry, area)`: compare country codes case-insensitively after trimming; when `area.province` is set, also compare provinces as today (normalised); when it is not set, any province in that country matches. A race without a verified location never matches.
4. `AreaPicker`:
   - Button label: `placeLabel(area)` when set, otherwise **"All locations"**. Map-pin icon stays.
   - Dialog title **"Location"**; remove the description text; pass `aria-describedby={undefined}` to `DialogContent`.
5. `AreaForm` (still `React.lazy`):
   - Country select (default the saved country, else Indonesia `ID`), `modal`.
   - Province select, `modal`, whose **first option is "All of {country name}"** meaning no province; it is selected by default when the saved area has no province. For a country without a province list, keep the optional text box (blank means whole country).
   - Changing to a different country resets province to "All of …"; re-picking the same country keeps it.
   - Buttons: **"All locations"** (shown only when a place is saved; clears it) and **"Apply"** (always enabled once a country is set; saves `{ countryCode, country, province? }`).
6. Tests: `parseArea` with no province; `placeLabel` both forms; `inArea` country-only match, case-insensitive code, province match, other country; picker label "All locations"; applying a province saves it; applying "All of Indonesia" saves no province and the button reads "Indonesia"; "All locations" clears; no description text in the dialog; same-country re-pick keeps the province.

**Interfaces produced:** `Area` (province optional), `placeLabel(area)`, `inArea(entry, area)`; `AreaPicker({ area, onSave, onClear })` unchanged signature.

- [ ] Failing tests first, see them fail, implement, see them pass, lint + typecheck, commit.

---

### Task R3: One list, filtered by location; 4-column grid

**Files:** `fe/src/modules/directory/Directory.tsx`, `fe/src/modules/directory/component/DirectorySkeleton.tsx`, `fe/test/Directory.test.tsx`, `fe/CLAUDE.md` (directory section), `docs/WEB_APP_IA.md` (§3 `/` row).

**Requirements:**
1. `located = area ? entries.filter((e) => inArea(e, area)) : entries`. Search, filters, the drawer's live count and the featured pick all start from `located`. `FilterDrawer` no longer receives `preferredCountry`.
2. Featured: `pickFeatured(located, nowS)` under the existing conditions (not narrowing, documents settled, clock known).
3. Remove the "Races in your area" section entirely.
4. List heading: `"{n} race matches" / "{n} races match"` when narrowing; else `"Races in {placeLabel(area)}"` when a place is set; else `"All races"`.
5. When a place is set and documents have not settled, render `DirectorySkeleton` in place of the featured row and list (the place of a race is only known from its document).
6. When a place is set, documents settled, not narrowing, and `located` is empty: `EmptyState` titled `"No races in {placeLabel(area)} yet"` and a **"See all locations"** button that calls `clearArea`.
7. Grid: `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`, for both the list and the skeleton (skeleton shows 8 cards).
8. Existing behaviour kept: loading, empty registry, error with retry, search/filters/chips, "Clear search and filters" empty state, refresh button. Copy of the error, empty-registry and unreadable-events texts is rewritten in R5, not here.
9. Docs: update the `fe/CLAUDE.md` directory section (remove "Area is by province … own row" wording; describe location as a filter; drawer changes; full-bleed featured cards are R4 so leave that bullet for R4) and the `docs/WEB_APP_IA.md` `/` row (one table row, one line) to match Revision 2.
10. Tests (`Directory.test.tsx`): no area shows "All races"; saved area `DI Yogyakarta` shows heading "Races in DI Yogyakarta, Indonesia" and only races there, and the featured row only features a race there; saved country-only area `Indonesia` shows races in any Indonesian province; saved area with no matching races shows "No races in Bali, Indonesia yet" and "See all locations" clears it and shows "All races"; while a document is pending with an area saved, the skeleton `role="status"` shows; filter via drawer uses "Hide full and closed races"; remove the old "Races in your area" tests.

- [ ] Failing tests first, see them fail, implement, see them pass, lint + typecheck, commit.

---

### Task R4: Full-bleed featured cards

**Files:** create `fe/src/modules/directory/component/FeaturedCard.tsx`; modify `FeaturedEvents.tsx`, `EventCard.tsx` (remove the `featured`/`side` variants and the stretched-frame classes from commit ecad363, so `EventCard` is the grid card only), `PosterFrame.tsx` (only if needed to let the frame fill its parent), `fe/test/FeaturedEvents.test.tsx`, `fe/test/EventCard.test.tsx`, create `fe/test/FeaturedCard.test.tsx`, `fe/CLAUDE.md` (directory section bullets on featured/side cards).

**Requirements:**
1. `FeaturedCard({ entry, size: "lead" | "side" })`: one `<Link data-slot="event-card">` to `/events/[id]`, `aria-labelledby` its title and `aria-describedby` its details (via `useId`), rounded `rounded-lg`, `overflow-hidden`, `shadow-card`, hover `shadow-lifted`, press `scale-[0.98]` with `transition-[box-shadow,scale]`, reduced-motion guards (same as `EventCard`).
2. The `PosterFrame` fills the whole card (absolutely positioned or `h-full`, not a fixed 16:9 box inside the card), showing the whole poster over its blurred copy; the status badge sits top-right.
3. Bottom overlay: a dark gradient from the bottom edge upward built from the `ink` token (e.g. `bg-linear-to-t from-ink/90 via-ink/50 to-transparent`), with text in the `paper` token colour:
   - lead: title `heading-hero text-4xl sm:text-5xl` (line-clamp 2), then venue, date, entries left (icons `aria-hidden`), then price;
   - side: title `heading-strong text-xl` (line-clamp 2), then date and entries left.
   Text must stay readable over light posters; the gradient must reach high enough behind the whole text block.
4. Card shape: lead `aspect-[4/3] sm:aspect-video`; side `aspect-[4/3] sm:aspect-video lg:aspect-auto lg:h-full`. `FeaturedEvents` layout from `lg` when side cards exist: `grid lg:grid-cols-3 lg:grid-rows-2`, lead `lg:col-span-2 lg:row-span-2`, each side card one row; with one race the lead spans the full width at 16:9 (cap its height sensibly, e.g. `lg:aspect-[21/9]`). Side cards stay capped at two.
5. `EventCard` becomes the grid card only (remove `variant`, `SIZES` table entries for featured/side, and the `shrink-0 lg:grow` classes); its tests drop variant cases.
6. Tests: `FeaturedCard` renders title, details, badge and a link named by the title; lead shows venue and price, side does not; the title has `heading-hero` on lead only; `FeaturedEvents` still renders nothing for no races, three links for three races, caps side cards at two, single race spans the row. Remove the obsolete featured/side tests from `EventCard.test.tsx`.

- [ ] Failing tests first, see them fail, implement, see them pass, lint + typecheck, commit.

---

### Task R5: Remove technical wording from every page

**Files:** decided by the copy audit (a list of every technical string in `fe/app` and `fe/src` with file:line, page, category A delete / B plain rewrite / C keep evidence with a plain label). The controller hands the implementer that list as the brief's appendix.

**Requirements:**
1. Category A strings are deleted (and the elements that only exist to hold them).
2. Category B strings are rewritten in plain language that keeps the information the user needs.
3. Category C elements stay; their labels become plain.
4. `ChainSource` is removed from every page it is rendered on; delete the component and its test if nothing uses it any more.
5. Update tests that assert on changed strings; add nothing that re-introduces technical wording. Run every test file that references a changed string or component.
6. Update `fe/CLAUDE.md` where it documents copy that changed (e.g. the directory's "`ChainSource` keeps that claim").

- [ ] Change, run the affected tests, lint + typecheck, commit.

---

### Task R6: Verification and final review

- [ ] Gates: `pnpm --filter @sterunxyz/sdk build`, `pnpm --filter fe typecheck`, `pnpm --filter fe lint`, `pnpm --filter fe test`, `pnpm --filter fe build`.
- [ ] Look at it on the dev server with Playwright (screenshots under `.playwright-mcp/`): `/` at 1440, 1280, 1024 and 390 px with and without a location; featured overlay readability on every poster; drawer; location dialog; `/events/13`; `/org/new`; any page R5 touched.
- [ ] Final whole-branch review, fix wave, report to Ancung in Indonesian (short), branch committed but not pushed.
