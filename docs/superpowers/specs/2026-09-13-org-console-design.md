# Organiser console — design

**Date:** 2026-09-13 · **Owner:** Ancung (`fe/`) · **Ticket:** STE-17 (remaining work)
**Mockup:** [`2026-09-13-org-console-mockup.html`](2026-09-13-org-console-mockup.html) — open it in a
browser; every screen below is drawn there.

## What this is

`/org` today is a flat page: a header and a grid of cards, one per race. Everything STE-17 still owes
— the per-event dashboard, scanner management, results upload — has nowhere to live in it. This
design gives those a home and rebuilds the landing page around a question the card grid cannot
answer.

It is `fe/` work only. Two small backend items fall out of it and are listed at the end; neither
blocks the rest.

## Shape

```
/org                     Dashboard    what needs me today
/org/events/[id]         one race     Overview · Entries · Scanners · Results
/org/new                 the wizard   unchanged
```

A dark sidebar carries two items: **Dashboard**, and **Events** as an expander listing the wallet's
races by name. Events is only an expander — there is no separate "all races" page, because the
Dashboard already lists them.

**Why a sidebar at all**, when an earlier pass argued against one: the console has more than two
destinations once each race has four tabs of its own, and the sidebar is what lets somebody jump
between races without going back through a list. What it must not become is a menu of sections that
all silently mean "of which race?" — everything race-scoped stays inside the race.

## Dashboard

Four blocks, in this order, and the order is the design:

1. **"N things need you"** — the list of what is waiting, each row with the button that fixes it.
   Time-critical rows get an amber icon and an amber button; everything else is neutral. One
   coloured row out of three is what makes it read as urgent — if all three shout, none does.
   - a race that runs in days with no scanner registered → **Add a scanner**
   - a race whose entries are not open → **Open entries**
   - a race that finished with no results → **Upload results**
2. **Your races** — name, date, days to go, status, a 14-day sparkline, a fill bar and the count.
3. **Pace** — the cross-race comparison, described below.
4. A slim strip of three totals at the bottom: races published, entries, received.

The totals sit last on purpose. They are the only numbers on the page nobody can act on.

**Pace** is the one chart here that earns its place. Its x-axis counts **days to race day**, not
calendar dates, so races that ran months apart lie on top of each other; its y-axis is **percent of
quota**, because 240 places and 500 places are not the same race. A finished race is drawn as a
dashed grey line and is the organiser's only honest benchmark — their own last race. The live races
stop where they are now.

That is what no table on the page can say: *88 of 300 with three days to go, where your last race
was at 94% at the same point.*

## One race: four tabs

### Overview

- Three stat cards: **Entries** (of quota), **Payments received** (of a sell-out), **Race packs
  collected** (of entries). Each carries a thin bar under the number instead of a sentence.
- **Distances** — concentric half rings, one per distance, key beside them.
- **Activity** — the last few things that happened, read off the chain: who entered, who collected a
  race pack, who finished. All icons one colour; the glyph carries the meaning, which leaves amber
  free for a row that ever does need attention.
- **Entries per day** — a smooth area chart with gridlines and a hover marker.
- **Add-ons** — one row per add-on, `reserved / quota`, with a **Sold out** tag in the same amber a
  full distance uses.

**On the half rings.** The `design-dashboards` skill is against them: *avoid radial gauges and
meters; they consume space and usually encode little more than a compact linear display.* That is
correct — on the rings each arc curves at its own radius, so the shortest one has the least distance
to travel and looks fuller than it is, and the numbers in the key are doing the real work. The
mockup keeps a bar version side by side (block 7). **Ancung chose the rings knowing this**, and it is
her call; the bars remain one CSS swap away.

**On the add-ons panel.** It is not "Jersey sizes". `AddOnData` stores a `code`, a `quota` and a
`reserved_count` and knows nothing about jerseys, so a tumbler or a finisher medal is the same kind
of row. The `code` is whatever the organiser typed in the wizard, so the console displays it as
typed — if it should always look tidy, the wizard is where that gets enforced, not here.

### Entries

Three cards (entries, race packs still to hand out, add-ons to hand out), then a toolbar **outside**
the card, then a card holding nothing but the table.

Columns: **Wallet · Bib · Distance · Entered · Status · Add-ons**.

**Search is by bib number or wallet, never by name.** Runner names are encrypted in the vault and
this page never holds them. That is the product working as designed, and it will still surprise an
organiser used to another platform, so the placeholder says so plainly rather than offering a
"Search runners" box that quietly fails.

Two filters: distance and status. Both neutral — no highlighted "active filter" state.

### Scanners

Same shape as Entries and deliberately smaller: search, one **Add scanner** button, and a table.
No stat cards; three numbers about three rows would be furniture.

Columns: **Wallet (in full) · Added at · Scanned · Remove**.

Add scanner opens a dialog with one field. Its confirm button reads **Sign and add**, not Save,
because registering a scanner is a transaction the organiser signs — a button that promises a save
and then raises a wallet has already misled somebody. The dialog says which address to paste: the
scanning phone's, not the organiser's, which is the mistake that only shows up on race morning.

The **Scanned** column needs a backend addition; see below.

### Results

Two states.

**No file:** the dashed drop card, nothing else.

**File loaded:** three cards — *finished with a time*, *finished, no time*, *did not finish* — then
a toolbar with search, **Choose another file** and **Remove CSV**, then the table. The signing button
moves into the page header, where every tab keeps its one main action, and reads **Sign and record N
results**.

`finish_time_s == None` renders as **"No official time"** and never as `0` (STE-41). A fun run with
nine untimed finishers is a normal file, not an error, which is why it gets a card of its own.

A third state exists in the mockup that nobody asked for and can be dropped: an amber strip for
**rows naming a bib this race does not have**. A timing file built from a different spreadsheet will
have them, and without the strip they vanish silently between the file and the chain. It appears
only when the count is above zero, and the signing button's count drops to match.

## On a phone

390px is where this console is used on race morning. The sidebar folds into a button, the tabs
scroll sideways and stay visible — Scanners is the tab somebody opens standing at the gate — and
every panel goes full width. The half rings keep their key underneath rather than beside them.

## Copy rules

Panel titles are plain nouns: **Distances**, **Activity**, **Entries per day**, **Add-ons**,
**Pace**, **Scanners**, **Results**. The explanatory line that used to sit under each one is gone;
it described how the thing worked, which is what `fe/CLAUDE.md` already forbids.

Table headers are sentence case on a tinted band, not uppercase. The column is **Status**, not
State.

## "Draft" leaves the interface

The contract's `EventStatus::Draft` is frozen in `docs/specs/INTERFACE.md` and does not change. What
changes is what a person sees:

- Everywhere in `fe/`, `Draft` renders as **"Not open yet"**. "Draft" is a word about documents, and
  a race is not a document.
- **A race that is not open is hidden from the public directory entirely.** It is visible there
  today: only the hero (`browse.ts:122`) and the "hide full races" filter (`filters.ts:77`) check the
  status, so a half-built race is publicly listed right now. That is a bug this design closes.
- Its `/events/[id]` page still resolves — the data is public on chain either way — so an organiser
  can share a preview link.

**There is no "save as draft" feature.** An event only reaches the chain when the wizard's signing
run starts, and by then `name`, `starts_at`, `metadata_hash` and `uri` are permanent. Offering to
"save a draft" of something already frozen would be a lie.

What is worth doing is not a feature at all: **the wizard should not lose its answers on refresh.**
Today a refresh mid-run empties the form and can leave an event stranded on chain with no way to
open it from the UI. Keeping the run's progress is a bug fix, adds no button and no new word, and
the Dashboard's "Open entries" row is what rescues anything already stranded.

Allowed transitions, from the contract: `Draft → Open | Closed | Cancelled`, `Open → Closed |
Completed | Cancelled`, `Closed → Open | Completed | Cancelled`. **There is no way back to Draft** —
once entries open they cannot be un-opened, only closed.

## Where the data comes from

Available today, no backend change:

| Shown | Source |
| --- | --- |
| Status, quota, entered count, prices | EventRegistry over RPC |
| Add-on code, quota, reserved count | `get_addon` / `listAddOns` |
| Payments received | `Σ entered × price` + `Σ reserved × add-on price` |
| Scanner list | `get_scanners` / `/events/:id/scanners` |
| Entries per day, Pace, sparklines | indexer `entered_at` on `/events/:id/records` |
| Activity feed | indexer `record_transitions` (`to_state`, `occurred_at`) |
| Results table | indexer `state`, `finish_time_s`, `result_at` |

Needs backend work, and neither blocks this design:

1. **Scans per scanner.** `RacepackClaimed { token_id, event_id, operator }` carries the scanner
   address and the indexer already stores every event payload in `chain_events`, so the count is a
   sum away. No endpoint exposes it. Soroban RPC only retains events for days, so this cannot be
   read from the chain directly — it has to come from the index. Small ticket.
2. **Entry form fields.** Gender and date of birth are not in the vault, so no demographic panel can
   exist. Raised separately; see below.

## Out of scope, raised separately

**The entry form's field set** (a ticket for Axel/James, to be decided *before* STE-21 builds the
form). From an actual Indonesian race registration Ancung completed, the fields asked for were:
name, ID type **and** number, email, WhatsApp, gender, bib name, insurance, medical conditions, age,
city, emergency contact name **and** number, blood type, plus add-ons.

Against what Sterun stores today — `name`, `national_id`, `emergency_contact`, encrypted, plus the
salt and TOTP secret — the gaps that matter:

- **Email and WhatsApp.** Not for notifications: an event is frozen, and the agreed answer to a
  postponed race is a dated announcement (STE-34). An announcement that reaches nobody is not an
  announcement, and Sterun currently has **no way at all** to contact somebody who has paid.
- **Gender and date of birth.** Podiums are split by both. Store the date of birth, never the age:
  a record is permanent and an age is not, so the age group is worked out on race day.
- **ID type.** `norm_id` ASCII-uppercases, so a passport number already hashes fine — but the
  document *type* is stored nowhere, so a runner who registered with a KTP and arrives with a
  passport produces a hash mismatch nobody can explain.
- **Emergency contact** is one field today and is two in practice, and it is inside
  `participant_hash`, so the combined form has to be settled before anyone enters.
- **Blood type and medical conditions** are health data. They belong in the race-day roster the
  medic carries, **not** as a dashboard statistic and not in a page left open on a laptop. Indonesia's
  UU PDP 27/2022 appears to treat health data as a stricter category; that needs checking before any
  of it is collected, and is a reason to decide deliberately rather than by adding a column.

None of these change `participant_hash`, which stays `SHA-256(name, national_id, emergency_contact,
salt)`. Adding vault columns does not touch the frozen spec.

## Decisions taken, not to be reopened

- Sidebar with Dashboard + an Events expander; no separate race-list page.
- Four tabs per race, in this order: Overview, Entries, Scanners, Results.
- Half rings for Distances (bars available, and documented above as the trade-off).
- Add-ons panel is generic, never jersey-specific.
- Toolbars sit outside the card; a table card holds only its table, edge to edge.
- Filters are neutral; no active-filter colour.
- `Draft` shows as "Not open yet" and is hidden from the public directory.
- No "save as draft"; wizard progress is a bug fix, not a feature.
- Search never claims to search runner names.
