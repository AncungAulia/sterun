# Directory redesign — poster-first `/`

Date: 2026-09-11 · Owner: Ancung · Scope: `fe/` only (no backend, no contract change)

## Why

The directory is a grid of text cards. Organisers already upload a poster in the wizard, but the
directory never reads the event document the poster lives in, so none of it shows. The event detail
page and the wizard are considered good and are not part of this change.

## What the data allows (checked 2026-09-11)

- The poster URL, venue, city, province and country live only in the **event metadata document**
  (`poster_url`, `location.{name,city,province,country_code}`), hashed on chain as `metadata_hash`.
  `useEventMetadata` already fetches and verifies it, but only on the detail page.
- Of the 16 events on the v2 testnet registry, **3 have a poster**. Their shapes are 3:1, 4:3 and
  roughly 10:7. All three carry their own large title text.
- Nothing in `fe/` knows the visitor's location. City lists exist per country under
  `public/places/`, provinces in `src/data/places.json`.
- Posters of existing events cannot change: the document is hashed and there is no `update_event`.

## Page structure

```
┌────────────────────────────────────────────────────────────┐
│ ⌖ DI Yogyakarta, Indonesia                                 │
│ Browse races                          [ Search races… ][⚙][↻]│
│                                                            │
│ ┌──────────────────────────────┐ ┌──────────────┐          │
│ │          featured            │ │   side #1    │          │
│ │        (16:9 poster)         │ ├──────────────┤          │
│ ├──────────────────────────────┤ │   side #2    │          │
│ │ Title · date · entries left  │ └──────────────┘          │
│ └──────────────────────────────┘                           │
│ Races in your area                                         │
│ [card] [card] [card]                                       │
│ All races                                                  │
│ [card] [card] [card]                                       │
│ [card] [card] [card]                                       │
│ ─ unreadable-events note · ChainSource footer ─            │
└────────────────────────────────────────────────────────────┘
```

1. **Header.** A location button (map-pin icon + chosen area, or "Choose your area"), the page title
   "Browse races" (`heading-hero`), a search input, a filter button, and the existing refresh action
   as an icon button with an accessible name (STE-13's acceptance still depends on it). The intro
   sentence about the testnet goes; `ChainSource` in the footer keeps that claim.
2. **Featured.** One large card plus up to two stacked side cards. Candidates: events whose document
   verified **and** has a `poster_url`, status `Open`, on-chain `starts_at` still in the future,
   soonest `starts_at` first. With one candidate the large card spans the full width; with none the section is not
   rendered. The section renders once every document query has settled, so the pick does not
   reshuffle while posters arrive.
3. **Races in your area.** Shown only when an area is chosen. Matches events whose document has
   `location.country_code` equal to the chosen country and `location.province` equal to the chosen
   province name. Province, not city: an event in Sleman belongs to someone who picked Yogyakarta.
   Ordering matches "All races". No matches → one line: "No races in {province} yet."
4. **All races.** Every readable event, existing sort (upcoming soonest first, then past most recent
   first). 3 columns ≥1024px, 2 columns ≥640px, 1 below. Featured events appear here too; this is
   the full list.
5. **Search or filter active.** Featured and "Races in your area" are hidden; "All races" becomes
   "{n} races match" with a clear-filters action. No results → an empty state with the same action.
6. Loading, empty registry, RPC failure and the unreadable-events note keep their current behaviour
   and copy.

## Card

```
┌─────────────────────┐
│  poster 16:9 [Open] │
├─────────────────────┤
│ Elektro Dash 2026   │   title, 2 lines max
│ ⌖ FT UGM, Sleman    │   only when the document verified with a location
│ ▦ Nov 5, 2026       │
│ 🎟 500 entries left │   Open events only; "1 entry left"; "Sold out" when every category is full
│ From sUSD 25        │   lowest price; "Free" when every distance is free; "Free to sUSD 40" when some are
└─────────────────────┘
```

- The whole card is one link to `/events/[id]`, as today.
- Status badge (`EventStatusBadge`) sits over the top-right of the poster frame.
- A Draft with no categories shows "No distances yet" in place of the entries and price lines.
- Grid and side cards: title `heading-strong text-xl`. Featured card: title in `heading-hero` at
  `text-4xl` or larger (Big Shoulders is only used at 48px+, per `tokens.css`), info below the
  poster, **never over it** — every poster we have carries its own title text.
- **Side cards are compact**: title, date and entries left only. No venue and no price, matching the wireframe, so the two stacked cards stay no taller than the featured card beside them.
- Colours, radii and shadows come from tokens only. Hover lifts the shadow (`shadow-lifted`) on
  pointer devices only; press gives `scale(0.98)`; both respect `prefers-reduced-motion`.

## Poster frame (one component, used by every card)

- Fixed **16:9** frame, `overflow: hidden`.
- **Poster present:** two layers of the same image. Behind: `object-cover`, blurred and dimmed with
  an ink overlay, filling the frame. In front: `object-contain`, the whole poster, uncropped. A 16:9
  poster fills the frame exactly; any other shape shows blurred bands instead of losing text.
  The front image fades in on load (opacity, ~200ms ease-out; instant under reduced motion).
- **Document still loading:** `bg-n-100` frame, no spinner.
- **No image:** `bg-n-100`, a muted image-off icon and the text "No image". Used when the document
  is unavailable, fails its hash check (per `WEB_APP_IA.md` §6 an unproven document is not shown at
  all), has no `poster_url`, or the image itself fails to load.

## Location picker

- The header location button opens a small dialog: country (default Indonesia), then province, from
  the existing places data. City is not asked; matching is by province.
- The choice is stored in `localStorage` under one key (`sterun.area`, holding country code, country
  name and province name) and read with `useSyncExternalStore` (server snapshot `undefined`), per the
  React Compiler lint rule recorded in `fe/CLAUDE.md`. A "Clear area" action removes it.
- The country name is stored with it so the header label never needs the places dataset
  (`src/data/places.json`, 176 KB, 50 KB gzipped). The dialog's form is `React.lazy`-loaded, so a
  visitor who never opens it never downloads that file.
- No geolocation and no geocoding API.

## Search, sort and the filter drawer

**Search** stays in the header and applies as you type. It matches, case-insensitively, the event
name, venue name, city and province.

**The filter button opens a drawer**: shadcn `sheet` (Radix Dialog, already a dependency through
`radix-ui` — no new package). It slides in from the right at ≥640px (about 24rem wide) and up from
the bottom below that (at most 85% of the viewport tall, scrolling inside). The button shows how many
filters are active.

Drawer contents, top to bottom:

1. **Sort by race date** (radio): Soonest first (default) · Latest first. Past races always come after
   upcoming ones, in either order.
2. **Location** (checkboxes, multi-select): provinces **taken from the events themselves**, each with
   its number of races, so no option can lead to zero results. Grouped by country; the country of the
   chosen area (see Location picker) is listed first, otherwise the country with the most races.
   Events whose document has no location only appear when no location is selected.
3. **Price** (checkboxes, multi-select): Free · Under sUSD 25 · sUSD 25 to 50 · sUSD 50 to 100 ·
   sUSD 100 and up. Lower bound inclusive, upper bound exclusive (a sUSD 50 race is in
   "sUSD 50 to 100"). Labels say "to", never a dash: `fe/test/ui-rules.test.ts` bans em and en
   dashes in UI text.
   Fixed buckets rather than a slider: with a few dozen races a slider mostly lands on empty ranges,
   and fixed buckets read the same on every visit. They live in one constant, so retuning them for
   mainnet prices is a one-line change. Current testnet prices run from free to sUSD 50.
4. **Distance** (checkboxes, multi-select): 5K and under (≤5,000 m) · 6K to 10K · 11K to 21K
   (up to 21,100 m, so a half marathon typed as 21097, 21098 or 21100 stays here) · Over 21K.
5. **Open for entry only** (checkbox).

Matching rules:
- Within a group, options are OR; across groups, AND.
- **Price and distance are checked on the same category.** A race matches only when one of its
  categories satisfies both, so "Over 21K" + "Under sUSD 25" does not match a race whose cheap
  category is the 5K and whose marathon costs sUSD 60.

Behaviour:
- Changes inside the drawer are staged. The footer holds **Clear all** and **Show {n} races**, where
  `n` updates live as options change; pressing it applies and closes. Closing any other way discards
  the staged changes.
- Applied filters appear as removable chips under the header, so they are visible without opening the
  drawer. Sort is not a chip.
- Search or any applied filter hides Featured and Races in your area (see Page structure §5). A sort
  change alone does not.
- State is local to the page. Not in the URL.

## Data flow

- `useEvents()` is unchanged.
- A new hook reads all documents with `useQueries`, **using the same query key as
  `useEventMetadata`** (`["event-metadata", uri, metadataHash]`), so opening an event after the
  directory reuses the verified document instead of fetching it again.
- `fetchEventMetadata` gains a request timeout (8s). Today a host that never answers leaves the
  query pending forever, which would also hold the featured section back. A timeout returns the
  existing `unavailable` result.
- Pure functions (no React) for: picking featured events, matching an area, search, distance
  buckets, the card's price and entries lines. They are what the unit tests target.

## Wizard hint (the one change outside `/`)

`StepDetails.tsx` poster field:
- hint: "16:9, 1920 × 1080 px recommended. PNG or JPEG, up to 5 MB."
- help: explain that the same image is used on the event page and in the race directory, and that
  other shapes are shown whole with blurred edges.

No crop tool (deferred).

## Tests

- Unit: featured pick (poster/status/date/ordering, 0/1/2/3+ candidates), area match (country +
  province, missing location), search fields, sort both ways with past races last, location options
  and counts, price bucket boundaries (0, 25, 50, 100), distance bucket boundaries, price and distance
  matched on the same category, OR within / AND across groups, price/entries lines.
- Component: card with a verified poster, with no poster, with a `modified` document, with an image
  load error, Draft with no categories; directory with search active hides featured and area; drawer
  stages changes, "Show n races" count, apply, discard on close, clear all, chip removal; location
  picker stores and clears.
- All network mocked (`vitest.config.ts` points at the production API).
- By eye: screenshots at 1440px and 390px against the live dev server before calling it done.

## Docs to update in the same branch

- `docs/WEB_APP_IA.md` §3, the `/` row.
- `fe/CLAUDE.md`: a directory section with the decisions above (poster frame, featured rule, area
  match by province).

## Out of scope

Crop tool · `/org` dashboard · any detail page change · backend or contract changes · seeding events.
