@AGENTS.md

# `fe/` — the web app (CLAUDE.md)

The `@AGENTS.md` block above is rewritten by `next dev` — leave it, and commit it with your work.
What follows belongs to Sterun.

Owner: **Ancung** (flow) + **Nabil** (design system). Components C9/C10/C11/C12. Already built:
**STE-8** (shell + wallet connect) and **STE-13** (the directory `/` and the detail page
`/events/[id]`). Next is STE-17 (organiser console), then STE-21/22 (QR pass + scanner PWA), then
STE-24 (profile).

`/events/[id]` has been **revamped** (part of STE-17): the poster and a decision card at the top,
then six tabs — Details, Terms, Timeline, Distances, Race pack, Verification. One rule governs the
split: **what comes from the chain versus what comes from the document**. The decision card is
entirely chain; the tabs are reading material. A document that fails its hash check is **withheld
from every tab**, and the difference between `modified` and `unavailable` is explained only in
**Verification**.

The installed stack: **Next.js 16.3.3**, React 19.2.8, Tailwind v4 (`@tailwindcss/postcss`),
TypeScript 5 (`target: ES2022` — contract `i128` prices arrive as `bigint`, and `bigint` literals do
not typecheck below ES2020), ESLint 9, **`@tanstack/react-query`** for caching chain reads, and
`zustand` for wallet state.

**There is no lockfile in `fe/`.** This folder is a member of the pnpm workspace
(`pnpm-workspace.yaml` at the root), so the only one that applies is the root `pnpm-lock.yaml` —
which is also what CI installs with `--frozen-lockfile`. Do not run `npm install` or `pnpm install`
from inside `fe/`: that grows a second lockfile nobody reads but which still gets committed.

```bash
pnpm install                # from the repository ROOT, not from fe/
pnpm --filter fe dev
pnpm --filter fe build
pnpm --filter fe lint
pnpm --filter fe typecheck
```

`typecheck` is `next typegen && tsc --noEmit`, and the `next typegen` **must not be skipped**:
`app/layout.tsx` uses `LayoutProps<"/">`, a global type Next 16 generates into `.next/types/` which
does not travel with the repo (`.next/` is gitignored). A bare `tsc` on a machine that has never
built fails with `TS2304: Cannot find name 'LayoutProps'` — that is an ungenerated type, not a bug.

## UI: shadcn/ui on top of Nabil's tokens (STE-17)

```
src/components/ui/        <- shadcn. Generated, but ours: editing is allowed.
src/components/form/      <- fields and form parts, built ON TOP OF ui/
src/components/feedback/  <- notices, badges, empty and error states
src/components/layout/    <- the site's chrome
src/components/wallet/    <- connecting, gating and topping up a wallet
src/modules/<feature>/components/  <- what only that feature uses
```

**`app/tokens.css` is NOT touched.** It belongs to Nabil (STE-7) and remains the only source of
colour, type and radius values. shadcn writes its components against its own semantic names
(`bg-background`, `text-muted-foreground`, `border-border`, `ring-ring`); the mapping from those
names to Nabil's tokens lives in **`app/globals.css`** in a single `@theme inline` block, and
nowhere else. The consequence: changing one brand colour is still a change in one place, and
swapping component libraries later touches only that file.

The old rule still holds and has not changed meaning: **no hex values, font names or raw px in a
component.** Those shadcn names are aliases for tokens, not new values.

### Adding a shadcn component

```bash
cd fe && pnpm dlx shadcn@latest add <name> --yes
sed -i 's|from "cn"|from "@/utils/cn"|' src/components/ui/*.tsx   # REQUIRED, see below
```

Three things that confuse people who do not know:

- **The CLI writes `import { cn } from "cn"`**, which does not resolve. That is a bug in its
  interaction with the `utils` alias in `components.json`. Fix it after every `add`; typecheck
  catches it if you forget.
- **Radix arrives through the combined `radix-ui` package**, not `@radix-ui/react-*` individually.
  Do not install the individual ones: two copies of Radix in one graph is the same shape of problem
  as two copies of `@stellar/stellar-sdk` (the root `CLAUDE.md`).
- **The `dark:` classes in generated components are dead**, because v1 is light-only (an STE-7
  decision). They are left as they are so the files stay easy to diff against upstream at update
  time. What makes them *actually* dead is one line the `sidebar` generator added to `globals.css`:
  `@custom-variant dark (&:is(.dark *))`. Without it Tailwind v4 resolves a bare `dark:` against
  `prefers-color-scheme`, so every one of those "dead" classes fires on a laptop whose OS is set to
  dark. Nothing in this app ever writes a `.dark` class, which is the point.
- **Some generated files do not pass this repo's lint**, and the fix goes in the file rather than in
  the config. `sidebar.tsx` calls `Math.random()` inside a `useMemo` (`react-hooks/purity`), which
  is deliberate in a skeleton and carries a one-line disable. `hooks/useMediaQuery.ts` set state from
  an effect (`react-hooks/set-state-in-effect`) and was rewritten onto `useSyncExternalStore`; that
  one is not only a lint fix, since the generated version answers "not a phone" on the first client
  render and then swaps.

### The variants we added ourselves

`ui/badge.tsx` gains `success`, `warning`, `accent` and `muted` — shadcn ships none of those four,
and this app needs them: an event is `Open` or it is not, a document matches its hash or it cannot be
read. All of them are built from Nabil's tokens like every other variant, so the palette stays one.

`muted` exists because `secondary` maps to `n-100`, one step from the page's own colour, so a chip
using it reads as an outline chip that lost its outline. That was noticed from a **screenshot**, not
from a test: `Draft` and `Closed` looked identical on screen while meaning opposite directions in
time. See the header of `elements/EventStatusBadge.tsx`.

`ui/tabs.tsx` is also ours (the event page is built on it).

`ui/sidebar.tsx` (plus `separator`, `skeleton` and `hooks/useMediaQuery.ts`, which come with it) is the
console rail, added 2026-09-14. Its eight colour names are resolved in `globals.css` like every
other shadcn name: `--sidebar` is `--color-ink`, `--sidebar-foreground` is `--color-n-300`,
`--sidebar-accent` is `--color-n-800`, `--sidebar-ring` is `--color-teal-400`. They are declared in
a `:root` block rather than only as `@theme inline` aliases because `sidebar.tsx` also reads
`var(--sidebar-border)` directly in its `outline` variant, which an alias would leave pointing at
nothing. **`--sidebar-accent` is hover, not the current page**: shadcn spends that one name on both,
so the row under the pointer would be indistinguishable from the row you are on. The teal current
page is an override carried by `ConsoleSidebar` itself. The generator's `.dark` block was deleted
rather than remapped.

## Required reading before building a flow

| Document | What for |
| --- | --- |
| `fe/guides/ARCHITECTURE.md` | **read first**: folder structure, the rules per layer, data access, UI rules, the checklist |
| `docs/WEB_APP_IA.md` | **this app's page map**: which URLs exist, what is on them, where their data comes from, the build order |
| `docs/SYSTEM_DESIGN.md` §6 | the full user flows: entry, race day, finish, verify |
| `docs/SYSTEM_DESIGN.md` §7 | the rotating QR / anti-fraud design |
| `docs/specs/HASH_AND_TOTP.md` §4–§5 | the QR payload + TOTP code derivation, **byte-exact** |
| `docs/specs/INTERFACE.md` | function signatures + error codes |
| `sc/bindings/README.md` | how to use the generated TS clients |

## Contracts: through `@sterunxyz/sdk`, not the raw bindings

```json
{ "dependencies": { "@sterunxyz/sdk": "workspace:*" } }
```

This note used to say to use `file:../sc/bindings/*`; that was written before the SDK existed. Now
`@sterunxyz/sdk` (STE-15/STE-19) is finished, tested against live testnet, and published to npm, and
`fe/guides/ARCHITECTURE.md` §2 makes the SDK the **only** way to talk to the contracts. The
dependency stays `workspace:*` even though the package is published: `fe` should build against the
SDK in this repository, not against whatever version npm last received.

**The SDK has to be built first** before `fe` can typecheck, test or build:
`pnpm --filter @sterunxyz/sdk build` (which produces `sdk/dist/`). `pnpm -r build` from the root is
already topologically ordered, so this only bites when you run `fe` alone in a fresh clone.

Do not retype a contract signature, and do not edit anything under `sc/bindings/*/` — that is
generator output, and a hand edit disappears without trace at the next regeneration.

### Reading the chain (what STE-13 already built)

- `src/lib/chain/sterun.ts` — `readClient`, **read-only**. Every SDK view is a simulation, so public pages
  work without a wallet. A test fails if this file ever imports a wallet.
- `src/lib/event/events.ts` — `listEvents` / `getEventSummary`. The registry has no "list events" (a view
  returning an unbounded vector kills itself the moment the protocol succeeds), so the list is
  assembled from `event_count` + `get_event` per id, in parallel.
- `src/lib/event/metadata.ts` — download the document at `uri`, hash its bytes with sha256, compare against
  `metadata_hash`. **The convention: `metadata_hash` = the sha256 of exactly the bytes served**, with
  no canonicalisation. STE-17 writes its documents under the same rule.
- `src/hooks/useEvents.ts` + `useEventMetadata.ts` — React Query on top of both.

## The organiser console: the wizard's shape (STE-17)

`/org/new` is **6 steps**: Details → Distances → Terms → Add-ons → Review → Done. The rule is
unchanged and has not softened: **do not add a step that merely maps one transaction** (the reasoning
is in `docs/WEB_APP_IA.md` §5.1 and in the header of `modules/organiser/create/CreateEvent.tsx`). The three
that were added are not that:

- **Terms** — one text field, zero transactions. Its contents go into the event document, so they
  are covered by `metadata_hash`: the race's rules become frozen and provable.
- **Add-ons** — one step, but **many** transactions (one per size), so it is the opposite of what is
  forbidden.
- **Done** — zero transactions. A completion screen, with a receipt for each signature. `Done` is
  **derived** from `run.isComplete` rather than `setStep`: the run owns the fact that it finished,
  and storing that fact again as a second piece of state is two sources of truth for one thing.

- `modules/organiser/create/lib/run.ts` — the list of signatures (pure, no React). Its order is forced: the
  document is hashed by `create_event`, so it has to be online first; `add_category` needs an
  `event_id`.
- `modules/organiser/create/hooks/useEventRun.ts` — what executes that list. It stops at the step that failed, what has landed
  stays recorded, and calling `start()` again resumes from what has not. **The loop holds a local copy
  of `landed`**, because `setState` only takes effect on the next render and the loop finishes within
  one.
- `create/components/StepReview.tsx` — **a preview of the real event page**: it draws
  `modules/event-detail/EventView.tsx`, the same component as `/events/[id]`, filled by
  `modules/organiser/create/lib/preview.ts` from what the run is about to sign. Its document is read through
  `readEventDocument` (the same parser the public page uses), so what the page does not read does not
  appear in the preview either. **Do not write another bespoke review summary**: the old version did,
  and it drifted silently (the description lost its line breaks while the public page kept them).
  **The preview draws no Enter button at all**, neither on the right-hand card, nor on a distance
  card, nor in the timeline (`EventView preview` → an empty `onEnter` + `offerEntry={false}`): the
  event does not exist yet, and a link out of the wizard throws away everything typed. The preview's
  **Verification** tab holds one sentence saying what it will be for: it used to print the file
  itself and the first half of its fingerprint, and neither meant anything to the person on that
  screen, who typed all of it into the form a moment ago. The **Create event** button sits at the
  bottom right like every other step, and opens a **Dialog** holding the **whole run**: the list of
  signatures, their ticks, their failures, and the way out. Starting it is a second press. The dialog
  cannot be closed while it runs, and closes itself when it finishes. The dialog says **"Your wallet
  will ask you {n} times"**, not a count of signatures, and the button that begins is **Start**.
- **There is no "create the event without a document".** There used to be, and it was a trap: what it
  produced was not an emergency event but a permanently broken one (a page with no poster, location
  or schedule, forever — the hash is committed by `create_event` and there is no `update_event`),
  offered exactly when someone was already frustrated. If publishing fails there is one way out,
  **Put the details online yourself** (`DocumentFallback`), which still produces a whole event.
- `create/components/StepAddOns.tsx` — the race pack's contents, in **two lists**: what is included with the
  ticket, and what is sold on top. Both are written to the chain; the only difference is the price,
  because a free add-on is legitimate (`price_usdc == 0`) so a race can give something away **and**
  still bound how many. Item names use `create/components/CreatableSelect.tsx`: suggestions are fine, but
  anything typed can be added through the "Add …" row at the bottom of the list.
- `create/lib/addons.ts` — the add-on model, **pure**, outside the components. `run.ts` needs `addOnUnits` to
  plan its signatures, and importing that from a step would drag client components, a file picker and
  the wallet SDK into a module that only counts jerseys. **Stock is per size**: the contract holds one
  quota per add-on, so `EVENT_JERSEY_M` is its own row, and that is the only way "size M is sold out"
  can be true. Its `Symbol` code is **derived** from the name plus the size rather than typed, but it
  is still **displayed** on the item's row, under "Saved as": nobody types it and the result is
  permanent.
- `create/components/DocumentFallback.tsx` — rendered only after a publish fails.
- `create/components/FileField.tsx` — the poster and waiver. Uploads when a file
  is chosen. Its `ACCEPTED` mirrors `be/src/files/content-type.ts`; **SVG is deliberately absent and
  must not be added** (that is script in our own origin, not an image).

Form validation has two classes that appear at different times (`modules/organiser/create/lib/missing.ts`):
`missingDetails` (empty fields) waits for Continue, `incoherentDates` (two dates that contradict each
other) appears immediately. An empty field is not necessarily wrong; contradictory dates certainly
are.

### `/` — the poster-first directory (2026-09-11)

`modules/directory/`. Design: `docs/superpowers/specs/2026-09-11-directory-redesign-design.md`.
What is settled:

- **Posters come from each event's document**, read by `useEventDocuments`. An unproven document
  contributes nothing: no poster, no venue, no province.
- **The poster frame is 16:9 and never crops** (`PosterFrame`). The poster is shown whole over a
  blurred copy of itself, because posters carry their own date and venue as text. No poster, a
  failed hash, or a broken image all say **"No image"** (Ancung chose that over a decorative
  placeholder: a missing picture should read as missing).
- **Featured** = `Open`, upcoming, has a poster, soonest first, at most three, with the races in the
  chosen place taken first (`pickFeatured(entries, nowS, { place })`). Chosen once every document
  has answered, so the row does not reshuffle.
- **The browser asks where the visitor is, once, on the first client render** (Revision 4,
  2026-09-12, which reverses the "no geolocation" line in Revisions 2 and 3). There is no button and
  no prompt of our own: `modules/directory/hooks/useNearbyPrompt.ts` calls `navigator.geolocation.getCurrentPosition`
  from an effect when, and only when, no place is saved **and** the stored `asked` flag is false.
  The flag is written **before** the answer, because a dismissed prompt calls neither callback, and
  a browser blocks an origin that keeps asking. Allowed, the coordinates are stored and the list is
  ordered by real distance (`utils/geo.ts`, `haversineKm`, computed locally, nothing sent anywhere).
  Refused, dismissed, unavailable or timed out, **nothing on screen changes**: no banner, no error,
  no second ask, and the manual picker still works. `navigator.geolocation` is missing in a
  non-secure context and in some embedded browsers, so it is guarded, and the request carries a
  timeout so a device that never answers does not leave it pending. There is no per-card distance
  yet. The effect writes only to the store, never `setState`, which is what keeps the React Compiler
  lint quiet.
- **`lib/place/area.ts` holds one key for two modes.** `sterun.area` stores `{ place, asked }`, where
  `place` is a discriminated union: `{ mode: "area", countryCode, country, province? }` or
  `{ mode: "nearby", lat, lng }`. A union rather than optional fields, because a record carrying
  both a province and a pin has no single answer to "what does the button say". The shape stored
  before the prompt existed, the bare area at the top level, is **still read**, so a visitor who
  picked a province does not lose it; coordinates out of range are not read back, since a swapped
  pair would order the list from Antarctica. Clearing the place keeps the flag, or the prompt would
  reappear for somebody who has just chosen "All locations".
- **The coordinates are named, not shown as numbers** (`nearestProvince` in `lib/place/places.ts`). The
  places data keeps one point per province, so the browser's answer is matched to the nearest and
  stored as an ordinary chosen place: the header reads "DI Yogyakarta, Indonesia" and the ordering
  code needs no special case. The list is imported inside the success callback, so a visitor who
  refuses never downloads it. "Near you" is left for a point with no province near it. Matching one
  point per province is not a geocoder: it answers a province, never a street.
- **The location control sorts the page, it does not filter it** (Revision 3, which overrides
  Revision 2): "All locations" by default, or a country with an optional province, picked by the
  visitor and stored in `localStorage` under `sterun.area` (`lib/place/area.ts`). Every race stays on the
  page; the ones in the chosen place come first (`sortByPlace(entries, place, order, nowS)`, which is
  `sortByDate` with the in-place races moved to the front **of each half**, upcoming and already run,
  each group keeping its date order), and the featured row prefers them. Coordinates take the same
  shape one level down: inside each half the races are nearest first, and a race whose document
  carries no `lat`/`lng` follows in the date order it already had, never with a guessed distance.
  The place is the inner sort key, never the outer one: applied to the whole list it would put last year's Yogyakarta race above
  next week's Jakarta race, and "can I still enter this?" outranks "is it near me?". Filtering was
  the Revision 2 rule and it was wrong on a directory this small: it hid most of the registry behind
  a choice made once in a browser, and a visitor in a quiet province got an empty page. Searching a
  province name still narrows the list. `province` is optional; absent means the whole country, which
  the dialog offers as the first province option, "All of {country}". `inArea` matches by province
  rather than city, and compares country codes case-insensitively. A country-only place also matches
  a race whose document names that country but gives no province. The form is `React.lazy`: the
  places dataset is 176 KB and the directory must not load it up front, so the button's label comes
  from `placeLabel` in `lib/place/area.ts`, which imports nothing.
- **One list, no separate area row.** Its heading is "All races", and "{n} races match" once a
  search or filter narrows it. There is no "No races in {place} yet" state and no **See all
  locations** button: a place hides nothing, so a place with no races of its own simply lists
  everywhere else. For the same reason the list never waits on documents (it used to, so a filtered
  list would not grow as they arrived): only the order changes as they land. Grid: 2 columns from `sm`, 3 from `lg`, 4 from `xl`, for the
  list and the skeleton alike.
- **Filters** live in a staged drawer: Sort by ("Nearest date first" / "Furthest date first"),
  Price, Distance, and Availability ("Hide full and closed races", which hides races that are not
  `Open` or have no places left). There is no location group: the place is chosen in the header,
  and a second location control could only disagree with it. Price and distance are matched on the
  same category; price buckets are fixed, not a slider. Labels use "to", never a dash
  (`ui-rules.test.ts`).
- **Documents are read once per distinct `(uri, metadata_hash)`** (`useEventDocuments`), not once
  per event: several testnet events share one document, and one query per event produced duplicate
  React Query keys. That is worse than a warning: `useQueries` matches its observers by key, so one
  event's slot could receive another event's result.
- **`metadataQuery` in `hooks/useEventMetadata.ts` is the shared query definition** for the event
  page and the directory, so both read the same cache entry and opening a race after browsing does
  not fetch or hash its document again. `fetchEventMetadata` gives up after `METADATA_TIMEOUT_MS`
  (8 s) so one dead host cannot hold the featured row back.
- **Featured cards are full-bleed** (Revision 2, `FeaturedCard`): no white body, the poster frame
  fills the whole card, and the text sits in `paper` over an `ink` fade along the bottom. **The fade
  is one layer, the text block itself, and it runs out inside its own top padding**
  (`from-ink/95 via-ink/85 via-65% to-transparent` over `pt-16`, `pt-12` on a side card), so the
  upper part of every card is untouched poster while the text still never sits on bare poster: the
  title's first line lands at about 85% ink (10:1 against `paper`) and its caps at about 60% (4.3:1),
  even over a pure white poster. It used to be two layers with the whole block floored at 70% ink,
  which read as a grey sheet over most of the card. `EventCard` is the
  list card only and keeps its white body; the two share the lines from `browse.ts`, not a variant.
  Lead: hero title, venue, date, entries left, price. **Side cards are compact**: title, date and
  entries left.
- **The featured row's shape follows how many races it has.** Stacked below `lg`, 4:3 on phones and
  16:9 from `sm`. From `lg`, three races make a 3 by 2 grid — the lead spans two columns and both
  rows at 16:9, and each side card takes one row, dropping its own ratio to fill it. **Two races are
  two equal columns**, both 16:9, the lead keeping the lead's contents but not a size the other
  cannot match: one card towering over its only neighbour read as a mistake, not as emphasis. One
  race alone takes the full width at `21/9`. Only `FeaturedEvents` knows the count, so every `lg`
  class comes from it through `className`; the card itself only knows 4:3 and 16:9. The cards set
  `min-h-min` because `overflow-hidden` switches off the aspect ratio's grow-to-fit-content rule.
- **A long race name shrinks the title one step** (`featuredTitleClass`, unit-tested) rather than
  scrolling or wrapping past the two lines it is clamped to: a marquee is hard to read and moves on
  every visit. Lead `text-5xl` down to `text-4xl`, side `text-xl` down to `text-lg`, with the
  thresholds measured from the real names on the **narrowest** card of each size, so the step-down is
  never late. **Never below `text-4xl` on the lead**: `heading-hero` is Big Shoulders and
  `tokens.css` only allows it at 48px and above. The two-race row also passes the lead
  `compact`, which takes the hero title to `text-4xl` **from `lg`**: half a row wide, `text-5xl`
  makes the text block taller than the card, `min-h-min` grows the card to fit it, and the poster
  vanishes under the fade. A layout fact the card cannot see has to be told to it, and `className`
  cannot carry this one, because the size is a class on the heading rather than on the card.
- **The card `<Link>` is the card surface**, so `globals.css` restores `--radius-lg` on
  `[data-slot="event-card"]:focus-visible`; otherwise the global focus rule in `tokens.css` squares
  its corners.
- **A `SearchableSelect` inside a Dialog must be `modal`** (the area picker does this), or the
  Dialog's scroll lock stops its list from scrolling by wheel or touch.
- All decisions are pure functions in `browse.ts` and `filters.ts`. Test those, not the page.

### Who renders the site header (2026-09-13)

**`app/layout.tsx` renders no `<Header />` and no `<main>`.** It holds `<html>`, `<body>` and
`<Providers>` and nothing else. The chrome is chosen one level down, by the route group:

| Group | Chrome | Routes |
| --- | --- | --- |
| `app/(browse)/layout.tsx` | `SiteFrame` (header + `<main>`) | `/`, `/events/[id]`, `/preview/done` |
| `app/(organiser)/org/new/layout.tsx` | `SiteFrame` + `WalletGate` | `/org/new` |
| `app/(organiser)/org/(console)/layout.tsx` | `ConsoleFrame` (rail or connect screen), **no header** | `/org`, `/org/events/[id]` |
| `app/not-found.tsx` | `SiteFrame` | a URL matching no route at all |
| `app/(browse)/not-found.tsx` | none of its own, the group layout has it | `notFound()` from a public page |
| `app/(organiser)/org/(console)/not-found.tsx` | none of its own, the console layout has it | `notFound()` from a console page |

**A 404 needs one file per boundary, and they are not the same file.** Next renders the CLOSEST
`not-found.tsx`, inside that segment's layouts. A URL matching no route lands at the ROOT boundary,
which is in none of the groups, so once the header moved down into them a 404 had no chrome at all:
no header, no `<main>`, no link back, on the one page somebody reaches entirely by accident. Hence
`app/not-found.tsx` with `SiteFrame`. But `notFound()` from `/events/[id]` lands **inside**
`(browse)/layout.tsx`, which has already drawn the header, and the root page there printed the
lockup and the `<main>` twice. Measured in a browser at `/events/banana`, not guessed. So
`(browse)` has its own, with no `SiteFrame`, and both render
`components/layout/NotFoundMessage.tsx` so the sentence is written once. The rule for anything
added later, including `error.tsx`: **a boundary file supplies the chrome only if its own layouts
do not.** A console route that ever calls `notFound()` will need one in the `(console)` group under
the same rule.

The reason is a bug you could only see in a browser: the console's rail carries the wordmark and the
wallet chip, so with a global header above it a person on `/org` read "STERUN" twice inside about
sixty pixels and their own address twice. A root layout can only say "every page", so the decision
moved to where the pages can disagree.

`components/layout/SiteFrame.tsx` is the header plus the `<main className="flex flex-1 flex-col">`,
shared rather than copied because the two go together: that `<main>` is what lets a page fill the
space the header leaves, and the pair has to stay one thing. A third group wanting site chrome
renders `SiteFrame` too.

**The `(console)` group is what keeps the shell off the wizard.** `/org/new` is six steps that end
in signing; permanent navigation beside it is a way out of a half-finished race at every moment, and
a second one next to the step's own back link. A layout at `org/` would take it along, so the
console's own routes moved into a parenthesised group instead. **No URL changed**, and none may: a
parenthesised segment never appears in the path.

`test/console-chrome.test.tsx` holds the rule. It renders each layout and counts what is on screen,
never a class: one wordmark and one address under the console, a header over the browse pages and
the wizard, no rail beside the wizard.

### The console shell (STE-17)

Everything under `/org` except the wizard sits in `app/(organiser)/org/(console)/layout.tsx`, which
renders `modules/organiser/shared/components/ConsoleFrame.tsx` and nothing else. Six consequences worth
knowing before adding a page there:

- **`ConsoleFrame` draws two frames, and the gate is inside it.** Connected, the rail beside the
  page. Not connected, a bar carrying the wordmark over a `<main>` holding `WalletGate`'s ask. The
  gate used to stand outside the frame in the layout, which put every piece of chrome the console
  owns behind a connected wallet: `/org` with no wallet is the **first screen a new organiser ever
  sees**, and it was a card floating on an empty page with no landmark and no way back to the site.
  It cannot be fixed inside `WalletGate`, which also gates `/org/new`, where a second wordmark
  would sit under the site header. The wordmark itself is `ConsoleWordmark`, one component drawn by
  both frames, so the exit cannot exist in one state and be missing from the other.
- **The gate is the layout's, not the page's, everywhere under `/org`.** `OrganiserHome` used to
  wrap itself in `WalletGate` and no longer does, and neither does `CreateEvent`: the wizard's gate
  moved up to `app/(organiser)/org/new/layout.tsx` when the console group took over the gating for
  its own routes. No page under `/org` may add one. Gating twice means two components deciding
  separately whether the wallet is still restoring, and the second gate is dead code that reads as
  a rule. `CreateEvent.test.tsx` and `OrganiserHome.test.tsx` both render their component inside
  `WalletGate`, so each still tests the tree the route actually builds.
- **A layout rather than a wrapper each page imports**, so the rail survives navigation between
  races: its expander stays open and its scroll position stays put, which is the only reason to have
  a rail rather than a breadcrumb. `ConsoleFrame` exists because the file under `app/` stays a
  server component while the rail needs `useWallet()`, which is the same three-line split every
  route file in this app already uses.
- **The rail is shadcn's `sidebar`** (2026-09-14), not a hand-rolled `<aside>`. The reason is a
  measurement, not tidiness: the old rail was `w-52` at every size, so at 390 by 844 it took 208px
  of a 375px viewport, left the dashboard 167px and pushed the page's `scrollWidth` to 543 so the
  whole thing scrolled sideways. `Sidebar` is `hidden md:block` and becomes a `Sheet` behind
  `SidebarTrigger` below `md`, which is the behaviour that was missing. What the component does NOT
  supply, and what therefore stays hand-written in `ConsoleSidebar`, is all of the behaviour below:
  the expander's open-state rule, the prefix match, the teal marker, and closing the drawer on
  navigation. **Every link in the rail calls `setOpenMobile(false)`**: a navigation drawer left open
  over the page you just asked for reads as "the link did nothing".
- **`ConsoleFrame` deliberately does not use `SidebarInset`.** That component renders the `<main>`
  itself, and the menu button has to sit outside the landmark, for the same reason the rail does: a
  landmark whose navigation you cannot skip is not a landmark. So the page keeps its own `<main>`.
  **There is no phone-width bar above it any more** (Ancung, 2026-09-14): it scrolled away with the
  page. Below `md` the one button that opens the drawer is **Menu**, at the left of the pinned
  `ConsoleHeader`, and the wordmark is inside the drawer it opens.
- **The rail folds from its own header, not from the page's.** Open: the wordmark on the left and a
  menu icon on the right (**Collapse the menu**). Folded: only the mark, covered by an **Expand the
  menu** button that is invisible until pointer or keyboard focus reaches it. The mark stays in the
  DOM under that button, so a keyboard still reaches the public site from a folded rail.
- **The wordmark is the brand lockup**, `public/brand/logo/sterun-lockup-white.svg` through
  `next/image`, not the letters STERUN set in a typeface. White because the rail is `ink`. Its link
  carries no `aria-label`, so its accessible name is the image's `alt`, "Sterun". That must stay
  different from the site header's "Sterun home": `console-chrome.test.tsx` proves no site header is
  drawn over the console by looking for that exact name. The mark appears twice in the DOM when a
  wallet is connected, once per breakpoint, and never twice on screen, so no test counts it.
- **The rail has two items and the second is an expander**, not a page: **Races** opens into this
  wallet's races (`useEvents()` filtered by organiser, so no extra read). There is deliberately no
  "all races" page behind it, because the dashboard is that list. Anything race-scoped, entries,
  scanners, results, belongs inside a race at `/org/events/[id]`, never in the rail. A failed chain
  read empties the expander and nothing else: the rail is navigation, and a node that will not
  answer must not take away the way back. **The expander follows the path on every render**
  (`open ?? pathname.startsWith("/org/events/")`, with `open` starting as `null`), rather than
  seeding `useState` once: the rail is in a layout precisely so that it does NOT remount between
  console pages, so a seed is read on a hard load and never again, and clicking a race from the
  dashboard left Events shut while marking a row that was not on screen. A hand on the expander
  wins from then on. **A race's row is marked by prefix**, `pathname === href` or
  `pathname.startsWith(href + "/")` (`marksRace`), because entries, scanners and results are tabs
  under the race and an exact match would silently mark nothing on any of them. **Dashboard stays
  an exact match**: a prefix there lights it up on the wizard and inside every race.
- **The rail is one screen tall and pinned, not as tall as the page.** `Sidebar` does this itself
  now (`fixed inset-y-0 h-svh`), where the hand-rolled version said `sticky top-0 h-dvh self-start`.
  The wallet chip is in `SidebarFooter`, which does not scroll, while the races scroll in
  `SidebarContent`: on a rail that grows with the page the bottom is wherever the page ends, and at
  900px the chip was already below the fold. A wallet you have to scroll to find is a wallet you
  cannot check before you sign.
- **The wordmark carries the only way out of the console**, in both frames: with no site header over
  these pages, without it there is no route back to the public app but the address bar.
  `ConsoleFrame` puts the page in a `<main>` and leaves the rail outside it, so the navigation is
  skippable, which is the one thing a landmark is for.
- **`ConsoleHeader` is every console page's top bar**: a title, an optional status badge, an
  optional bell, and **one** action. One, not a row: each tab inside a race has exactly one thing to
  do, and keeping it in the bar rather than under the content means it does not travel down the page
  as a table grows. The page owns the header, the layout owns the rail. **The header is pinned**
  (`sticky top-0`, Ancung 2026-09-14), so the title, the bell and the action stay in reach however
  far a page scrolls; a race page pins the header and its tab strip together as one block. Pinning
  works only because nothing between it and the window scrolls: an `overflow` added to
  `ConsoleFrame` or its `<main>` would quietly make it scroll away again.

### `/org` — the events this wallet organises

`modules/organiser/home/OrganiserHome.tsx`. Three things are settled:

- **The data is the directory's own `useEvents()`**, filtered by `event.organiser === address`. The
  registry has no events-by-organiser view (for the same reason it has no list-events view), and
  sharing the query means `/` followed by `/org` asks the chain only once.
- **The allowlist decides the Create event button, not the page.** A wallet removed from the
  allowlist still sees its existing events, because the contract still lets it manage them (STE-36).
  A refused wallet gets `NotAllowedNotice` (a note, not the full-screen `NotAllowlisted`). The button
  is hidden **while** the allowlist is being asked, and still appears when the node fails to answer.
- **It is a dashboard, not a card grid** (2026-09-13, mockup block 0 in
  `docs/superpowers/specs/2026-09-13-org-console-mockup.html`). Three stat cards, a two-column row
  holding **Entries comparison** and **Trending entries**, then one **All races** table, one row a
  race, linking into `/org/events/[id]`. `OrganiserEventCard` is deleted with the grid it was drawn
  for. The reason is the question the page is opened with: *which of my races is behind* is
  comparative, and a grid of cards makes a comparison into a scroll.
- **What is waiting on the organiser lives in the bell, and one case also interrupts.**
  `ConsoleFrame` builds the list once (`modules/organiser/shared/hooks/useNeeds.ts`) and puts it on `NeedsContext`;
  `ConsoleHeader` fills its own `bell` slot from that context, so a console page cannot forget the
  bell. Exactly one need may also reach `UrgentBanner`: a race days away with nobody able to check
  runners in. **If a second kind of thing can reach the banner the rule is already broken** - narrow
  the condition in `needs.ts`, do not change the colour. The count on the bell is drawn only when
  there is something to count, because a badge that is always lit is furniture.
- **A chart with no data draws its frame but no shape** (Ancung, 2026-09-14, reversing the
  no-axes half of this rule). A race nobody has entered still gets a plain grey rule in its table
  row rather than a flat line along the bottom, because a line at zero reads as a measurement. The
  **panels** go the other way: `EntriesComparison` always draws its grid and both axes, and
  `TrendingEntries` always draws its three ruled rows, with the answer laid over the top. The
  earlier rule treated an empty panel and an empty plot as the same thing, and they are not: a
  sentence alone does not say what the panel would have held, so the first entry a race takes
  changes the shape of the page instead of filling in a chart somebody was already reading. What
  must never appear is invented data, a zero line or a list of plausible names. Every division that
  could be by zero is guarded in `modules/organiser/shared/lib/chart.ts`, where a test can see it, rather than
  in a component: **an SVG path containing `NaN` does not throw**, the browser silently drops it,
  and the panel renders empty with nothing in the console.
- **The comparison chart is titled "Entries comparison", never "Pace".** In a running product *pace*
  means minutes per kilometre, so a runner glancing at an organiser's screen would read it as a
  chart about how fast people run. Its x-axis is **days to race day** and its y-axis is a
  **percentage of quota**, both labelled on the chart, because two races months apart cannot be
  compared on calendar dates and 240 places is not 500 places. A finished race is the benchmark,
  dashed and grey; live races stop where they are today with a dot rather than running to the
  right-hand edge.
- **Panel titles are plain nouns** and the explanatory sentence that used to sit under one is gone.
  The caption on the right of a panel header (`Percent of quota`, `Last 7 days`) is `text-n-500`,
  not teal: nothing is behind it, and in this app teal means actionable.
- **`useNowSeconds()` is `bigint | undefined`.** Its server snapshot is `undefined`, so the first
  render has no clock at all. Anything that would call a race overdue, or ask the index about a race
  because of how close it is, has to guard that.
- The per-distance breakdown moved into the race's own page. A dashboard row answers "is this one
  behind", and a race with four distances would be four lines tall in a table meant for comparing
  races.

### `/org/events/[id]` — one race (STE-17)

`modules/organiser/race/RaceConsole.tsx`. Plan:
`docs/superpowers/plans/2026-09-13-org-event-console-tabs.md`. What is settled:

- **Three tabs, Overview, Entries, Scanners, and the tab is in the address** (`?tab=`, parsed by
  `race-tab.ts`, which has no `"use client"` because the route imports it). The bell already links to
  `?tab=scanners`, and the rail lives in a layout that must not remount. **Results is deferred**
  until the backend accepts untimed finishes and DNF rows and there is a way to record many results
  without one signature per runner (STE-44); `?tab=results` opens Overview until then.
- **The race is read fresh with `useEvent`**, not picked out of the dashboard's list, because this is
  the page it is changed from. A race whose organiser is another wallet gets one sentence and a way
  back, never tabs of buttons that would each fail at the wallet prompt.
- **The header's one action is the status move** (`status-action.ts`): open, close or reopen
  entries, always behind a dialog. The dialog for opening states that a race which has opened never
  returns to not open. Completing and cancelling are not offered here.
- **Nothing in the design is cut because the backend does not send it yet.** Per-entry add-ons
  (`addon_ids`, STE-42) and a scanner's `added_at` and `scans` (STE-43) are parsed as optional in
  `modules/organiser/shared/lib/records.ts` and `modules/organiser/shared/lib/scanners.ts`. The column or card that needs one is drawn once the data
  carries it, and not before; nothing is estimated in the meantime.
- **Anything read from the index tells "not answered" from "failed" from "empty"**
  (`useRaceRecordsFailed`). Zero race packs collected on race morning is a finding; a timeout is not.
- **A search that is only digits is a bib, never part of a wallet** (`filterEntries`). Almost every
  address contains a digit, so bib 7 would otherwise list half the race.
- **The Scanners tab keeps what it signed for** until the index catches up, shown as "Just added",
  because the index lags a signature by a poll and a scanner that vanished after being paid for gets
  added twice. The add dialog refuses the organiser's own wallet, an already-listed one and a
  malformed address before any signature.
- **A `beforeEach` that resets a mock needs braces.** `beforeEach(() => mock.mockReset())` returns the
  mock, vitest runs a returned function as teardown, and the mock's rejection then fails the test
  with an error that points at the mock rather than at the cause.

### `/events/[id]/enter` — a runner enters (STE-21, round 1)

`modules/entry/`. Design: `docs/superpowers/specs/2026-09-15-entry-flow-design.md` and its mockup;
plan: `docs/superpowers/plans/2026-09-15-entry-flow.md`. What is settled:

- **Three steps, then a page of its own.** Distance & race pack → Your details → Review & pay, then
  `/events/[id]/entered/[tokenId]`. `EntryForm` reads and gates; `EntryReady` is the form, mounted
  only once everything has answered, so `useEntryAttempt` runs with a real plan below no early
  return.
- **Before the form, this wallet's records are read from chain** (`gate.ts`), never the index:
  `enter` does not stop one wallet entering one race twice, and each entry charges again. An
  existing entry wins over "closed".
- **The race pack and the add-ons are split by price only** (`basket.ts`). Every pack unit is still
  reserved by `enter`, so a sold-out size cannot be picked. Ids are built by walking the basket,
  never the selection. A choice restored from sessionStorage is `sanitizeSelection`ed first.
- **Personal details are never stored.** The distance and pack choice live in sessionStorage; the
  details live in memory. Phones are `react-phone-number-input` in **national** mode, which turns
  `0812…` into `+62812…`; the international mode keeps the zero, a well-formed wrong number, and
  the emergency phone is hashed.
- **Sign and pay is details first, payment second** (`attempt.ts`, a reducer). The vault's answer is
  kept for the attempt, so a retry never resends details; changing the distance, pack or details
  forgets it. No answer is never "it may have gone through": it is a check for a record, and
  `enter` being atomic makes "not found" mean nothing was charged. A failed check can only be
  checked again. The dialog cannot be closed while either runs. **Two approvals, nothing after
  `enter`:** the backend links the vault row to the record from the chain (STE-59), so the web app
  never calls `POST /participants/:id/confirm`. That call needed a third signed message, which
  surfaced as wallet popups over the success page; do not bring it back. **The gates (already entered,
  closed, sold out) decide once, before the form** (`EntryForm`): the landed entry refreshes the
  records while the dialog is still linking, and re-deciding then unmounted the dialog and stranded
  the runner on "You're already entered" instead of their bib.
- **A refused `enter` is explained from the ledger afterwards** (`enter-failure.ts`): closed, no
  places, an item out of units, a short balance. Never from the error code, which the sUSD token
  shares with EventRegistry. A decline or no answer is read from the error and costs no chain read.
- **`PayPanel` checks the sUSD balance before the button is usable**, and shows neither the notice
  nor the balance for a free entry, where no money moves. **Get test sUSD** (testnet only) opens a
  trustline when needed and calls `POST /faucet` (STE-49, `be/src/routes/faucet.ts`, live since
  2026-09-15; every refusal it documents is mapped in `lib/wallet/susd.ts`). As of that day the live API
  reports `faucet.payoutConfigured: false` in `/config`, so the route answers `faucet-unavailable`
  and the button says test sUSD is not available yet, until a faucet key is set on the server. It imports
  `lib/wallet` on press: statically it put Stellar Wallets Kit in every page's header graph.
- **The success page reads the bib, race and distance from chain; the bib name and receipt code from
  this device** (`lib/entry-store.ts`, IndexedDB), which is also what round 2's pass reads offline.
  It sits in the shared `lib/` rather than in the entry module because the pass became its second
  reader (`guides/ARCHITECTURE.md` §4.2).
  Another device gets the bib and a sentence saying where the receipt is. "Back to the race" waits
  for "I've saved my receipt", once: the tick is remembered on the device (`receiptSaved`), so a
  return visit through View my entry shows no box and no confetti, and confetti never fires on a
  device that did not enter. The stored entry is read fresh on every visit and the tick updates the
  page's copy at once; flags are written with idb-keyval `update`, never read-then-save, so two
  landing together cannot undo each other. **The success page never asks the wallet to sign.** An
  entry found by the no-answer check has no transaction hash to link with; STE-59 covers it.
- **The receipt carries no personal details and never the check-in secret** (`receipt.ts`, tested;
  `receipt-pdf.ts` only lays it out, with jspdf loaded on press).
- **Bib numbers are shown exactly as the contract holds them.** Since STE-54 a bib is unique within
  its race and counts from 1; a race created before that upgrade keeps its per-distance numbers from
  0. The distance is never part of the number: it is the label beside it (the bib's tabs).
- **On `/events/[id]`, a connected wallet that already entered gets no way in** (`EventDetail`
  reads its records from chain, `myEntry` on `EventView`). The entry card shows two buttons, **View
  my entry** (the success page) and **Open my pass**, off until round 2 builds `/pass/[tokenId]`
  rather than a link to nothing; Ancung wanted both, as two forms of proof. The Distances tab marks
  the entered distance **Entered** and drops every Enter link and the refund notice; the timeline's
  Enter goes too. No wallet, or a preview, changes nothing.
- **The calendar's month and year dropdowns are shadcn Selects** (`ui/calendar.tsx`, the
  react-day-picker `Dropdown` slot), and **its nav is `pointer-events-none`**: the nav spans the
  caption row and swallowed every click meant for them. jsdom has no layout, so only a browser
  showed it. `DateTimeField` takes `startMonth`/`endMonth` to switch them on.
- Blood type and medical history are not asked for: STE-48 is Axel's decision.

## Tests

```bash
pnpm --filter fe test                      # unit + component, no network
STERUN_E2E=1 pnpm --filter fe test test/e2e  # e2e against live testnet, run by hand
```

The e2e is opt-in so `typescript.yml` still never touches the network. The e2e files run in a **node**
environment rather than jsdom: jsdom installs its own realm's `Uint8Array` as the global, so a
`Buffer` made by stellar-sdk fails `instanceof Uint8Array` in the XDR encoder and every call dies with
`functionName: expected Uint8Array` before it reaches the network. This does not happen in a browser
(stellar-sdk ships a Buffer polyfill that extends the page's own `Uint8Array`).

## What goes wrong on the frontend side

- **The QR pass and the scanner must compute TOTP exactly as the backend does.** Not "similarly".
  Test against `docs/specs/vectors/totp.json`, not against your own implementation. A 6-digit code, a
  30-second step, ±1 step tolerance, constant-time comparison.
- **The scanner PWA works offline.** The roster and the transaction queue have to survive a device
  losing its signal at the start line. The anti-double-race-pack guard is in the contract
  (`AlreadyClaimed` 102), so a queue that drains later is safe — but the UI has to explain that to a
  volunteer rather than showing a raw error.
- **An error code is a `u32` with no contract identity.** Pick the error map from its band:
  `1..=99` → `event-registry`, `100..=199` → `race-record`, `200+` → `NonFungibleTokenError`. An
  `Error(Contract, #4)` out of `enter` is EventRegistry's `EventNotOpen`, not a RaceRecord error.
- **The testnet asset is sUSD, not USDC.** SAC `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU`.
- **PII is never sent to the chain.** The PII form goes to the backend; what reaches the contract is
  only `participant_hash`.
- **Wallets: Stellar Wallets Kit** (Freighter, xBull, Albedo, WalletConnect, Ledger) — the decision in
  `docs/SYSTEM_DESIGN.md` §8. Passkey smart accounts are not in v1's scope.
- **WalletConnect only exists when `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` is set** (a Reown project
  id; put it in `.env.local` and in Vercel's environment). Empty means the option **does not appear**,
  rather than a button that is certain to fail: the relay refuses pairing from an unregistered app.
  There are two shapes, both in `src/lib/wallet/kit.ts`:
  - **An ordinary browser** (desktop or phone) → a `WalletConnect` entry in the kit's picker, pairing
    by QR or a deep link to a wallet on the phone (Freighter mobile, LOBSTR).
  - **Inside the Freighter mobile browser** (`window.stellar` = `{ provider: "freighter", platform:
    "mobile" }`) → the kit is bypassed and `src/lib/wallet/freighter-mobile.ts` pairs directly through
    `UniversalProvider`. The kit's module is subclassed so `isPlatformWrapper()` answers `false`;
    without that, the kit's picker skips itself in that browser and pairs through its own path. The
    pattern is taken from SoroSense, which is proven to work on a phone.
  - The WalletConnect chains are only `stellar:pubnet` and `stellar:testnet`. Any other network means
    WalletConnect is not offered, so nothing signs on the wrong ledger silently.
  - **`@reown/appkit` `1.8.21` and `@walletconnect/universal-provider` `2.23.7` are pinned EXACTLY**,
    matching the versions the kit carries. A caret pulls a newer version, and that means two copies of
    AppKit on one page. Raise them only together with the kit, and check `pnpm-lock.yaml` still holds
    a single `@reown/appkit@` entry.

## Conventions

- **All UI text is in English.** Button labels, headings, error messages, empty states, placeholders
  — all of it. Since 2026-09-10 `.md` documents are English too (the repository is reviewed from
  outside the team), and code comments always were, so this is now one rule rather than three.
- **A hint under a field says only what has to be typed.** Accepted formats, size limits, valid
  shapes. Background and "why this matters" move into a **Tooltip** through
  `components/form/Help.tsx` (the `help` prop on `Field`, `TextAreaField`, `FileField`,
  `DateTimeField`, `DateRangeField`, and `Section` in `StepDetails`). The reason: when every field
  carries a paragraph, reading becomes a decision, and a decision under every field makes people stop
  reading all of them.
  **What must NOT go in a tooltip: a warning that has a cost** (a name cannot be changed, a category
  cannot be deleted, a document cannot be swapped). Those must be visible without hovering — their
  place is a section's `note` or a hint.
- **UI text names the consequence, not the mechanism.** A race organiser does not need the words
  "chain", "contract", "hash", "transaction" or "revert" — they need to know what it means for them.
  "Enforced on chain, entry number 301 reverts" becomes "Entries stop on their own once this many
  people have joined". What must **not** be softened: warnings that have a cost (a name cannot be
  changed, a category cannot be deleted, a detail file cannot be added later) — those stay stated
  plainly.
  **There is no exempt page** (Ancung, 2026-09-11). The public event page used to be one, on the
  grounds that "this document matches the hash on chain" is the very claim this product exists for.
  It was reversed because of who reads it: a runner deciding whether to pay, who cannot check a
  sentence they cannot parse, so the words proved nothing to the person they were aimed at. That tab
  is now **Verification**, and every verdict in it is a plain sentence ("These race details are
  exactly what the organiser published when the race was created"). The material an auditor really
  compares — the two fingerprints and the link to the details file — is still there in full, one
  press away behind a native `<details>` labelled **Show technical details**. The `ChainSource`
  footer, which printed the registry address, the network passphrase and the RPC url under `/` and
  `/events/[id]`, is **deleted**: it was the same claim made to the same reader, with nothing on the
  page to act on it.
  The organiser console and the wizard followed (R5b): a distance's **Code** is a **Short name**,
  stock is "at least 1" rather than "the contract will not take zero", an add-on's permanent code is
  shown under **Saved as**, the way out of a failed publish is **Put the details online yourself**,
  and the receipts on the Done step are headed **Receipts**. What stayed, verbatim, is every warning
  that costs something: the name and the start cannot be changed, a distance cannot be removed, the
  terms cannot be edited, stock cannot be added later.
- **No error reaches the screen as it was thrown** (`src/lib/api/errors.ts`). `friendlyError` is the one
  mapping, pure and unit-tested: a contract revert is matched by band **and** variant (both contracts
  own a `NotInitialized`), a declined prompt reads as a cancellation, and everything else becomes
  "Something went wrong. Please try again." A variant with no sentence of its own falls to that
  fallback on purpose: naming `InvalidDistance` at an organiser helps nobody. **Do not string-match
  an error in a component**, and do not edit `sdk/` to fix wording, since it is published and owned
  elsewhere.
  **A revert is only classified for an SDK method that reaches nothing but our two contracts**
  (`OUR_OWN_METHODS`). An error code is a bare `u32` with no contract identity, so the band is the
  only thing naming the source, and the band is only trustworthy while nothing else in the call can
  revert. `enter` hands control to the sUSD token contract, whose own errors are numbered in the same
  `1..=99` range, so a refusal to move money would otherwise print "This distance is full." The
  entry-time sentences (`QuotaFull`, `EventNotOpen`, `AddOnQuotaFull`) were removed for the same
  reason. STE-21 did not bring them back here: the entry flow says them from the chain's state
  after a refusal (`modules/entry/lib/enter-failure.ts`), which needs no way of telling a token revert
  from ours.
  **A step that stopped without an answer gets its own sentence**, never the generic one: the SDK
  throws distinctly when a transaction went out with no result coming back, and the button under that
  message repeats the step, which for the first step would publish a second race that can never be
  deleted. It reads "This may already have gone through. Please check your races before trying
  again, so you do not create the same one twice." The same guard softens the decline: "Nothing was
  sent" is never printed over text saying something was already submitted.
  **The original error is logged with `console.error` in development only**, at the two catch sites
  that map one (`modules/organiser/create/hooks/useEventRun.ts`, `modules/organiser/create/components/FileField.tsx`). Mapping destroys it
  otherwise, and an organiser who is stuck then has nothing to report but the sentence everybody else
  sees. The guard is `=== "development"` rather than `!== "production"` so test output stays clean.
  What this app writes for the reader itself is thrown as a **`PlainError`**
  (`src/lib/api/plain-error.ts`) and passes through untouched, as does an `ApiError`, whose message
  `lib/api/client.ts` already writes for the screen. `PlainError` lives in a file of its own, with no
  imports, because `lib/wallet/kit.ts` throws one and pulling the whole Stellar SDK into that module
  graph put nearly two seconds on the wallet tests.
  **A wallet error is not always an `Error`.** Stellar Wallets Kit rejects with the wallet's own
  object, `{ error: { code, message } }`, which is why its `parseError` reads `e?.error?.message`
  before `e?.message`. `messageOf` mirrors that order; reading only the outer message turned a
  declined prompt into the generic failure sentence.
- **Every path towards paying must pass a `NonRefundableNotice`** (STE-38, from Axel's decision in
  STE-34). `enter` transfers the fee straight from runner to organiser with no escrow, so the
  contract never holds the money and no refund can be forced by anyone. The text stands directly
  above the button or link that takes money, not in a footer and not in a modal that can be dismissed
  unread. Its current home is `TabCategories`; **`PayPanel` on `/events/[id]/enter` (STE-21) places
  it again** near the signing button. It is shown only when there genuinely is a way in (`Open` and
  slots remaining) — a warning that appears where it does not apply is how warnings stop being read.
- **Event descriptions and Terms are plain text**, rendered with `whitespace-pre-line`. Decided by
  Aulia on 10 Sep 2026, rather than Notion-style rich text. The reasons: the document is hashed, so
  markup means deciding which bytes are hashed and which renderer is correct (two different renderers
  means a reader sees something other than what was signed), and HTML from an organiser's document is
  an XSS surface. If formatting is ever needed, the answer is markdown, not HTML.
- **Never use an em dash (`—`) or en dash (`–`) in UI text.** Split it into two sentences, use a
  comma, or use brackets. If a separator is genuinely needed, use an ordinary hyphen. This ban is
  specific to UI text; code comments and `.md` files are unaffected. `test/ui-rules.test.ts`
  enforces it on **every spelling**, not only the literal character: an escape and an HTML
  entity render the same dash while reading as plain ASCII in the source. That is not
  hypothetical, and the history says where to look: `f824cbd` wrote three em dashes into the
  size chart as escapes, `40edea3` took them out, and `cf907ce` taught the sweep to see that
  spelling at all. Check the removal with
  `git show 40edea3 -- fe/src/modules/event-detail/component/TabAddOns.tsx` (the path the file
  had at that commit).
- **No hex values, font names or raw px in a component** — everything comes from the tokens in
  `app/tokens.css` (Nabil's, STE-7). Those tokens have two copies (`fe/` and `landing-page/`); if you
  change them, change both in one commit.
- Contract addresses come from `docs/deployments.md` through environment variables, not hardcoded in
  several places.
- Testnet RPC `https://soroban-testnet.stellar.org`, passphrase `Test SDF Network ; September 2015`.
- Tests: e2e + edge + positive + negative (the root `CLAUDE.md`). For the payment and scanning flows,
  the negative cases matter most: a full quota, a closed event, a second scan, being offline.
- **Files are grouped by feature** (2026-09-15, `guides/ARCHITECTURE.md` §4.2). Used by one
  feature: it lives in `src/modules/<feature>/` (`components/`, `hooks/`, `lib/`). Used by two or
  more: it moves up to `src/components/`, `src/hooks/` or `src/lib/`, into the folder named for what
  it is for, in the same commit that adds the second user. A module never imports another module's
  `components/`, `hooks/` or `lib/`. Tests sit in `__tests__/` beside the file they test; `test/`
  keeps only setup, e2e and the checks no feature owns.
- Update this file as soon as a decision about the app's structure is made (routing, state, shared
  components).
