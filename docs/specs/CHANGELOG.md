# CHANGELOG — the frozen Sterun specification (`docs/specs/`)

Version history for **everything** in this folder: `INTERFACE.md` (the contract interface, event
layouts, error codes) and `HASH_AND_TOTP.md` (`participant_hash`, TOTP, the QR payload), together
with the `vectors/` and `reference/` that accompany them.

Versions follow **semver**, read from a consumer's point of view (the D2 SDK + the D3 apps):

| Part | Example change | Version impact |
| --- | --- | --- |
| MAJOR | change the hash/TOTP definition, change or remove a function signature, renumber an error code, change an event layout | existing data and clients break |
| MINOR | add a function, add an event, add an error variant (the next free number in its band) | existing clients keep working |
| PATCH | a documentation or wording fix that changes **not one byte** of behaviour | none |

The version is **one for the whole folder**. Each file's title carries the version at which **that
file** last changed, so differing headers between files are deliberate: `INTERFACE.md (v1.0.0)` next
to `HASH_AND_TOTP.md (v1.0.1)` means the interface document genuinely was not touched since the
freeze. What governs consumers is always the topmost entry in the version list below.

Since v2.0.0 the two do differ: `INTERFACE.md` is at **v2.4.0** while `HASH_AND_TOTP.md` is still at
**v1.0.1**, because v2 did not touch the hash or TOTP definitions at all.

---

## The rules for changing this (MANDATORY, in force since v1.0.0 merged)

Every change to a **function signature**, a **`#[contractevent]` layout**, an **error code**, or the
**hash/TOTP definitions** must:

1. Come as a **new PR** approved by **@Axel (PM) + @fable (AI co-PM)**. **No self-merges to
   `main`.**
2. Have **an entry in this file**: the new version, the date, what changed, why, and its impact on
   existing data and running clients.
3. **Regenerate the TS bindings (STE-14)** and bump their version, because every D2/D3 consumer
   holds a generated copy.
4. Keep **`bash docs/specs/verify.sh` green** (both reference implementations agree) and
   **`cd sc && cargo test` green** (including the host-sha256 test in
   `sc/contracts/race_record/src/test.rs`).
5. If **an existing vector's value changes**, say so **explicitly** in the changelog entry. Vectors
   are frozen artefacts — never regenerate them quietly to make a test pass.

**Error codes are public ABI and are never renumbered.** A Soroban `ScError` carries only a `u32`
with no contract identity, so the number itself is the contract. A new variant takes the next free
number inside its contract's band (`1..=99` C1, `100..=199` C2, `200+` OZ); a removed variant's
number **must not** be reused.

**A change to the hash definition invalidates every `participant_hash` already on chain** — old
records could not be re-verified under the new rules. So that is at minimum a MAJOR, plus a written
migration plan, not a patch.

---

## Translated to English — 2026-09-10 (deliberately NOT a version change)

`INTERFACE.md`, `HASH_AND_TOTP.md` and this file were translated from Indonesian to English,
because the repository is reviewed by people outside the team and these three are the documents a
client author reads before writing a line of code.

**No version number moved, and that is the point.** These numbers exist so a consumer can tell
whether their bindings or their hash implementation are stale. Nothing normative moved: not a
signature, not an event layout, not an error code or name, not a normalisation step, not a vector,
not a wasm hash. Bumping a version would be a false signal to exactly the people the numbers serve
— every consumer would re-check generated code for a change of language.

What was verified rather than assumed, because a frozen document is only frozen if a machine says
so:

| Check | Result |
| --- | --- |
| `node sc/scripts/check-interface.mjs` | OK — 24/18/11 functions, error codes and events for C1 and 19/23/6 for C2 parsed identically out of the English tables, and still matching the wasm and the bindings |
| `bash docs/specs/verify.sh` | OK — both reference implementations still agree on every vector |
| `bash sc/scripts/check-exports.sh` | OK — still no transfer/approve/burn |
| `cd sc && cargo test` | 126 passed |

One code change was required and rides in the same commit: the checker matched an empty data cell
against the literal `*(kosong)*`, so `sc/scripts/check-interface.mjs`'s `EMPTY` pattern now matches
`*(none)*`. Translating the tables without it would have made seven event rows parse as though they
carried data fields.

The Unicode escapes in `HASH_AND_TOTP.md` §3.5/§3.6 and in the [1.0.1] entry below are kept as
escapes (`\u00a0`, `\u0009`, `\u000a`, `\u0301`) rather than as the characters themselves. They
are invisible or, in the NFC pair, identical on screen — writing them literally is what the [1.0.1]
entry below is a fix for.

---

## [2.4.0] — 2026-09-15

**MINOR — an organiser can raise the quota of a distance that sold out (STE-55).** One new
function, one new event, one new error code taking the next free number in the C1 band. No signature
moved, no event layout moved, nothing was renumbered, and **no storage key was added**.

### Why

Selling out in hours is the ordinary case at an Indonesian road race, not an edge case. Merdeka Run
2026 filled **8,100 slots in a day** and opened a second batch the next morning; RRI Fest took 3,000
in six days; Sukoharjo Spektakuler Run sold out outright.

Until v2.4 the contract had no way to say that. `add_category` only ever creates, there is no
`update_category`, and so an organiser whose 10K filled had exactly one move left: a **duplicate
category** under a name invented to tell the two apart. That splits one distance into two everywhere
downstream — the roster, the results CSV, the finish list a timing crew reads — to work around a
number the contract simply refused to let anybody change.

Axel's decision (STE-45 question 5 → STE-55): add the increase **on chain**, where the published
quota lives, rather than letting the console fake it with a second category.

### What was added

| | |
| --- | --- |
| `increase_quota(event_id: u32, category_id: u32, new_quota: u32) -> Result<(), Error>` | organiser-gated through the same `auth_organiser` route as `add_category`; writes a larger `quota` into the existing `CategoryData` |
| `QuotaIncreased` | topics: `"quota_increased"`, `event_id`, `category_id`; data: `current: u32`, `previous: u32` (alphabetical, the `ScMap` wire order) |
| `QuotaNotIncreased = 19` | `new_quota` is not strictly greater than the category's current `quota` |

`CategoryAdded` is **untouched**, so the quota a category was originally published with stays
readable as its own event. The next free C1 code is now **20**.

### The rule that is the feature: the quota only ever goes up

`new_quota` must be **strictly greater** than the current one. Equal and smaller both revert with
`QuotaNotIncreased(19)` — one code, because they are one rule, and a client that needs to know which
it hit can read `get_category`.

This is not defensive validation around the real feature; it **is** the feature. Runners paid
against a published number. A quota that could shrink would let an organiser strand entrants who are
already on chain: `entered_count` would sit above its own `quota`, and `reserve_slot` would then
report `QuotaFull(5)` for a race that had been rewritten underneath its runners. Stopping
registration is what `set_event_status(Closed)` is for, and it is reversible. This is not.

Equal is refused for a smaller reason that matters to an indexer: a no-op that still emitted
`QuotaIncreased` would put a second batch into the ledger that never happened.

### The one thing a client must read

**`quota` is no longer constant for the life of an event.** It could not change before; it can now.
A client rendering "312 / 500" may find the denominator larger on its next read, so a cached quota
goes stale. `QuotaIncreased` carries `previous` **and** `current` precisely so that a second batch
reads as a dated fact rather than as a number that moved between two of a consumer's own reads —
reporting the latter would be reporting what the indexer last saw, not what the chain did.

### What the contract cannot enforce, and must not be described as enforcing

A published quota is part of what a runner saw when they paid, so raising it is a **real change to
what they bought**: a bigger field, a busier start pen, a longer queue for the racepack. The console
must therefore pair every increase with a **signed announcement** (the STE-34 pattern).

That pairing is an **application-level rule**. The contract cannot verify that any announcement
exists, and nothing in this entry, in `INTERFACE.md`, or in the doc comments should be read as a
claim that the chain enforces it. What the chain does guarantee is narrower and still worth having:
the increase is signed by the event's organiser, both numbers are recorded, and the change cannot be
undone quietly by moving the number back down.

### Impact on existing data

**Zero, and unusually so for an upgrade that adds behaviour: no storage key was added at all.**
`quota` is a field `CategoryData` has carried since v1.0.0 and this writes a larger value into it.
No struct gained a field, no `DataKey` variant moved, `entered_count` is neither read nor written,
and the bib sequence (`DataKey::EventEntryCount`) is not touched — so the entrants of a second batch
continue the race's numbering rather than restarting it.

Installed by `upgrade` at the **same address**
(`CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU`). Proven before the deploy by
`a_quota_can_be_raised_on_a_category_the_live_wasm_created`, which deploys the **genuinely live
wasm** (`c8b5e82a…`, committed in `sc/contracts/event_registry/testdata/` beside the two earlier
fixtures rather than replacing them), sells a distance out with it, asserts that executable has no
`increase_quota` to reach for, upgrades to the v2.4 build, reads the event, both categories, the
add-on and every counter back unchanged, and then raises the quota of a category the **old** code
created — after which the runners who were refused get in, wearing bibs 4 and 5 rather than 1 and 2
again.

### No status gate, deliberately

`increase_quota` does not check `EventStatus`. Raising the quota of a `Closed` event is precisely
the second-batch flow (lift the cap, then re-open), and on a `Cancelled` or `Completed` event the
larger number sells nothing anyway because `reserve_slot` demands `Open`. A gate would add an error
every client must handle in exchange for refusing a write that has no effect. `add_category` has
always taken the same position.

### Artefacts

| | sha256 | Size |
| --- | --- | ---: |
| EventRegistry v2.3.0 (live before) | `c8b5e82a2dde8366949cb6399d5b7eccdcbbc37d86ddd48a2adc61e40c9869cd` | 28,794 B |
| EventRegistry v2.4.0 | `33b5e687b6439eff5c9e7d6a3f736d3e5484b2235d1d87c006b33fabe8e1f890` | 31,770 B |

RaceRecord **did not change** (`0e29026d…` still) and its address was not upgraded. The
event-registry TS bindings were regenerated and `sdk/vendor/event-registry.ts` refreshed to match;
race-record's are byte-identical.

Vectors: no value changed. `HASH_AND_TOTP.md` was untouched.

### Procedure

This spec change was **pre-authorised by Axel (PM)** through the STE-55 build brief ("Axel
pre-authorises, WITHOUT an ACC gate"; merge to `main` once every e2e is green). The brief was handed
to the agent in Indonesian and is not committed, since this repository is English-only; the decision,
the authorisation and the evidence are recorded as a comment on Linear STE-55 instead. It still
landed through a PR rather than a direct push to `main` — the same arrangement as [2.1.0], [2.2.0]
and [2.3.0].

---

## [2.3.0] — 2026-09-15

**MINOR — a bib is now unique within its event and starts at 1 (STE-54).** No function was added or
removed, no signature moved, no event layout moved, no error code was added or renumbered. What
changed is the **value** `reserve_slot` returns, so this is the rare MINOR that a client must
actually read before shipping.

### Why

`reserve_slot` returned the category's `entered_count`, which made a bib a position **within a
distance**, counting from **0**:

| | before (v2.2) | from v2.3 |
| --- | --- | --- |
| first 10K entrant | `0` | `1` |
| first 5K entrant of the same race | `0` | `2` |
| second 10K entrant | `1` | `3` |

Two runners at one race were issued the same number, and the entry pass draws a physical bib — so
somebody was going to pin on a bib reading `0`, next to somebody else wearing the same `0`. A bib
whose job is to identify one runner to a marshal cannot be ambiguous inside the race it is worn at.

Axel's decision (STE-53 → STE-54): fix it **at the source, on chain**, rather than by offsetting the
number in `fe/`. A display offset would have left the ambiguous value in `RecordData.bib_no`, where
the scanner, the results CSV and any third party read it.

**The distance is deliberately not encoded into the number.** The obvious alternative,
`category_id * 1000 + n`, caps a distance at a thousand runners; Merdeka Run 2026 fills 8,100 slots
in a single distance, so the scheme overflows its own field before the race it was invented for.
Distance stays a label and a colour in the UI.

### What was added

| | |
| --- | --- |
| `DataKey::EventEntryCount(event_id) -> u32` | persistent, appended at the end of the enum; entries taken by the event across all its distances, and therefore the last bib issued |

Nothing else. `entered_count` keeps its job as the **quota counter** — `QuotaFull(5)` still fires
from exactly the comparison it fired from before, per distance. The new counter numbers entrants and
gates nothing.

A key rather than a field on `EventData`, and that is the whole reason this upgrade is safe: adding
a required field to a struct that is already stored is the one change an in-place upgrade cannot
survive, because the entries written by the running code would stop decoding.

### The one thing a client must read

**Bibs issued before this version are not unique within their event, and are not rewritten.** There
is no migration: an event created before v2.3 starts the new counter at 0, so the first entry it
takes *after* the upgrade is bib 1 — which one of its existing per-distance bibs may also be.

Seeding the counter would mean summing every category of the event on the entry path, and an
unbounded read loop inside `enter` — the call that takes a runner's money — is a worse failure than
a duplicate on a race that predates the fix. `be/` therefore **keeps** its `ambiguous_bib` /
`duplicate_bib` guard, which is now precisely a legacy-event safety net. Events created from v2.3
onwards cannot produce the collision at all.

Also worth stating because it is easy to conflate: **the bib is not the token id.** Token ids are
global to RaceRecord and count from 0; bibs belong to one race and count from 1.

### Impact on existing data

No stored value changes. `CategoryData`, `EventData` and `AddOnData` are untouched, every `DataKey`
that existed still means what it meant, and `SlotReserved` keeps its layout — two topics and one
`seq`, so the STE-16 indexer needs no change to keep filtering it.

Installed by `upgrade` at the **same address**
(`CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU`). Proven before the deploy by
`bibs_issued_by_the_live_wasm_survive_the_event_wide_sequence`, which deploys the **genuinely live
wasm** (`cf009033…`, committed in `sc/contracts/event_registry/testdata/`), fills a two-distance
event with it — reproducing the duplicate `0` — upgrades to the v2.3 build, reads the event, both
categories and every counter back unchanged, and then shows a new event numbering 1, 2, 3 across its
distances.

### One stale comment, left stale on purpose

`RecordData.bib_no` in `sc/contracts/race_record/src/lib.rs` is documented as "the category sequence
handed out by `EventRegistry::reserve_slot`", which v2.3 makes wrong. It is **not** corrected here:
doc comments travel in the contract spec and therefore in the wasm hash, so the fix would cost an
`upgrade` transaction against a live contract whose behaviour did not change, plus a new frozen hash
for C2. `INTERFACE.md` §2.2 carries the right description, and the code comment is corrected at C2's
next real wasm change.

### Artefacts

| | sha256 | Size |
| --- | --- | ---: |
| EventRegistry v2.2.0 (live before) | `cf0090331f199766af56c243a9de22c0581ea030b02940695851d64231fec3c0` | 26,948 B |
| EventRegistry v2.3.0 | `c8b5e82a2dde8366949cb6399d5b7eccdcbbc37d86ddd48a2adc61e40c9869cd` | 28,794 B |

RaceRecord **did not change** (`0e29026d…` still) and its address was not upgraded. The
event-registry TS bindings were regenerated (`DataKey` gained a variant and `reserve_slot`'s doc
comment changed); race-record's are byte-identical.

Vectors: no value changed. `HASH_AND_TOTP.md` was untouched.

### Procedure

This spec change was **pre-authorised by Axel (PM)** through the STE-54 build brief ("Axel
pre-authorises, WITHOUT an ACC gate"; merge to `main` once every e2e is green). The brief was handed
to the agent in Indonesian and is not committed, since this repository is English-only; the decision,
the authorisation and the evidence are recorded as a comment on Linear STE-54 instead. It still
landed through a PR rather than a direct push to `main` — the same arrangement as [2.1.0] and
[2.2.0].

---

## [2.2.0] — 2026-09-11

**MINOR — RaceRecord gains a finish with no official time (STE-41, option A).** One new function,
one new event. No signature changed, no event layout changed, no error code was added or renumbered,
and no storage changed. Running clients still compile and still run — with **one** new state
combination they must read, below.

### Why

Fun runs, colour runs and charity runs often have no chip timing. `record_finish` refuses
`finish_time_s == 0` (`InvalidFinishTime(105)`), which is right — so a runner who crossed the line
was stuck at `RacepackClaimed`, and the only other exit, `Dnf`, would be a lie.

Axel's decision (option A in STE-41): a **new** function and a **new** event, both append-only.
Option B — `record_finish(id, 0)` — was **rejected**: `RecordFinished` carries a plain `u32`, and
every consumer already decoding it (the STE-16 indexer, the SDK, any third party) would read `0` as
a zero-second race.

### What was added

| | |
| --- | --- |
| `record_finish_untimed(token_id: u32) -> Result<(), Error>` | organiser-gated, from `RacepackClaimed` only; sets `Finished`, `finish_time_s = None`, `result_at = now` |
| `RecordFinishedUntimed` | topics: `"record_finished_untimed"`, `token_id`, `event_id`; data: *(none)* — the `RecordDnf` shape |

Errors: none new. It reuses `RecordNotFound(101)`, `InvalidState(103)` and the organiser auth gate
of `record_finish`. Band `100..=107` is unchanged; the next free C2 code is still **108**.

### The one thing a client must read

**`state == Finished && finish_time_s == None` now exists, and it means "finished, no official
time"** — declared by the organiser, not measured. It could not exist before v2.2. A client that
assumed "`Finished` implies a time" must handle the empty case and must **never** render it as `0`.
`record_finish` and `RecordFinished` are untouched — `0` is still refused there.

### Impact on existing data

Zero. `RecordData.finish_time_s` has been `Option<u32>` since v1.0.0, so no struct gained a field and
no `DataKey` variant moved. Installed by `upgrade` at the **same address**
(`CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW`); every record already on chain decodes
unchanged. Proven before the deploy by
`records_written_by_the_live_wasm_survive_the_untimed_upgrade`, which deploys the **genuinely live
wasm** (`27749180…`, committed in `sc/contracts/race_record/testdata/`), writes `Entered`,
`RacepackClaimed`, a timed `Finished` and `Dnf` with it, upgrades to the v2.2 build, reads all four
back, and then runs `record_finish_untimed` on records the old code minted.

Clients that need changes to **show** the new state (tracked as their own tickets, deliberately not
part of this change): the `be/` indexer's `finish_time_s > 0` and `finished_records_were_claimed`
constraints plus a `record_finished_untimed` handler, the `be/` results CSV, and the `fe/` profile.

### Artefacts

| | sha256 | Size |
| --- | --- | ---: |
| RaceRecord v2.0.1 (live before) | `27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b` | 21,814 B |
| RaceRecord v2.2.0 | `0e29026d2f87c09dc30c255854a28baaeecaa543ae5e98add61ba35b511e02ba` | 23,051 B |

EventRegistry **did not change** (`cf009033…` still) and its address was not upgraded. The
race-record TS bindings were regenerated (one new method); event-registry's are byte-identical.

Vectors: no value changed. `HASH_AND_TOTP.md` was untouched.

### Procedure

This spec change was **pre-authorised by Axel (PM)** through the STE-41 build brief ("Axel
pre-authorises, WITHOUT an ACC gate"; merge to `main` once every e2e is green). The brief itself was
handed to the agent in Indonesian and is not committed, since this repository is English-only; the
decision, the authorisation and the evidence are recorded as a comment on Linear STE-41 instead. It
still landed through a PR rather than a direct push to `main` — the same arrangement as [2.1.0].

---

## [2.1.0] — 2026-09-10

**MINOR — EventRegistry gains an organiser allowlist (STE-36).** Three new functions, two new
events, three new error codes. No signature changed and no error code was renumbered, so running
clients still compile and still run — with **one** exception that must be read, below.

### Why

`create_event` accepts a free-form `name: String` and its only gate is `organiser.require_auth()`.
Auth proves the caller holds the keypair; it can say nothing about whether that keypair belongs to
the race just named after it. Anyone could create "Jakarta Marathon 2026" and sell entries to it.
Axel's decision (option A in STE-36): a hard gate in the form of an address allowlist held by the
**admin**, with access requested off-chain. KYC is a post-pilot matter and is **not** part of this
version.

### What was added

| | |
| --- | --- |
| `add_organiser(organiser: Address) -> Result<(), Error>` | admin-gated |
| `remove_organiser(organiser: Address) -> Result<(), Error>` | admin-gated |
| `is_organiser(addr: Address) -> bool` | a view, never reverts |
| `OrganiserAdded` / `OrganiserRemoved` | topics: the event name + `organiser` |
| `OrganiserAlreadyAdded(16)`, `OrganiserNotFound(17)`, `NotAllowlistedOrganiser(18)` | the next free numbers in the C1 band; 14/15 were already taken by add-ons |

Storage: `DataKey::Organiser(Address) -> bool`, **appended** at the end of the enum. `DataKey` is not
documented in `INTERFACE.md` (it is a storage schema, not a client surface), but it is mentioned here
because this version was installed by `upgrade` into an already-live contract — see below.

### A behaviour change invisible in the signature

**`create_event` can now revert with `NotAllowlistedOrganiser(18)`.** Its arguments and return did
not change, so nothing fails to compile; what changed is when it succeeds. A client that shows a
per-code error message must add 16/17/18 to its table (`be/src/chain/errors.ts` and
`sdk/src/errors.ts` already have).

### Impact on existing data

Zero for what is already written. This version was installed by `upgrade` at the **same address**
(`CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU`), so there is no new address and no
database to truncate. Proven before the deploy by
`state_written_by_the_live_wasm_survives_the_allowlist_upgrade`, which deploys the **genuinely live
wasm** (`22bb432e…`, committed in `sc/contracts/event_registry/testdata/`), writes an
event/category/add-on/scanner/bib with it, upgrades to the v2.1 build, then reads it all back.

**What does need action: the allowlist starts EMPTY.** `upgrade` replaces code, not storage, and no
migration puts the organisers of existing events into it. Until the admin calls `add_organiser`, no
`create_event` succeeds — including one from an organiser who already has events. Seeding is a deploy
step; the seeded wallets are recorded in `docs/deployments.md`.

Revocation is **forward-only**: `remove_organiser` does not touch events already created. Their
organiser is still the organiser and still holds every per-event power, both here and in C2. A race
whose entries have sold is not cancelled by one storage write.

### Artefacts

| | sha256 | Size |
| --- | --- | ---: |
| EventRegistry v2.0.1 | `22bb432ecfd5480a7dbfe68949df2aa6ccd9c87c21db2b7ec9dd19bf6d032a2f` | 22,952 B |
| EventRegistry v2.1.0 | `cf0090331f199766af56c243a9de22c0581ea030b02940695851d64231fec3c0` | 26,948 B |

RaceRecord **did not change** (`27749180…` still) and its address was not upgraded. The
event-registry TS bindings were regenerated; race-record's are byte-identical.

Vectors: no value changed. `HASH_AND_TOTP.md` was untouched.

### Procedure

This spec change was **pre-authorised by Axel (PM)** through the STE-36 brief committed as
`ALLOWLIST_BRIEF.md` ("Axel pre-authorises, WITHOUT an ACC gate"), and still landed through a PR
rather than a direct push to `main`.

---

## [2.0.1] — 2026-09-09

**PATCH — the artefact changed, the interface did not.** `RaceRecord.enter` skips the
cross-contract `addon_count` call when `addon_ids` is empty, so an entry without add-ons costs
exactly what it did in v1 — which is what `INTERFACE.md` §2.1 promised callers that send `[]`.

What did **not** change, and why this is a PATCH: zero changes to signatures, event layouts, error
codes, types, or the hash/TOTP definitions. **The TS bindings are byte-identical** — the generator
reads the interface, and the interface is exactly the same. Running clients need do nothing.

All that changed is the provenance table in `INTERFACE.md` §0:

| | sha256 | Size |
| --- | --- | ---: |
| RaceRecord v2.0.0 | `c90a428152f0d8605cbb7466128b32b6dc821aa4735d930c280fe6fd4b58c0fc` | 21,795 B |
| RaceRecord v2.0.1 | `27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b` | 21,814 B |

EventRegistry **did not** change with it (`22bb432e…` still).

Installed at the already-live address by `upgrade` — **not** a new address. This is the first use of
the v2 mechanism for what it was designed for, and the evidence (the tx, the state before and after,
plus one `enter` on the new code) is in `docs/deployments.md`, section 7.

---

## [2.0.0] — 2026-09-09

**MAJOR — `enter`'s signature changed, and both contracts are now upgradeable.** v1 stays live at
its own addresses and is untouched (v1 is non-upgradeable, so it genuinely cannot be touched); v2 is
a **new pair of addresses**, recorded in `docs/deployments.md`. A client still talking to the v1
addresses is not broken by this entry — what breaks is a client using the new bindings to call the
old contract, or the other way round.

Approval: Axel's (PM) written brief in `V2_BRIEF.md`, which also gave pre-authorisation to merge
without a per-PR ACC gate this time. That is a legitimate substitute for "a PR + approval from @Axel
+ @fable" in the rules above, and is mentioned here so the trail exists.

### Why

Ancung asked for paid add-ons (STE-35): a jersey at +5, a tumbler at +3, sold alongside the entry.
v1's `enter` charges **exactly one** `category.price_usdc`, so add-on money had to move off-chain —
and then the chain could not answer the two questions that matter most at the merchandise desk:
*"has this runner paid for a jersey"* and *"how many jerseys are left"*.

Because v1 has no upgrade path, meeting that request **had** to mean new addresses. So an upgrade
mechanism was fitted at the same time, making this the last time an address changes.

### Breaking

- **`RaceRecord.enter`** takes `addon_ids: Vec<u32>` as its **4th** argument, before
  `participant_hash`. A caller selling no add-ons sends `[]` and gets v1's behaviour unchanged.
- **`EventStatus` gains `Cancelled`.** The enum is open on the contract side, but `be/`, `fe/` and
  `sdk/` validated a closed list of 4 variants — the migration checklist is in `INTERFACE.md` §8.
- **The non-transferable claim changes shape** (not substance): it is still proven mechanically from
  the deployed wasm, but it now depends on the admin key not installing different wasm. The table is
  in `INTERFACE.md` §4. This is the one part of v2 that **reduces** a guarantee, and it is written
  out explicitly so it cannot pass as a footnote.

### Added

- `EventRegistry.upgrade(new_wasm_hash)` and `RaceRecord.upgrade(new_wasm_hash)`, admin-gated, using
  `env.deployer().update_current_contract_wasm` (Soroban's native upgrade mechanism — not a proxy,
  not `delegatecall`).
- `EventRegistry`: `add_addon`, `reserve_addon`, `get_addon`, `addon_count`, the `AddOnData` type,
  and the storage keys `AddOn(event_id, addon_id)` + `AddOnCount(event_id)`.
- `RecordData.addon_ids: Vec<u32>` — the add-ons that entry bought, in reservation order.
- Events: `AddOnAdded`, `AddOnReserved` (C1), `ContractUpgraded` (**both** contracts).
- Error codes, all of them the next free number in their band, with **zero renumbering**:
  `AddOnNotFound(14)`, `AddOnQuotaFull(15)`, `TooManyAddOns(106)`, `DuplicateAddOn(107)`.

### Vectors

**No vector changed.** `participant_hash` and TOTP were not touched at all — `HASH_AND_TOTP.md`
stays at v1.0.1 and `docs/specs/verify.sh` is green without changes.

### New rules born of upgradeability

Storage now has to survive a change of code, and the compiler cannot guard that:

- **`DataKey` is append-only forever.** Do not delete, do not rename, do not change a value's type.
  A `#[contracttype]` enum is transmitted as the **variant's name**, so adding a variant is safe and
  renaming one orphans every existing entry with no error.
- **`RecordData` must never gain another required field once records exist.** A `#[contracttype]`
  struct is a map keyed by field name, so an old value fails to decode into a struct that gained a
  required field. That is why `addon_ids` went in **now**, while no v2 record existed, rather than at
  the next upgrade.
- **`stellar-tokens` owns OZ's owner/balance/enumeration keys.** Bumping its major through an
  upgrade is a storage migration, not a version bump.

---

## [1.0.1] — 2026-09-01

**PATCH — a rendering fix, zero behaviour change.** Not one byte changed: no signature, event
layout, error code, hash/TOTP definition, vector, or reference implementation was touched. Consumers
who already generated against v1.0.0 **need do nothing**, and the TS bindings were **not**
regenerated — the wasm and `INTERFACE.md` are exactly the same.

### Fixed

- **`HASH_AND_TOTP.md` §3.5** — the `name` table row had split in two. Below the intact `name` row, a
  fragment was left behind as a line of its own:

  ```text
  "` | `Siti Aminah binti Rahman` |
  ```

  That line does not begin with `|`, so GitHub (and any other Markdown renderer) stops reading the
  table there: the last two rows (`national_id`, `emergency_contact`) fell out of the table with it.
  The fragment was deleted. The intact `name` row was already correct and was **not** changed.

  Its values were re-verified against the `ph-04-messy-whitespace` vector in
  `vectors/participant_hash.json` rather than skimmed: the raw value is exactly
  `"  Siti\u00a0 Aminah   binti\u0009Rahman\u000a"` (NBSP `U+00A0` + space, TAB `U+0009`, a
  trailing LF `U+000A`) and its normalised form is `Siti Aminah binti Rahman` — the same as
  what was already written. The hash `feb3ce…fe29` in the paragraph below it also stands.

This matters precisely because §3.5 is the one place the normalisation rules are shown as an
*example* rather than as prose: it is what James and Ancung read first. A table that does not render
makes the "raw" and "normalised" columns appear merged — exactly the misreading that produces two
implementations with different hashes.

### Verification

- `bash docs/specs/verify.sh` — green; both reference implementations still agree on every vector.
- `cd sc && cargo test` — green (33 + 42), including
  `host_sha256_matches_every_participant_hash_vector`.
- `node sc/scripts/check-interface.mjs` — green; wasm ↔ `INTERFACE.md` ↔ bindings did not move.

---

## [1.0.0] — 2026-08-31

**The initial freeze.** STE-10 (component C4). This is what unblocked **James** (backend) and
**Ancung** (frontend/PWA) to work in parallel without waiting for contract work.

### Added

- **`INTERFACE.md`** — the public interfaces of EventRegistry (C1, STE-5) and RaceRecord (C2,
  STE-9), derived mechanically from `stellar contract info interface --wasm ...` rather than copied
  by hand. It holds the full function signatures + who must authorize + the errors that can appear,
  the `#[contractevent]` layouts (which fields are topics, which are data, in what order), both error
  enums with their numbers, the error band convention and its reasoning, the non-transferable note
  (the transfer/approve/burn functions genuinely **do not exist**), and the sUSD SAC address.
  The wasm it refers to:
  - `event_registry.wasm` — `61d85dd567f65b7ed61ea8282880af6413104af3c8bbd2bbaec3e55f73578474`
  - `race_record.wasm` — `75d380456c6c9cc2d52e2e3beded4e3d84a4b00e9926aeed0eaf9ba3e607919f`
- **`HASH_AND_TOTP.md`** — the byte-exact definition of `participant_hash` (NFC normalisation, the
  whitespace rules, three `0x00` separators, a 32 raw-byte salt), of TOTP (HMAC-SHA-256, a 30-second
  step, 6 digits, ±1 step tolerance, constant-time comparison), and of the QR payload's
  serialisation. Complete with a byte-level walkthrough anyone can re-check with `printf` + `shasum`.
- **`vectors/participant_hash.json`** — 5 vectors + 4 rejection cases. Including the NFC
  precomposed/decomposed pair that **must produce the same hash**, and the pair differing only in
  salt that **must differ**.
- **`vectors/totp.json`** — 4 code vectors (one of them starting with a zero: `079663`) + 8
  verification cases pinning the ±1 step window, the rejection of a 2-step-old code, and the
  rejection of a 5-character code.
- **`reference/node/verify-vectors.mjs`** — the Node reference implementation, `node:crypto` only,
  with **zero npm dependencies** (nothing was added to the pnpm workspace).
- **`reference/rust/`** — the Rust reference implementation, a standalone crate with its own
  `[workspace]` (**not** a member of `sc/`), with `=`-pinned dependencies.
- **`verify.sh`** — runs both and fails loudly if either disagrees.
- Two tests in `sc/contracts/race_record/src/test.rs`
  (`host_sha256_matches_every_participant_hash_vector`,
  `every_participant_hash_vector_is_accepted_by_enter_and_verify`) that read the **same** vector file
  and run it through `env.crypto().sha256()` + `enter` + `verify`. race_record: 39 → 41 tests;
  event_registry stays at 33.

### The decisions frozen here

| Decision | Value |
| --- | --- |
| Hash function | SHA-256 |
| Preimage | `utf8(norm_name) \|\| 0x00 \|\| utf8(norm_id) \|\| 0x00 \|\| utf8(norm_contact) \|\| 0x00 \|\| salt` |
| Salt | 32 CSPRNG bytes, one per record, rendered as lowercase hex |
| Normalisation | NFC → trim → collapse whitespace → reject empty/`U+0000`; ids: strip `-` + whitespace then ASCII-uppercase; contacts: strip `-`, `(`, `)`, whitespace |
| Whitespace definition | an explicit list of the 25 Unicode `White_Space=Yes` code points |
| TOTP | HMAC-SHA-256, a 32-byte secret, a 30-second step, RFC 4226 §5.3 dynamic truncation, 6 digits |
| TOTP tolerance | ±1 step (a window of up to 90 seconds), constant-time comparison |
| QR payload | `{"t":<u32>,"s":<u64>,"c":"<6-character string>"}` — exactly, with no spaces |
| Error code bands | `1..=99` C1 · `100..=199` C2 · `200+` OZ |
| Payment token | a constructor parameter; testnet `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` (the sUSD SAC), mainnet USDC |

### Clarifications to the PM's draft specification

Two things that were ambiguous during implementation, decided here and documented:

1. **"Unicode whitespace" is not one set.** ECMAScript's `WhiteSpace` counts `U+FEFF` and does
   **not** count `U+0085`; Unicode's `White_Space` (= Rust's `char::is_whitespace()`) is exactly the
   opposite. If each language used its own built-in, the hashes would differ. Resolved by writing out
   the 25 `White_Space=Yes` code points explicitly and hardcoding them in both implementations, plus
   a Rust test proving that list equals `char::is_whitespace()` across the whole scalar range.
2. **Rejection after separator removal (N5b/N6b).** The draft only mentioned rejection at N4 (empty
   after `norm_base`). But an input like `" -- - "` passes N4 and only becomes empty once N5 removes
   the hyphens and spaces. Hashing an empty component means accepting an identity field that contains
   nothing, so it is rejected. Covered by vectors `rj-03` and `rj-04`.

### What consumes this freeze

| Ticket | Component | What it uses |
| --- | --- | --- |
| **STE-11** | PII vault + backend hash/salt (James) | `HASH_AND_TOTP.md` §2–§4 |
| **STE-14** | TS bindings (Axel) | all of `INTERFACE.md` |
| **STE-15** | `SterunClient` (James) | function signatures + error codes + bands |
| **STE-16** | Indexer (James) | `INTERFACE.md` §1.3, §2.3 — topic/data shapes + emission order |
| **STE-17** | Organiser console (Ancung) | EventRegistry's organiser surface + `record_finish` |
| **STE-18 / STE-21 / STE-22** | QR pass + scanner PWA (Ancung) | `HASH_AND_TOTP.md` §4–§5, `claim_racepack`, `is_scanner` |
| **STE-33** | Testnet deploy | wasm hashes + constructor parameters |
