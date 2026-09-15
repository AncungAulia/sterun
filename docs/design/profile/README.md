# Runner profile (STE-23)

The design handoff for the public page a runner's whole history lives on: `/runner/<address>`
(STE-24). Written to be implemented from, without asking a question per screen.

| What | Where |
| --- | --- |
| The screens | [`mockups/index.html`](mockups/index.html), openable in a browser, no build step |
| One PNG per screen | [`exports/`](exports/): `p1` to `p12` |
| The whole board as one image | [`exports/board.png`](exports/board.png) |
| The rules these screens obey | `docs/specs/INTERFACE.md` §2.2 and §2.4, `docs/specs/HASH_AND_TOTP.md` §2 and §3 (both FROZEN) |
| The screens that come before this one | [`../race-day/README.md`](../race-day/README.md) (STE-18) |

The mockups are plain HTML and CSS. Every colour, size, radius, shadow and duration is a token from
`mockups/tokens.css`, which is **generated** from `landing-page/app/tokens.css`. There is not one
invented hex or pixel value in the file. Regenerate after a token change:

```bash
python docs/design/tools/gen_tokens_css.py                    # every mockups/tokens.css
node docs/design/tools/export-mockups.cjs docs/design/profile/mockups/index.html
```

The exporter needs `puppeteer-core` and a local Chrome; that is why the PNGs are committed. Reading
the design must never depend on being able to run a tool.

---

## 1. What the design is not allowed to change

These come from the frozen spec and from decisions already shipped. A screen that breaks one of them
is wrong, however good it looks.

| Rule | Where it comes from |
| --- | --- |
| No wallet, no login, no account. The page is readable by anyone with the URL | STE-24 |
| `Finished` with `finish_time_s: None` means **finished, no official time**. Never render it as `0` | `INTERFACE.md` §2.2, STE-41 |
| `Dnf` reached from `Entered` is a no-show; reached from `RacepackClaimed` it is a runner who started. `claimed_at` is what separates them | `INTERFACE.md` §2.2 lifecycle |
| A result is never rewritten. An untimed finish cannot later gain a time | `INTERFACE.md` §2.4 |
| The bib is unique within its event and counts from 1, but events created before STE-54 keep per-distance numbers starting at 0 | root `CLAUDE.md`, STE-53 and STE-54 |
| `participant_hash` is SHA-256 over three normalised fields and a 32 byte salt, with exactly three `0x00` separators | `HASH_AND_TOTP.md` §3.1 |
| The salt never leaves the runner. It is not on chain, not in a QR, not in a log | `HASH_AND_TOTP.md` §3.3 and §6.2 |
| `norm_name` does **no case folding**. Capitalisation is part of a name | `HASH_AND_TOTP.md` §2.3 |
| `records_of` and `verify` never revert. An empty history is `[]`, an unknown token is `false` | `INTERFACE.md` §2.1 |

## 2. Screen inventory

**The page**

| # | Screen | What it is for |
| --- | --- | --- |
| P1 | `/runner/<address>` at 390px | the whole page on a phone, three records |
| P2 | the same at 1100px | the two timestamps folded in, and where the data came from |

**One record, seven ways**

| # | Screen | What it is for |
| --- | --- | --- |
| P3 | every state a record can be in | four chain states, seven things they mean to a runner |

**Proving a record belongs to a person**

| # | Screen | What it is for |
| --- | --- | --- |
| P4 | closed | the default on every card |
| P5 | open, empty | four fields, each with the rule that decides the answer |
| P6 | filled in | the hash forming on screen before anything is sent |
| P7 | it matches | what was proven, and nothing more |
| P8 | it does not match | the two likely causes, in the order they happen |

**When there is nothing to list**

| # | Screen | What it is for |
| --- | --- | --- |
| P9 | no records | the address is real, it has never entered a race |
| P10 | not an address | caught in the browser, before any call |
| P11 | the chain is unreachable | we could not look, which is not the same as nothing |
| P12 | loading | labels first, values after |

## 3. Four states, seven meanings

This is the section to read twice. The contract has four states. A runner reading this page
experiences seven different things, and two of the pairs are indistinguishable in the state field
alone.

| What the page says | State on chain | How to tell |
| --- | --- | --- |
| Entered | `Entered` | |
| Race pack collected | `RacepackClaimed` | |
| Finished, with a time | `Finished` | `finish_time_s: Some(t)` |
| **Finished, no official time** | `Finished` | `finish_time_s: None` |
| **Did not finish** | `Dnf` | `claimed_at: Some(…)` |
| **Did not start** | `Dnf` | `claimed_at: None` |
| Race cancelled | any, usually `Entered` | the **event** is `Cancelled`, not the record |

**Why the bold rows matter.**

`Finished` with no time is a real outcome, added in STE-41 for a runner who crossed the line at a
race with no chip timing. The value slot reads **No official time** in the same position a time
would sit, so a reader scanning the column still lands in the right place. The trap is that
`RecordFinished` carries a plain `u32` and a consumer that assumes a time will read the absent one
as `0`, publishing a zero second race. Root `CLAUDE.md` says it plainly, and so does this design.

`Dnf` is two different stories. A runner who never collected a race pack never started, and calling
that "did not finish" is an accusation about a race they were not at. A runner who collected the
pack and stopped did not finish. `claimed_at` is the only thing that separates them, and it is
already in `RecordData`.

**Race cancelled is the state nothing on chain sets.** A cancelled race never claims or finishes
anybody, so the record stays `Entered` forever. Read it off the event, not the record. Without this,
the runner's page shows an entry that looks abandoned, for a race that was called off by someone
else.

## 4. Components, in token terms

| Piece | Tokens | Note |
| --- | --- | --- |
| Record card | `--color-paper`, border `--color-n-200`, `--radius-lg`, `--shadow-card` | a card, not a table row: a table at 390px either scrolls sideways or crushes the finish time |
| Event title | `--font-display` italic 600, `--text-lg` | |
| Meta row | label `--text-xs` uppercase `--color-n-600`, value `--text-base` | label above value, never two facts joined by a glyph. See the alignment rule below |
| Absent value | `--text-sm`, `--color-n-600` | "No official time", "Not yet", "None". Sits where the value would |
| Address heading | `--font-hero` 700, `--text-2xl` | truncated in the middle, full address behind the copy button |
| State chip | tint plus `--color-*` text, `--radius-sm` | word, icon shape, then colour. Never colour alone |
| Primary button | `--color-teal` on `--color-paper`, 48px, `--radius-md` | |
| Literal value | `--text-sm`, `--color-n-700` | a raw field or an address: plain text in `--font-sans` with `.numeric`, never a monospace family and no tinted ground |
| Skeleton | `--color-n-200`, `--radius-sm` | no shimmer, nothing moves |
| Motion | the scale in [`../race-day/README.md`](../race-day/README.md) §6 | the verify block opens with a masked slide, nothing else on this page moves |

**There is no monospace family, and this page does not invent one.** The token file settled that:
addresses, bib numbers and codes use `--font-sans` with `.numeric`, so figures stay tabular and a
value holds its width. A raw field or an address is set as plain text, one step down in size and one
step quieter in colour. It needs no box and no tint: it is an annotation, and giving it a ground of
its own makes it louder than the value it annotates. The first draft of this board used `<code>` tags, which fall
back to whatever monospace the browser has, so the same artboard exported as Consolas on one machine
and Menlo on another. A design artefact that renders differently per machine is not a design
artefact.

**The meta row meets both edges.** It is a grid, not a left-packed flex row: columns flow across
the full width of the card, the last one aligned right, so the row ends at the card's right edge
instead of trailing off into space. Each column is at least as wide as its own content
(`minmax(max-content, 1fr)`) and only the slack is shared out, which is what stops a value like
"No official time" breaking across two lines in a narrow third. The label row and the value row are
shared through `subgrid`, so a label that wraps to two lines lifts the whole label row and every
value still sits on one line together.

```css
.metaRow  { display: grid; grid-auto-flow: column;
            grid-auto-columns: minmax(max-content, 1fr);
            grid-template-rows: auto auto; column-gap: 16px; row-gap: 3px; }
.metaItem { display: grid; grid-template-rows: subgrid; grid-row: span 2; min-width: 0; }
.metaItem:last-child { text-align: right; }
```

Because the labels are fixed strings and the values are all short, the columns land in the same
places on every card, so a reader scanning down a list of races reads each fact in one column.

**No glyph separators.** Facts are separated by hierarchy or by space, never by `·`, `|` or a slash.
A row like `10K · 27 Sep · bib 128` reads as one flat string, so finding the distance means reading
the date on the way past.

### Measured contrast

Every pair on the board, computed rather than eyeballed. AA wants 4.5:1 for text under 18.66px.

| Pair | Ratio | |
| --- | --- | --- |
| ink on paper | 14.86:1 | passes at any size |
| `n-600` on paper (labels, absent values, ledger line) | 6.58:1 | passes |
| teal on paper (the prove link) | 5.88:1 | passes |
| success on success-surface (Finished chip) | 4.87:1 | passes |
| danger on danger-surface (Did not finish chip) | 6.62:1 | passes |
| warning on warning-surface (Race cancelled chip) | 5.66:1 | passes |
| teal-700 on teal-50 (Entered chip) | 9.10:1 | passes |
| `n-700` on success-surface and danger-surface (verdict body) | 9.09:1 and 8.76:1 | passes |
| **`n-500` on paper** | **4.22:1** | **fails.** Do not use it for text on a light ground |

That last row is not hypothetical. The first draft of this board used `n-500` for every label, the
ledger line and the "No official time" value, and measuring it is what caught it. **The same bug was
in the race-day board and has been fixed there too.** If `fe/` maps a muted text class to `n-500`
over paper anywhere, it has the same problem, and that belongs in the polish pass.

**Green against red is 1.41:1.** Two chips side by side are, to a colour blind reader, the same
grey. This is why every chip carries a word and an icon whose **shape** differs: a tick, a cross, a
single bar for did-not-start, a box for the race pack, a ring for entered.

## 5. The block that proves a record belongs to a person

A public page asking for a name, a national ID and an emergency contact is, visually, a phishing
page. That is not a reason to hide the feature; it is the constraint the design has to work under.

**What actually happens.** The four inputs are normalised in the browser, joined with three `0x00`
separators and the 32 byte salt, hashed once with SHA-256, and only those 32 bytes reach
`verify(token_id, hash)`. Nothing is posted to any server, including ours. The chain gets a hash
that reveals nothing about the person.

**How the design makes that observable rather than merely stated:**

1. **The hash forms on screen while you type.** P6. It is the argument made visible: this is all
   that leaves, and it says nothing about you. A sentence promising privacy convinces nobody; a
   value updating per keystroke is checkable.
2. **The pledge sits above the first field**, not under the button. Someone deciding whether to
   type their ID has decided before they reach a button.
3. **The button names its own action.** "Check against the contract", not "Submit".
4. **Closed by default, on the card it belongs to.** The call is `verify(token_id, hash)`, so the
   check is per race, not per page. A page that opens with four empty fields asking for a national
   ID has lost the reader already.
5. **The fields are cleared after a check** and never survive a reload. Nothing typed here is kept,
   including in the URL. The salt must never enter the address bar, a log or a history entry.

**The name is the trap.** `norm_name` does no case folding, so `budi santoso` and `Budi Santoso`
produce different hashes. A runner typing their own name in lower case gets a refusal and concludes
the record is fake. The field carries **Capitals matter** as a hint, and the failure copy names it
first. The ID and the contact are forgiving by comparison: spaces, dashes and brackets are stripped,
and the ID is upper-cased.

**A refusal is not an accusation.** `verify` returns `false` for a wrong hash, an unknown token and
a token with no owner, and the page cannot tell those apart. So the copy says the hashes differ and
lists the two likely causes. It never says the record is fake, and it never says anything about the
person.

## 6. Behaviour the screens imply

**Where each field comes from.** Everything on a card except the event's name and place is read
straight from `RaceRecord`: `records_of(address)` for the list, then `record_of(token_id)` per row.
The event name, city and date come from `EventRegistry` via `get_event(event_id)` plus its metadata
document. Correctness is the chain's; the indexer is only ever an accelerator, and the page must
work with the indexer down.

**Ordering.** Newest first, by `entered_at`. Never by bib: bib numbers changed meaning at STE-54 and
comparing one race's number to another's says nothing.

**Pagination.** Client side, 20 records a page, per STE-24's own recommendation. `records_of` returns
the whole list of ids in one view call, so the page size is a rendering decision, not a fetching one.

**The three empty screens are not interchangeable.** P9 is a fact: `records_of` never reverts, so an
empty list means this address has never entered a race. P11 is an admission: we could not read the
chain. Drawing an RPC failure as "no races" makes a network blip look like a runner's history being
erased, which is the exact failure this product exists to prevent. P10 never calls anything: a
56 character check starting with `G` runs in the browser first.

**Nothing on this page writes.** No transaction is ever built here. `verify` is a view call, so it
costs nothing, needs no signature and cannot be made to change anything.

## 7. Copy deck

English, short, addressed to whoever opened the link.

| Screen | String |
| --- | --- |
| Header | Race record |
| Header note | No account needed |
| Under the address | Every race this address has entered, read from the Stellar testnet. |
| Summary labels | Races / Finished / First race |
| Card labels | Distance / Bib / Finish time / Entered / Race pack collected |
| Absent time, finished | No official time |
| Absent time, not yet run | Not yet |
| Absent time, DNF | None |
| Absent time, cancelled | The race did not take place |
| Chips | Entered / Race pack collected / Finished / Did not finish / Did not start / Race cancelled |
| Prove link | Prove this record is yours |
| Pledge | What you type stays in this browser. It is turned into one hash here, and only that hash is sent to the contract. |
| Name hint | **Capitals matter.** Spacing does not. |
| ID hint | Spaces and dashes are ignored. |
| Contact hint | Spaces, dashes and brackets are ignored. A leading + is kept. |
| Salt field | 64 characters, shown once at entry |
| Hash label | The hash this page will send |
| Button | Check against the contract |
| Match | This record belongs to that person |
| Match body | The contract holds the same hash. Nobody without the salt could have produced it. |
| No match | No match |
| No match body | The hash from what you typed is not the one on this record. |
| No records | No races yet / This address is real and the chain answered. It has simply never entered a race. |
| Not an address | That is not a Stellar address |
| Unreachable | Could not reach the network / Sterun could not read the chain just now. The records are still there; this page could not fetch them. |

**Words deliberately avoided.** *Verified runner* and any badge language: one hash matching proves
one record belongs to one person, not that a person is trustworthy. *NFT* and *token*, anywhere a
runner can see: the word on every screen is **race record**. *Synced*: it says nothing about what is
on the chain. **Race pack** is two words, following `fe/`, where every user-facing string already
spells it that way.

## 8. Not designed here

- Implementing the page (Ancung, STE-24).
- Off-chain handles or profile claiming. The URL is the raw address, per STE-24's recommendation.
- The entry flow and the pass (STE-21), the scanner (STE-22), the organiser console (STE-17).
- Anything about how `participant_hash` is computed: frozen in `HASH_AND_TOTP.md`, followed here.

## 9. Open, and owned by someone else

1. **There is no transaction link to show yet.** STE-24 asks for a link to the transaction per
   record. Nothing stores one: the indexer keeps `last_ledger`, not a transaction hash, and section
   10 explains why the chain cannot supply it retrospectively either. The cards therefore show the
   ledger, and the page names the contract it read. A per-state-change transaction link needs a new
   field in the indexer, which is a backend ticket, not a design one.
2. **Event name and place for a very old record.** If the event's metadata document has gone, the
   card has an id and no name. The design assumes it resolves; the fallback wording is unwritten.
3. **Bibs from before STE-54.** Older events number per distance from 0, so a profile can show a
   bib `0` next to a bib `128`. The design never sorts or ranks by bib, which keeps it honest, but
   nothing explains the difference to a runner who notices.

---

## 10. Checked against the Stellar docs

Run through the Stellar Raven MCP on 15 Sep 2026, because a design that assumes the wrong thing
about the chain fails in front of a grant reviewer rather than in review.

| What the design assumes | Verdict | Source |
| --- | --- | --- |
| A per-record transaction link can be recovered from the chain later | **Does not hold.** `getEvents` has a **7 day retention window**, so the transaction behind a race run last month is not reachable through RPC at all | [Events](https://developers.stellar.org/docs/build/guides/events), [Ingest events](https://developers.stellar.org/docs/build/guides/events/ingest#query-events-from-stellar-rpc) |
| An RPC node holds history indefinitely | Does not hold. Local retention is "typically 7 days", and only `getLedgers` can reach past it, and only with a data lake configured | [Data lake integration](https://developers.stellar.org/docs/data/apis/rpc/admin-guide/data-lake-integration#integration-overview) |
| Contract events are the way to find what a transaction did | Holds, within that window. `getEvents` is the documented method for reading a contract's events | [Reading contract events](https://developers.stellar.org/docs/build/guides/dapps/working-with-contract-specs#reading-contract-events) |
| The page can read a whole history with no wallet and no signature | Holds. `records_of`, `record_of` and `verify` are view calls | `INTERFACE.md` §2.1, which marks all three as views that never revert |

**What this changed in the design.** The proof on this page is the contract read itself, not a
transaction link. Each card names the ledger it was last seen in and the page names the contract it
read, both of which stay true forever; a transaction hash would have to be stored by us at the
moment it happened, because seven days later the chain will not give it back. That is the open
question in section 9 for James rather than a gap in these screens.
