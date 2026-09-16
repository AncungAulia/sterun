# Information architecture — web app (`fe/`)

A map of the Sterun web app's pages: which URLs exist, who opens them, what appears there, and where
the data comes from. This document derives from SOW Deliverable 3, `SYSTEM_DESIGN.md` §6a–6e and §7,
and the six `fe/` tickets (STE-8, 13, 17, 21, 22, 24).

**Status: a plan, largely unimplemented.** As of 2026-09-06 `fe/` was still a `create-next-app`
scaffold with one empty page; STE-8 and STE-13 have landed since. Owner: Ancung (flow) + Nabil
(design, STE-12/18/23).

If an implementation diverges from this document, update the document in the same commit — the same
rule as for `SYSTEM_DESIGN.md`.

---

## 1. The axis of division: a network assumption, not an audience

This app is split not by who its users are but by **whether staleness is acceptable**, because that
is what decides the service worker's scope:

- The directory and profiles **must be fresh from the chain**. If they were cached, the "the chain is
  authoritative" claim that is Sterun's whole pitch would no longer be true.
- The QR pass and the scanner **must work fully without a signal** (`SYSTEM_DESIGN.md` §7:
  verification at a venue assumes zero connectivity).

Those two demands are opposed, so no single service worker may own the whole origin. The worker is
`fe/public/offline-sw.js`, registered from the `(offline)` layout once per screen: scoped to
`/pass` on the runner's pass (STE-21 round 2) and to `/scan` on the volunteer's desk (STE-22). Each
registration caches only its own path and the build's assets, so neither ever keeps a race page,
and `fe/test/offline-sw.test.ts` holds that line.

```
fe/app/
  (browse)/                          network-only; the service worker does not touch this
    page.tsx                         /
    events/[eventId]/                /events/:id
    events/[eventId]/enter/          /events/:id/enter
    events/[eventId]/entered/[tokenId]/  /events/:id/entered/:token
    runner/[address]/                /runner/G...
    profile/                         /profile

  (organiser)/                       wallet-gated, online
    org/                             /org
    org/new/                         /org/new
    org/events/[eventId]/            /org/events/:id
    org/events/[eventId]/scanners/   /org/events/:id/scanners
    org/events/[eventId]/results/    /org/events/:id/results

  (offline)/                         the PWA; the service worker is scoped ONLY to this
    pass/[tokenId]/                  /pass/:token
    scan/                            /scan
    scan/[eventId]/                  /scan/:id
    scan/[eventId]/flagged/          /scan/:id/flagged
```

The scanner is deliberately **not** split into its own app or origin for the MVP: the cost (a second
shell, wiring the design tokens twice, a third deployment, rewriting STE-32) is not worth it for a
testnet with a couple of dozen records, and the root `CLAUDE.md` forbids adding a layout folder
without a strong reason.

**The condition for reversing that decision:** the scanner stores the `totp_secret` of *every
participant* in an event in IndexedDB — the most sensitive payload in the system. A single origin
means an XSS on a public page could in theory read it. As soon as the scanner holds a real event's
roster on mainnet, split it onto its own origin (`scan.sterun.xyz`). Because the logic is already
confined to the `(offline)` route group and its own modules, that is a move rather than a rewrite.

---

## 2. Three data constraints that shape this whole IA

Break one and one of Sterun's core claims goes with it. All three decide the contents of pages
below repeatedly, so read them first.

### 2.1 No participant names, for anyone

On chain there is only `participant_hash`. In the backend, `be/src/routes/participants.ts` returns a
summary with no PII and refuses a caller who does not own the row (`403`). **Not even the organiser
can see a list of the names that entered.** The only place a fragment of a name appears is the roster
bundle, and that is authenticated to a scanner's address.

The consequence: no avatars, no name lists, no participant export. What may be shown is numbers
(`entered_count` from the chain), bibs, states, and addresses.

### 2.2 Not CRUD — almost no updates, and no deletes

| Object | Create | Update | Delete |
| --- | --- | --- | --- |
| Event | `create_event` | **status only** (`set_event_status`) | none |
| Category | `add_category` | **none whatsoever** | none |
| Add-on | `add_addon` | **none whatsoever** | none |
| Scanner | `add_scanner` | — | `remove_scanner` |

An event's name, date, `metadata_hash` and `uri`, and everything about a category (code, distance,
quota, price) have **no setter**. A mistyped price is permanent; the only way out is `Closed` and
then a new event.

`Draft` is **not** a draft in the Google Docs sense: it only means entries are not open yet; the
contents are frozen from the first second. So an organiser form must not follow a "fill in → Save →
edit later" pattern, and must have a review step before signing.

The legal status transitions (anything else is `InvalidStatus(11)`, including to itself):

```
Draft  -> Open | Closed | Cancelled        Open      -> Closed | Completed | Cancelled
Closed -> Open | Completed | Cancelled     Completed -> (terminal)
                                           Cancelled -> (terminal)
```

`Cancelled` arrived with the v2 contracts (STE-35). It is not a synonym for `Closed`: `Closed` means
entries are shut while the race still happens and can be reopened; `Cancelled` means the race is off,
and it is terminal.

### 2.3 `create_event` is allowlisted (since STE-36)

**This section said the opposite until 2026-09-10, and the change matters for the console.** Two
gates now apply, answering different questions: `organiser.require_auth()` proves the caller holds
the keypair, and an admin-held allowlist proves that keypair has been vetted. A caller who is not
allowlisted gets `NotAllowlistedOrganiser(18)` — the signature did not change, only when it
succeeds.

What this means for `fe/`:

- **A "create event" form shown to any connected wallet will fail for most of them.** Read
  `is_organiser(address)` first and say so plainly, rather than letting someone fill in a whole
  wizard and meet a revert at the signature. `is_organiser` is a view that never reverts, so this is
  cheap.
- **`is_organiser` is not an enforcer.** It decides what to show. A client that skips it still gets a
  revert, not an event — which is the correct order of responsibility.
- **It is contract-wide and per-address, not per-event.** Per-event authority is still
  `EventData.organiser`, read via `get_organiser(event_id)`. `is_organiser(addr)` does not answer "is
  this the organiser of event X".
- Getting on the allowlist is an off-chain request to the admin; there is no self-service page, and
  §8 explains why there should not be one.

Transparency is still part of the answer rather than a replacement for it: show the organiser's
address as it is, plus how many events they have created and how many reached `Completed`.

---

## 3. Public pages — no wallet

| URL | Shows | Data source | Ticket |
| --- | --- | --- | --- |
| `/` | Poster-first directory (redesigned 2026-09-11, spec `docs/superpowers/specs/2026-09-11-directory-redesign-design.md`, Revision 4): one list of every race, sorted by the place chosen at the top left ("All locations" by default, or a country with an optional province, saved in the visitor's browser). On the first render the browser's own location prompt is raised once, and once only: allowed, the list is ordered by real distance and the control reads "Near you"; refused or ignored, the page is exactly what it would be for somebody never asked. The place sorts, it does not filter: races in it come first, within "still to come" and within "already run" rather than across them, and the featured row of `Open`, upcoming races with a poster prefers them, but nothing is hidden. The list is headed "All races", or "{n} races match" once a search or filter narrows it. Every race is a card with its poster in a 16:9 frame (shown whole, never cropped; "No image" without one), venue, date, entries left and starting price, up to 4 columns wide. Search, plus a filter drawer: one sort, by date, and three filters, by price, by distance, and one that hides full and closed races. Loading + empty + error states. | the chain (RPC) for the races, plus each event's verified metadata document for poster and location | STE-13 |
| `/events/[id]` | see §3.1 | the chain + the metadata document | STE-13 |
| `/runner/[address]` | Race history per row: event, category, bib, state, finish time, transaction link. An identity-check block. An empty state. Paginated at 20. | the chain (truth), the indexer (to enrich event metadata) | STE-24 |

`/runner/[address]` is the page the SOW calls *"the part no ticketing platform produces"*. It must
open from a bare link: no login, no wallet, no account.

The identity-check block works with the runner's consent: they enter their name + national ID +
emergency contact + salt receipt, the **hash is computed locally in the browser** per
`docs/specs/HASH_AND_TOTP.md`, and then `verify(token_id, hash)` is called. The PII is not sent to any
server, ours included.

### 3.1 `/events/[id]` — event detail

Layout: the poster on the left, a summary card on the right, tabs below.

**The right-hand card** holds the date, title, location, status badge, the number of entrants (a
number only, no avatars — §2.1), and **the categories as selectable rows**:

```
5K     sUSD 15   120 of 300 left   [ Enter ]
10K    sUSD 25     8 of 200 left   [ Enter ]
Half   sUSD 40   FULL              [   —   ]
```

Categories must not be collapsed into one line of text with a single Enter button: **entry is always
per category**, and each has its own price, quota and remaining quota. Remaining quota is the only
scarcity the contract genuinely enforces (`reserve_slot` reverts with `QuotaFull(5)`, checking and
incrementing in one invocation), so that number is honest and worth featuring.

The page for a `Closed`/`Completed`/`Cancelled` event must still exist — it is the destination of
links from a runner's profile. The Enter button is replaced by a statement of status.

**`Closed` and `Cancelled` must never look alike.** Since STE-36 the contract carries a real
`Cancelled` status (`Draft`/`Open`/`Closed` → `Cancelled`, terminal), and the two say opposite things
to a runner holding a paid entry:

| Status | What it means | How the page says it |
| --- | --- | --- |
| `Closed` | Entries are shut. **The race is still happening.** | Neutral badge, "Registration closed" |
| `Cancelled` | **The race is not happening.** Terminal — it cannot reopen. | Visually distinct badge, "Race cancelled" |

A `Cancelled` event shows **no Enter button at all**, not a disabled one: `reserve_slot` already
refuses it with `EventNotOpen(4)`, and a button that leads nowhere invites the click anyway. Before
STE-36 the two states were displayed the same because only one of them existed; that is no longer
true and the page must stop implying it.

**The entry fee is not refundable, and the page says so before the money moves.** `enter` transfers
the fee **straight from the runner to the organiser** (`race_record/src/lib.rs`) — no escrow, so the
contract never holds the money and cannot return it. Any refund is the organiser sending it back by
hand. The decision (STE-34) is that this is acceptable for the MVP **only if it is stated up front**,
so the copy sits above the Enter button, not in a footer and not behind a modal:

> Pendaftaran non-refundable. Kalau event diundur/dipindah, panitia mengumumkan lewat pengumuman
> bertanda tangan. Refund (kalau ada) adalah kebijakan sukarela panitia, di luar kontrak, dan tidak
> bisa dipaksakan oleh protokol.

An organiser may add their own voluntary-refund promise alongside it; that promise is theirs, and the
page must not present it as something Sterun enforces. Implementation: STE-38.

Prices on chain are `i128` with 7 decimals; the page displays them in human form.

**Tabs: not built in STE-13.** The v1 detail page is a single column, not tabs. Both reasons are
about content rather than layout: **People** needs `/runner/G...` pages to link to and that is
STE-24, while **Timeline** needs phase dates that live in the metadata document — and no event on
testnet actually served its document (every `uri` pointed at `sterun.xyz`, which was not serving
those files). Three tabs with two of them empty is worse than one page that states what it knows.
The tabs go in at STE-24, when People has content.

The tab design still stands and is written down here so it does not get designed twice:

- **Overview** — the description from the metadata document. The eventual home of the route map (§6).
- **Timeline** — three phases, each carrying a live count from the chain, because those phases are
  exactly the contract's state machine:

  | Phase | Record state |
  | --- | --- |
  | Registration | `Entered` |
  | Race pack collection | `RacepackClaimed` |
  | Race day | `Finished` / `DNF` |

  ```
  ● Registration            1-20 Sep    312 entered
  ● Race pack collection    27 Sep      180 collected
  ○ Race day                28 Sep      not started
  ```

  **The dates bind nothing.** The chain has only `starts_at`; the dates for opening and closing
  entries and for race pack collection live in the metadata document. What actually locks entries is
  `EventStatus`, changed by hand by the organiser. So the two roles are separated: **dates are
  schedule information; the "you are here" marker comes from chain state**. The Registration phase is
  marked active when `EventStatus == Open`, not when today happens to fall between two dates. The
  page never claims something the contract does not guarantee.

- **People** — bib, category, state, and a clickable address to `/runner/G...`. No names (§2.1).
  This tab closes the verification loop: from an event, a person can jump to a runner's history and
  check it themselves. Data from `GET /events/:id/records`.

**Posters and metadata integrity.** Since the file endpoint landed (`POST /events/files`), the
organiser uploads a poster and gets back a content-addressed URL rather than hosting it themselves —
see §5.1. Because `EventData` stores both `metadata_hash` **and** `uri`, this page downloads the
document, recomputes its hash, and can show that the poster, location, schedule and route have not
changed since the event was created.

### 3.2 What is on a profile page

`/runner/[address]` and `/profile` are the same page; the only difference is whether the address
comes from the URL or from the connected wallet. The two names are deliberately not merged:
`/runner/G...` is what gets sent to other people and its URL already explains itself, while
`/profile` reads as one's own.

**An identicon, not a photo.** Runners have no profile photo (there is no upload endpoint for one,
and storing photographs of people would be a new class of PII — §2.1). What is used is a
**deterministic identicon computed from the address**: a unique pattern per address, consistent
across pages, computed in the browser so it still appears offline, with zero storage and zero
backend. Do not use a remote avatar service (gravatar and the like) — that leaks who is looking at
whose profile to a third party, and dies as soon as the signal does.

**Statistics, all derived from data already fetched.** `GET /runners/:address/records` returns
`state`, `finish_time_s`, `category_id` and `event_id` per record; the category data (`distance_m`) is
already fetched in order to show the event name. From that:

| Number | Computed from |
| --- | --- |
| races | the number of records |
| total distance | the sum of each record's category `distance_m` |
| finishes | records in state `Finished` |
| PB per distance | the smallest `finish_time_s` per `distance_m` |

```
[identicon]  GABC…7XQ2

   4 races       42.2 km        3 finished

   PB 5K  22:41        PB 10K  48:03
```

What separates this from an ordinary running app: **every number links to its transaction.** "42.2
km" is not a figure we recorded in our own database; it is the sum of four records each of which
anyone else can check on an explorer. That is the SOW's sentence — *"a race history that belongs to
the runner and that anyone can verify against the chain"* — in a form that is pleasant to look at.

A poster thumbnail on each history row is free as well: the poster is already in the metadata document
that gets downloaded for the event page anyway.

**The order of work:** a correct history table and a working verify block first. The identicon,
statistics and thumbnails are a layer on top — not the foundation, and STE-24 is the last ticket.

---

## 4. Entrant pages — wallet connected

| URL | Shows | Ticket |
| --- | --- | --- |
| `/events/[id]/enter` | Three steps: distance & race pack → details → review & pay, then **one button with two wallet approvals behind it** (a signed message for the vault, then `enter`). Built in STE-21 round 1; design in `superpowers/specs/2026-09-15-entry-flow-design.md` | STE-21 |
| `/events/[id]/entered/[tokenId]` | The success page: the bib drawn as a bib, the **receipt code** with a PDF download, and a way on held until the receipt is saved | STE-21 |
| `/pass/[tokenId]` | A QR and a 6-character code regenerated every 30 seconds on the phone, the bib, the race, the state. Installable, and loadable with the network off. Built in STE-21 round 2; design in `superpowers/specs/2026-09-16-qr-pass-design.md` | STE-21 |
| `/profile` | My races + a shortcut to each pass. Thin: its contents are `/runner/[my-address]` (§3.2) | STE-24 |

**The success screen is its own page, not a modal.** The salt receipt appears exactly once in its
life; if it is lost, the identity check at `/runner/[address]` is dead forever for that record. This
screen must not be dismissable by accident.

The `totp_secret` is stored in the runner's device IndexedDB and never touches the chain.

**Errors that must have their own presentation**, not a raw alert: `QuotaFull(5)`, `EventNotOpen(4)`,
insufficient sUSD balance, and the user declining to sign. Plus one slippery case: **the PII was
submitted but `enter` failed** — the user has to be able to retry without submitting again.

How STE-21 settled both (2026-09-15; `fe/CLAUDE.md`, the entry flow):

- **No idempotency key was needed.** The vault's answer (hash, salt, secret) is kept for the whole
  attempt, so a retry pays with it and never submits again; only editing the details does. The
  backend links a row to its record from the chain (STE-59), so entering takes two approvals and
  no confirm call; rows that never get a record are swept (STE-50).
- **`enter`'s refusals are explained from the chain, not the code.** An error code is a `u32` with no
  contract identity, and `enter` calls the sUSD token, whose errors share EventRegistry's `1..=99`
  band. So after a refusal the page re-reads the race, the distance, the add-on stock and the
  balance, and says what is now true. For calls that reach only our contracts, pick the map from
  the band as before: `1..=99` EventRegistry, `100..=199` RaceRecord, `200+` OZ.
- **No answer is a check, never a guess.** The page looks for a record of this wallet in the race;
  `enter` is atomic, so none found means nothing was charged.

---

## 5. Organiser and volunteer pages

### 5.1 Organiser (organiser wallet) — STE-17

| URL | Shows |
| --- | --- |
| `/org` | The events I created (queried by address), an empty state, a create-event button |
| `/org/new` | A 3-step wizard: **Details → Distances → Review** (review is what signs everything) |
| `/org/events/[id]` | Quota filled per category (live from the chain), status controls, counts per state, an **anonymous** roster: bib, category, state, `token_id` |
| `/org/events/[id]/scanners` | The active scanner list, add/remove an address |
| `/org/events/[id]/results` | Upload a CSV (bib_no, finish_time) → preview + anomalies → submit a batch of `recordFinish`/`recordDnf` |

There is no Edit or Delete button anywhere (§2.2), and no participant names (§2.1).

**There are many signatures and the number cannot be reduced**: one to publish the detail file, one
`create_event`, one per category, one to open entries. An organiser with 3 categories is asked to
approve 6 times. One transaction may only call one contract function, the contract has no batch entry
point, and `add_category` needs an `event_id` that only exists once `create_event` has landed.

What **can** be improved is the surprise, and that decided the wizard's shape (STE-17, 8 Sep 2026):

- **Three steps, not six.** The old six mapped the transactions one to one — publish, create, add,
  open — when transactions are how we deliver, not what an organiser does. The organiser's job is only
  two things: describe the race, then approve its cost.
- **The "Details file" step became a Review step.** It used to be a raw JSON dump plus a Publish
  button. That asks people to check something they cannot check, and asks them to know there is a
  "file" — that is our plumbing. Review shows the race as a race: dates, city, distances with their
  start times. **The raw file is still one click away behind a toggle**, because the sha256 of those
  bytes is what goes on chain, and someone who wants to check our claim has to be able to see it.
- **The list of signatures is shown BEFORE the first one is requested**, then ticked off one by one
  as it proceeds. Six popups nobody mentioned feel like a retry loop; six popups already written out
  as a numbered list feel like work that has an end.
- **Stopping halfway is safe and resumable.** What has landed cannot be undone, so a screen that
  resets would lie about what is on the chain. The button becomes "Carry on" and resumes from the
  first step that has not landed.
- **The document escape hatches (self-host / no document) only appear after a publish fails.** `uri`
  is an ordinary string on chain and the contract does not care who hosts it, so our backend being
  down must not also stop events being created. But that is not a choice worth putting in front of
  someone who does not currently have a problem.

The price and quota fields need a permanent warning, because they cannot be corrected.

**Posters and waivers are uploaded rather than having their URL pasted** (`POST /events/files`,
accepting images and PDFs, 5 MB max). Two reasons: telling an organiser to host it themselves is the
step most likely to make the wizard go unused, and a file somewhere else can be **swapped** after
people have entered — exactly the fraud this product exists to close. What the store returns is
content-addressed, so the poster and waiver freeze along with the document that names them. The
upload runs **when the file is chosen**, not at the end: the endpoint needs a signature, and stacking
those at the end means a run of popups at the least welcome moment.

The console must not submit CSV rows that failed the preview. An action by a non-organiser wallet
must produce a readable message, not a crash.

### 5.2 Volunteer (a scanner keypair, distinct from the organiser) — STE-22

| URL | Shows |
| --- | --- |
| `/scan` | Choose an event, download the roster bundle + an on-chain state snapshot. Needs to be online, once |
| `/scan/[id]` | Camera + a **GREEN/RED verdict in under 2 seconds**, manual input (6-digit code + bib), a banner if the device clock has drifted, a queue indicator |
| `/scan/[id]/claims` | The race packs this phone handed over: waiting, sending one at a time with one wallet approval each, and done with the ledger it landed in. Sending starts on a tap |
| `/scan/[id]/flagged` | Claims that reverted with `AlreadyClaimed(102)` — another desk won. For reconciliation, rather than disappearing quietly |

The organiser can scan their own race: `claim_racepack` accepts the event's organiser **or** an
address on the `is_scanner` allowlist (`sc/contracts/race_record/src/lib.rs`), and the roster
route lets the same two in. This section used to say the opposite; the contract was checked on
2026-09-16. `/scan` therefore lists a race for a wallet that organises it or is allowlisted for it.

TOTP verification happens locally with ±1 step tolerance; claims are queued in IndexedDB and sent
when connectivity returns.

---

## 6. The event metadata document

Read by `/events/[id]` (STE-13), written by the console (STE-17) — two tickets both belonging to
Ancung, so the agreement is in one pair of hands. Hashed into `metadata_hash` at `create_event`,
hosted at `uri`.

```json
{
  "poster_url": "https://...",
  "location": { "name": "GBK, Jakarta", "lat": -6.218, "lng": 106.802 },
  "route_geojson": { "type": "LineString", "coordinates": [] },
  "schedule": [
    { "phase": "registration", "starts_at": "2026-09-01T00:00+07:00", "ends_at": "2026-09-20T23:59+07:00" },
    { "phase": "racepack", "starts_at": "2026-09-27T09:00+07:00", "ends_at": "2026-09-27T17:00+07:00", "venue": "Hall A" },
    { "phase": "race_day", "gun_start": "2026-09-28T05:30+07:00", "cut_off": "2026-09-28T11:00+07:00" }
  ],
  "description": "...",
  "waiver_url": "https://..."
}
```

- **The `racepack` phase stores a range of days plus daily hours**, not one continuous window.
  `starts_at` / `ends_at` remain (the first day's opening time, the last day's closing time) so
  existing readers do not change meaning, plus `daily_opens` / `daily_closes`.
  The reason: "opens 1 August 09:00, closes 9 August 21:00" literally means the desk is staffed
  overnight from the 2nd to the 8th. Race pack collection is humans sitting at a desk, and they go
  home. **Registration deliberately stays one continuous window** — an online form genuinely does not
  close overnight. The two shapes differ because the things differ.
- **Start times and cut-offs belong to each category**, not to the event. One morning can have a 5K
  starting at 06:00 and a half marathon at 05:00; the contract has no field for that, so it lives in
  the document (`categories[].start_time` / `.cut_off`). What goes on chain as `starts_at` is the
  **earliest wave**, because an event has only one timestamp while a race has several.
  The ordering consequence in the console: categories have to be filled in **before** the document is
  built, because the document is hashed by `create_event`, which runs before `add_category`.
- **`links`**: `{ instagram, website }`. Real races live on Instagram — route changes, weather,
  results — so an event page without a link there loses the outbound link people click most. What is
  stored is the **handle**, not a URL: Instagram has changed its URL shape before, and this document
  can never be edited. The console still accepts a pasted profile URL and extracts the handle itself.
  A useful side effect: these links are hashed too, so **the account named when the event was created
  cannot quietly be swapped** for another after people have entered.
- **Coordinates arrive through a pasted Google Maps link, not a country/province/city dropdown.**
  The console extracts `lat`/`lng` from the URL — no API, no key, no rate limit. It reads the
  **pinned place** first (`!3d<lat>!4d<lng>` in the `data=` part, decoded first so a percent-encoded
  link is not missed), then an explicit `?q=`/`ll=`/`daddr=`, then a bare pair, and only then
  `@-6.2185,106.8026`: the numbers after `@` are the centre of the map *view*, which moves with
  panning and zooming, so they sit tens of metres from what the organiser actually pinned. A cascade
  of three dropdowns answers nobody's question (what people want is **a pin they can open**), and a
  geocoding API (Nominatim is free and keyless) adds a network dependency plus an attribution
  obligation to a form field. Short links (`maps.app.goo.gl`) do not carry coordinates until
  followed, and following one from a browser is blocked cross-origin — the console says so plainly
  at paste time, rather than after the event is frozen, and it says so a third way when a link
  yielded only the map view. What is stored is **the two numbers**, not the URL: links go stale,
  coordinates do not.
- The `racepack` phase may carry `venue_lat` / `venue_lng` under the same rule. `venue` stays a string
  so STE-13's reader does not change meaning.
- **`cut_off` is a time**, the last moment a finish still counts — and **the contract does not enforce
  it at all**. `record_finish` accepts whatever time the organiser sends. The page and the form must
  present it as information, not as a rule.
- **`metadata_hash` = the sha256 of exactly the bytes served at `uri`.** No canonicalisation, no key
  ordering rule, no re-serialisation. Anyone can check it with `curl` + `sha256sum`, and there is no
  "canonical form" two implementations could read differently. The cost is real and deliberate:
  re-uploading the same document with different whitespace breaks the check forever, because events
  are frozen (§2.2). Established in STE-13 (`fe/src/lib/event/metadata.ts`) and used by STE-17 when it
  writes the document.
- A document that fails its hash check is **not displayed at all**, rather than displayed with a
  warning. Content that cannot be proven remains unproven however it is labelled.
- `gun_start` **must equal** `starts_at` on chain. If they differ, the page shows a warning — one of
  them is certainly wrong.
- `route_geojson` has its place reserved even though the map comes later, so an organiser does not
  have to recreate an event just to add a route.
- **This document is frozen too** (§2.2): if a race is postponed, its schedule cannot be corrected.
  What happens instead is §6.1 — the document is never edited, an announcement is added beside it.

The route map (optional, §8): render the GeoJSON with **Leaflet + OpenStreetMap tiles** — no API key,
no billing. Mapbox and Google both demand a credit card for something that can be free. Because the
route is hashed too, a route cannot be quietly changed after people have entered.

### 6.1 Announcements — how a frozen event still tells the truth about change

Races are postponed for rain, lose a permit, or move venue. That is normal, not an edge case, and the
document above cannot be corrected. **The answer is not to make it editable.** If an organiser could
rewrite the schedule after people paid, that is precisely the fraud this product exists to close —
the freeze is a feature for the runner, not an oversight.

So the document is never touched. An **announcement** is added beside it (STE-34).

```json
{
  "event_id": 17,
  "published_at": "2026-09-20T14:05+07:00",
  "body": "Karena izin venue, start dipindah ke Lapangan Banteng. Jadwal tetap.",
  "signer": "GBQB...O2OR",
  "signature": "base64..."
}
```

Four rules, and each one is doing work:

- **Append-only. No edit, no delete.** A correction is a *new* announcement. A record of change that
  can itself be changed proves nothing.
- **Signed by the organiser's wallet**, using the same wallet-signature scheme the API already uses
  for organiser routes. The server verifies it against `get_organiser(event_id)` **read from the
  chain**, not from its own database — authority comes from the authoritative copy.
- **Anyone can re-verify it without trusting us.** The signature plus the on-chain organiser address
  are enough; the server is a convenience, not the source of truth.
- **The original document stays visible.** The page renders it first, then the announcements below it,
  newest first, each with its date. A runner sees both halves: **what they were promised when they
  paid, and what changed since.** Neither replaces the other.

**What the chain does and does not do here.** It stores no announcement and verifies no signature. It
supplies exactly one thing — *who the organiser is* — and that is the anchor the whole scheme hangs
from. Say that plainly rather than implying the announcement is "on chain".

**Three changes must be paired with an announcement**, because each alters something a runner already
paid against:

| Change | Why it needs saying |
| --- | --- |
| Schedule or venue moved | The frozen document now disagrees with reality |
| Registration close date moved later (STE-45) | The date on the page is no longer the date enforced |
| Quota raised after a sell-out (STE-55) | The field size the runner signed up to has grown |

**The contract cannot enforce this pairing.** `set_registration_closes` and `increase_quota` only
check that the caller is the event's organiser. So the rule lives in the console: make each of these
**one flow that includes the announcement**, never two buttons where the second can be skipped. This
is an app-level promise, and the documentation should not dress it up as a protocol guarantee.

Implementation: `be/` endpoint in STE-40, `fe/` rendering in the same ticket's follow-up.

**As built (STE-40).** `POST /events/:eventId/announcements` takes `{ published_at, body, signer,
signature }` and `GET` returns them newest first, each with the exact signed `message`. What the wallet
signs is not the JSON above but this text, so it can be rebuilt byte for byte by anyone:

```
Sterun announcement v1
network: <network passphrase>
event_registry: <EventRegistry contract id>
event_id: <u32>
published_at: <YYYY-MM-DDTHH:MM:SS.sssZ>
body_sha256: <sha256 of the UTF-8 body, lowercase hex>
```

`published_at` is UTC in exactly that spelling, and the server refuses one more than 10 minutes from its
own clock. `@sterunxyz/sdk` exports `announcementMessage` to build the text for the wallet and
`verifyAnnouncement` to check one; the organiser to compare the signer against comes from
`getEvent(eventId).organiser`, on chain. Full rules: `be/CLAUDE.md`, "Signed event announcements".

**Not in scope, deliberately:** refunds. The contract never holds the entry fee (§3.1), so no
announcement can move money. An organiser who chooses to refund does it by hand, and the page says so.

---

## 7. Build order

None of the `fe/` tickets are blocked: the SDK (STE-15) and the backend (STE-16, STE-20) are Done.

```
STE-8   shell + wallet connect        <- the foundation; everything sits on it
  └─ STE-13  directory + detail       <- the entrance to every flow
       └─ STE-17  organiser console   <- creates events to test against
            └─ STE-21  entry + pass   <- only now are there entrants
                 └─ STE-22  scanner   <- needs scanners registered by STE-17
                      └─ STE-24  profile
```

This order is more than Linear's `blockedBy`: each step **produces the data needed to test the next**.
Without the console there is no event to enter; without entry there is no QR to scan.

Due dates (per Linear): STE-13 17 Sep · STE-17 25 Sep · STE-21 and STE-22 29 Sep · STE-24 1 Oct.

---

## 8. Deliberately not built

| Not built | Why |
| --- | --- |
| A "become an organiser" signup page, KYC/KYB, an admin approval panel | The allowlist that arrived in STE-36 is a contract-level gate the admin operates; a self-service page would either be theatre (anyone can request) or a claim we cannot verify. Access is requested off-chain. KYC also collides with the "PII stays off-chain" story and needs a legal entity that does not exist yet. Still recorded as post-pilot. |
| `org.` and `admin.` subdomains | `admin.` has no function. `org.` is expensive and a trap: **wallet connections do not travel across origins**, so an organiser who also runs would have to connect twice. The SOW also puts domains out of scope ("dev/test deployment only"). `sterun.xyz` (landing) and `app.sterun.xyz` (web app) are already reflected as `landing-page/` and `fe/`, which genuinely are two deployments. |
| Participant avatars, name lists, participant export | The data never exists (§2.1) |
| Edit / delete buttons for events and categories | The functions do not exist in the contract (§2.2) |
| The route map | Possible and cheap (Leaflet + OSM, §6), but it is on no ticket and no grant reviewer scores it. Do it after STE-24, or hand it to Nabil as polish. If it happens, it is the star of the 3-minute demo video. |
| Runner usernames / display names | Not merely a matter of cost (a new table, a new endpoint, proof of address ownership, duplicates and squatting with no admin to arbitrate). The main reason: a username is **an identity claim nobody verified, attached to a page whose entire purpose is proving something** — nothing stops a person naming themselves "Eliud Kipchoge". Once one line on that page cannot be proven, the doubt spreads to the lines that are true. The verified identity already exists in the identity-check block: anonymous by default, provable with the runner's consent. |
| Profile photos | There is no upload endpoint for them, and storing photographs of people is a new class of PII. Replaced by a deterministic identicon (§3.2) |
| Profile handles / profile claiming | Post-pilot; routing uses the raw address `/runner/G...` |
