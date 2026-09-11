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
│ 🎟 500 entries left │   Open events only; "Sold out" when every category is full
│ from sUSD 25        │   lowest category price; "Free" when it is 0
└─────────────────────┘
```

- The whole card is one link to `/events/[id]`, as today.
- Status badge (`EventStatusBadge`) sits over the top-right of the poster frame.
- A Draft with no categories shows "No distances yet" in place of the entries and price lines.
- Grid and side cards: title `heading-strong text-xl`. Featured card: title in `heading-hero` at
  `text-4xl` or larger (Big Shoulders is only used at 48px+, per `tokens.css`), info below the
  poster, **never over it** — every poster we have carries its own title text.
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
- The choice is stored in `localStorage` under one key and read with `useSyncExternalStore` (server
  snapshot `undefined`), per the React Compiler lint rule recorded in `fe/CLAUDE.md`. A "Clear" action
  removes it.
- No geolocation and no geocoding API.

## Search and filter

- Search matches, case-insensitively, the event name, venue name, city and province.
- The filter button opens a popover with:
  - **Distance** (multi-select): 5K and under (≤5,000 m) · 6–10K · 11–21K · Over 21K. An event matches
    when any of its categories falls in a selected bucket.
  - **Open for entry only** (toggle).
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
  province, missing location), search fields, distance buckets and boundaries, price/entries lines.
- Component: card with a verified poster, with no poster, with a `modified` document, with an image
  load error, Draft with no categories; directory with search active hides featured and area;
  location picker stores and clears.
- All network mocked (`vitest.config.ts` points at the production API).
- By eye: screenshots at 1440px and 390px against the live dev server before calling it done.

## Docs to update in the same branch

- `docs/WEB_APP_IA.md` §3, the `/` row.
- `fe/CLAUDE.md`: a directory section with the decisions above (poster frame, featured rule, area
  match by province).

## Out of scope

Crop tool · `/org` dashboard · any detail page change · backend or contract changes · seeding events.
