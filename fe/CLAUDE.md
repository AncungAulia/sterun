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
src/components/elements/  <- our product components, built ON TOP OF ui/
src/components/layouts/   <- page structure
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
  time.

### The variants we added ourselves

`ui/badge.tsx` gains `success`, `warning`, `accent` and `muted` — shadcn ships none of those four,
and this app needs them: an event is `Open` or it is not, a document matches its hash or it cannot be
read. All of them are built from Nabil's tokens like every other variant, so the palette stays one.

`muted` exists because `secondary` maps to `n-100`, one step from the page's own colour, so a chip
using it reads as an outline chip that lost its outline. That was noticed from a **screenshot**, not
from a test: `Draft` and `Closed` looked identical on screen while meaning opposite directions in
time. See the header of `elements/EventStatusBadge.tsx`.

`ui/tabs.tsx` is also ours (the event page is built on it).

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

- `src/lib/sterun.ts` — `readClient`, **read-only**. Every SDK view is a simulation, so public pages
  work without a wallet. A test fails if this file ever imports a wallet.
- `src/lib/events.ts` — `listEvents` / `getEventSummary`. The registry has no "list events" (a view
  returning an unbounded vector kills itself the moment the protocol succeeds), so the list is
  assembled from `event_count` + `get_event` per id, in parallel.
- `src/lib/metadata.ts` — download the document at `uri`, hash its bytes with sha256, compare against
  `metadata_hash`. **The convention: `metadata_hash` = the sha256 of exactly the bytes served**, with
  no canonicalisation. STE-17 writes its documents under the same rule.
- `src/hooks/useEvents.ts` + `useEventMetadata.ts` — React Query on top of both.

## The organiser console: the wizard's shape (STE-17)

`/org/new` is **6 steps**: Details → Distances → Terms → Add-ons → Review → Done. The rule is
unchanged and has not softened: **do not add a step that merely maps one transaction** (the reasoning
is in `docs/WEB_APP_IA.md` §5.1 and in the header of `modules/organiser/CreateEvent.tsx`). The three
that were added are not that:

- **Terms** — one text field, zero transactions. Its contents go into the event document, so they
  are covered by `metadata_hash`: the race's rules become frozen and provable.
- **Add-ons** — one step, but **many** transactions (one per size), so it is the opposite of what is
  forbidden.
- **Done** — zero transactions. A completion screen, with a receipt for each signature. `Done` is
  **derived** from `run.isComplete` rather than `setStep`: the run owns the fact that it finished,
  and storing that fact again as a second piece of state is two sources of truth for one thing.

- `modules/organiser/run.ts` — the list of signatures (pure, no React). Its order is forced: the
  document is hashed by `create_event`, so it has to be online first; `add_category` needs an
  `event_id`.
- `hooks/useEventRun.ts` — what executes that list. It stops at the step that failed, what has landed
  stays recorded, and calling `start()` again resumes from what has not. **The loop holds a local copy
  of `landed`**, because `setState` only takes effect on the next render and the loop finishes within
  one.
- `component/StepReview.tsx` — **a preview of the real event page**: it draws
  `modules/event-detail/EventView.tsx`, the same component as `/events/[id]`, filled by
  `modules/organiser/preview.ts` from what the run is about to sign. Its document is read through
  `readEventDocument` (the same parser the public page uses), so what the page does not read does not
  appear in the preview either. **Do not write another bespoke review summary**: the old version did,
  and it drifted silently (the description lost its line breaks while the public page kept them).
  **The preview draws no Enter button at all**, neither on the right-hand card, nor on a distance
  card, nor in the timeline (`EventView preview` → an empty `onEnter` + `offerEntry={false}`): the
  event does not exist yet, and a link out of the wizard throws away everything typed. The raw file
  and its fingerprint move to the preview's **Verification** tab. The **Create event** button sits at the
  bottom right like every other step, and opens a **Dialog** holding the **whole run**: the list of
  signatures, their ticks, their failures, and the way out. Starting it is a second press. The dialog
  cannot be closed while it runs, and closes itself when it finishes.
- **There is no "create the event without a document".** There used to be, and it was a trap: what it
  produced was not an emergency event but a permanently broken one (a page with no poster, location
  or schedule, forever — the hash is committed by `create_event` and there is no `update_event`),
  offered exactly when someone was already frustrated. If publishing fails there is one way out:
  **host the file yourself**, which still produces a whole event.
- `component/StepAddOns.tsx` — the race pack's contents, in **two lists**: what is included with the
  ticket, and what is sold on top. Both are written to the chain; the only difference is the price,
  because a free add-on is legitimate (`price_usdc == 0`) so a race can give something away **and**
  still bound how many. Item names use `elements/CreatableSelect.tsx`: suggestions are fine, but
  anything typed can be added through the "Add …" row at the bottom of the list.
- `addons.ts` — the add-on model, **pure**, outside the components. `run.ts` needs `addOnUnits` to
  plan its signatures, and importing that from a step would drag client components, a file picker and
  the wallet SDK into a module that only counts jerseys. **Stock is per size**: the contract holds one
  quota per add-on, so `EVENT_JERSEY_M` is its own row, and that is the only way "size M is sold out"
  can be true. Its `Symbol` code is **derived** from the name plus the size rather than typed, but it
  is still **displayed** on the item's row: nobody types it and the result is permanent.
- `component/DocumentFallback.tsx` — rendered only after a publish fails.
- `component/FileField.tsx` (in `components/elements/`) — the poster and waiver. Uploads when a file
  is chosen. Its `ACCEPTED` mirrors `be/src/files/content-type.ts`; **SVG is deliberately absent and
  must not be added** (that is script in our own origin, not an image).

Form validation has two classes that appear at different times (`modules/organiser/missing.ts`):
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
- **The location control sorts the page, it does not filter it** (Revision 3, which overrides
  Revision 2): "All locations" by default, or a country with an optional province, picked by the
  visitor and stored in `localStorage` under `sterun.area` (`lib/area.ts`). Every race stays on the
  page; the ones in the chosen place come first (`sortByPlace(entries, place, order, nowS)`, which is
  `sortByDate` with the in-place races moved to the front **of each half**, upcoming and already run,
  each group keeping its date order), and the featured row prefers them. The place is the inner sort
  key, never the outer one: applied to the whole list it would put last year's Yogyakarta race above
  next week's Jakarta race, and "can I still enter this?" outranks "is it near me?". Filtering was
  the Revision 2 rule and it was wrong on a directory this small: it hid most of the registry behind
  a choice made once in a browser, and a visitor in a quiet province got an empty page. Searching a
  province name still narrows the list. `province` is optional; absent means the whole country, which
  the dialog offers as the first province option, "All of {country}". `inArea` matches by province
  rather than city, and compares country codes case-insensitively. A country-only place also matches
  a race whose document names that country but gives no province. The form is `React.lazy`: the
  places dataset is 176 KB and the directory must not load it up front, so the button's label comes
  from `placeLabel` in `lib/area.ts`, which imports nothing.
- **One list, no separate area row.** Its heading is "All races", and "{n} races match" once a
  search or filter narrows it. There is no "No races in {place} yet" state and no **See all
  locations** button: a place hides nothing, so a place with no races of its own simply lists
  everywhere else. For the same reason the list never waits on documents (it used to, so a filtered
  list would not grow as they arrived): only the order changes as they land. Under the heading, while
  a place is chosen and neither the search nor a filter narrows the list, one muted line reads "Races
  in {place} first" (`placeLabel`): an order is invisible on a page of races nobody knows, so without
  it the control reads as doing nothing. A search takes the line away, because it would then claim an
  order the visitor can no longer check. Grid: 2 columns from `sm`, 3 from `lg`, 4 from `xl`, for the
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

### `/org` — the events this wallet organises

`modules/organiser/OrganiserHome.tsx`. Three things are settled:

- **The data is the directory's own `useEvents()`**, filtered by `event.organiser === address`. The
  registry has no events-by-organiser view (for the same reason it has no list-events view), and
  sharing the query means `/` followed by `/org` asks the chain only once.
- **The allowlist decides the Create event button, not the page.** A wallet removed from the
  allowlist still sees its existing events, because the contract still lets it manage them (STE-36).
  A refused wallet gets `NotAllowedNotice` (a note, not the full-screen `NotAllowlisted`). The button
  is hidden **while** the allowlist is being asked, and still appears when the node fails to answer.
- **The card is not the directory's `EventCard`.** An organiser needs "how many entered out of the
  quota" per distance, sold-out ones included, not price and places left. For now it links to
  `/events/[id]`, because `/org/events/[id]` (scanner, results) is not built yet.

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
  There are two shapes, both in `src/lib/wallet.ts`:
  - **An ordinary browser** (desktop or phone) → a `WalletConnect` entry in the kit's picker, pairing
    by QR or a deep link to a wallet on the phone (Freighter mobile, LOBSTR).
  - **Inside the Freighter mobile browser** (`window.stellar` = `{ provider: "freighter", platform:
    "mobile" }`) → the kit is bypassed and `src/lib/freighter-mobile.ts` pairs directly through
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
  `components/elements/Help.tsx` (the `help` prop on `Field`, `TextAreaField`, `FileField`,
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
- **Every path towards paying must pass a `NonRefundableNotice`** (STE-38, from Axel's decision in
  STE-34). `enter` transfers the fee straight from runner to organiser with no escrow, so the
  contract never holds the money and no refund can be forced by anyone. The text stands directly
  above the button or link that takes money, not in a footer and not in a modal that can be dismissed
  unread. Its current home is `TabCategories`; **the `/events/[id]/enter` page in STE-21 must place
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
  entity render the same dash while reading as plain ASCII in the source, and three of those
  survived a green suite in the size chart.
- **No hex values, font names or raw px in a component** — everything comes from the tokens in
  `app/tokens.css` (Nabil's, STE-7). Those tokens have two copies (`fe/` and `landing-page/`); if you
  change them, change both in one commit.
- Contract addresses come from `docs/deployments.md` through environment variables, not hardcoded in
  several places.
- Testnet RPC `https://soroban-testnet.stellar.org`, passphrase `Test SDF Network ; September 2015`.
- Tests: e2e + edge + positive + negative (the root `CLAUDE.md`). For the payment and scanning flows,
  the negative cases matter most: a full quota, a closed event, a second scan, being offline.
- Update this file as soon as a decision about the app's structure is made (routing, state, shared
  components).
