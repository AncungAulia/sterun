# INTERFACE — the FROZEN Sterun contracts (v2.5.0)

> **Status: FROZEN 2026-09-17 (v2.5 — entries close on their own at the registration close date).**
> This document is handoff contract number 1 in `docs/SYSTEM_DESIGN.md` §9: the function
> signatures and `#[contractevent]` layouts that **James** (backend/indexer) and **Ancung**
> (web app, QR pass, scanner PWA) hold, so they can work in parallel without waiting for
> contract work.
>
> Any change to a signature, an event layout, or an error code after this PR is merged requires:
> **a new PR + approval from Axel (PM) + fable**, an entry in `docs/specs/CHANGELOG.md`, and
> **regenerated TS bindings** (STE-14). Error codes are public ABI — **never renumber them**.

## What changed from v2.4.0 (MINOR, additive)

STE-46, as decided in STE-45. An organiser writes a registration close date into the event document
and runners read it on the race page, but until v2.5 the contract enforced nothing of it: entries
stayed open until somebody pressed Close entries, so one forgotten click made the race page false.

| Change | Impact on clients |
| --- | --- |
| `set_registration_closes(event_id, closes_at)` new in C1 | additive |
| `get_registration_closes(event_id)` new in C1 | additive |
| New event: `RegistrationClosesSet` | additive — an indexer that does not know it does not show close dates |
| New error code: `RegistrationClosed(20)`, from `reserve_slot` and `reserve_addon` | **read this** — `RaceRecord.enter` propagates it |
| No changed signature, no changed event layout; one storage key appended | — |
| Installed by `upgrade` at the **same** address (`CAPB6NQP…`) | no new address; existing events intact |

Four things you must read before using this version:

- **`enter` can now revert `RegistrationClosed(20)` on an event whose status is still `Open`.** The
  date is checked after the status, so a `Closed` event still answers `EventNotOpen(4)` whether or not
  its date has passed. Show them differently: one is a state the organiser chose, the other a date
  that passed.
- **No date means no automatic close.** Every event created before v2.5 has none and behaves exactly
  as before; nothing was migrated. `get_registration_closes` answers `None` for those.
- **The date moves either way, and a later date is the only thing that reopens after it.** Moving the
  status back to `Open` past the date reopens nothing. A date in the past closes entries at once.
  There is no way to remove a date once set.
- **The chain cannot tell you whether anyone was told.** The document's date is frozen by its hash
  and stays what runners were promised; the on-chain date is what is enforced now. An extension is a
  real change to that promise, so the console pairs a later date with a signed announcement (STE-40).
  That is an **application-level** rule, and no client should be written as though the chain checks
  it. `RegistrationClosesSet` carries `previous` and `current`, so an extension is visible from the
  event alone.

## What changed from v2.3.0 (MINOR, additive)

STE-55. A distance that sold out could not take another entrant, ever. `add_category` only creates
and there is no `update_category`, so an organiser whose 10K filled in an afternoon had one move
left — a second category under a confusing name, which splits one distance into two and corrupts the
roster and every result built from it. v2.4 adds a way to say "second batch" honestly.

| Change | Impact on clients |
| --- | --- |
| `increase_quota(event_id, category_id, new_quota)` new in C1 | additive |
| New event: `QuotaIncreased` | additive — an indexer that does not know it simply does not index second batches |
| New error code: `QuotaNotIncreased(19)` | additive — nothing renumbered |
| **A category's `quota` can now change after it is created** | **read this** — see below |
| No changed signature, no changed event layout, no new storage key | — |
| Installed by `upgrade` at the **same** address (`CAPB6NQP…`) | no new address; existing events intact |

Three things you must read before using this version:

- **The quota only ever goes up.** `new_quota` must be strictly greater than the category's current
  quota; equal or smaller reverts with `QuotaNotIncreased(19)`. That is the rule, not input
  validation around it: runners paid against a published number, and a shrinkable quota would let an
  organiser strand entrants who are already on chain — `entered_count` would sit above its own
  `quota`, and `reserve_slot` would report `QuotaFull(5)` for a race that had been rewritten
  underneath its runners. Shutting registration is `Closed`, and that is reversible; this is not.
- **`quota` is no longer a constant, so do not cache it for the life of an event.** `CategoryData`
  did not change shape and `entered_count` is untouched — what moved is that a client rendering
  "312 / 500" may find the denominator larger on the next read. `QuotaIncreased` carries **both**
  `previous` and `current`, so a client can show the second batch as a dated fact rather than
  inferring one from a number that quietly moved between two of its own reads.
- **The chain cannot tell you whether anyone was told.** A published quota is part of what a runner
  saw when they paid, so raising it is a real change to what they bought — a bigger field, a busier
  start pen. The console must pair every increase with a signed announcement (the STE-34 pattern).
  That is an **application-level** rule: nothing in this contract enforces it, and no client should
  be written as though something does.

**Quota enforcement itself is unchanged.** `reserve_slot` still compares `entered_count` against
`quota` per distance and still reverts `QuotaFull(5)` from exactly that comparison. The bib sequence
is untouched too: `increase_quota` never reads `EventEntryCount`, so the entrants of a second batch
continue the race's numbering instead of restarting it.

There is deliberately **no status gate**. Raising the quota of a `Closed` event is precisely the
second-batch flow — lift the cap, then re-open — and on a `Cancelled` or `Completed` event the write
sells nothing anyway, because `reserve_slot` demands `Open`. A gate would add an error every client
must handle in exchange for refusing a write with no effect. `add_category` takes the same position.

## What changed from v2.2.0 (MINOR)

STE-54. `reserve_slot` returned the category's `entered_count`, so a bib was a position **within a
distance**, counting from **0**. The first 10K entrant and the first 5K entrant of one race were
therefore both bib `0`: two runners at the same event wearing the same number, and an entry pass
drawing a physical bib with a zero on it. v2.3 makes the bib a position **within the event**,
counting from **1**.

| Change | Impact on clients |
| --- | --- |
| **`reserve_slot` returns an event-wide number starting at 1** | **read this** — the signature, the types and the error list are all unchanged; what moved is the value |
| `SlotReserved.seq` carries that number | layout untouched — same topics, same field; an indexer needs no change |
| `RecordData.bib_no` / `RecordEntered.bib_no` carry it too | no C2 code change; C2's wasm is **not** rebuilt |
| New storage key `DataKey::EventEntryCount(event_id)` | invisible to clients — `DataKey` is not part of this surface |
| No new function, no new event, no new error code, no changed signature | — |
| Installed by `upgrade` at the **same** address (`CAPB6NQP…`) | no new address; existing events intact |

Three things you must read before using this version:

- **The distance is not encoded in the number.** A scheme like `category_id * 1000 + n` caps a
  distance at a thousand runners, and one distance here can hold tens of thousands (Merdeka Run 2026
  fills 8,100 slots in a single distance). Bib `7` says "the seventh person who entered this race",
  and nothing about which distance they entered. Render the distance as a label and a colour beside
  the number, never as arithmetic on it.
- **Events created before v2.3 keep the numbers they issued**, and there is no migration. Their
  counter therefore starts at 0, so the first entry taken on such an event *after* the upgrade is
  bib 1 — which one of its existing per-distance bibs may also be. Seeding the counter would mean
  summing every category of the event inside `enter`, and an unbounded read loop on the path that
  takes a runner's money is the worse failure. **A client that shows bibs for a pre-upgrade event
  must not assume they are unique**; `be/` keeps its duplicate-bib guard for exactly those events.
  Events created from v2.3 onwards cannot produce the collision at all.
- **The bib is not the token id.** Token ids are global to RaceRecord and count from 0; bibs belong
  to one race and count from 1. They coincide only on the first event ever run, and only by accident.

**Quota is unchanged.** `entered_count` is still incremented per distance and `QuotaFull(5)` still
fires from exactly the comparison it fired from before. The event counter numbers entrants; it gates
nothing.

## What changed from v2.1.0 (MINOR, additive)

STE-41 (option A). Fun runs, colour runs and charity runs often have **no chip timing**.
`record_finish` refuses `finish_time_s == 0` (`InvalidFinishTime(105)`), so a runner who crossed the
line had nowhere to go but `RacepackClaimed` — and `Dnf` would be a lie. v2.2 adds a finish with no
official time.

| Change | Impact on clients |
| --- | --- |
| `record_finish_untimed(token_id)` new in C2 | additive |
| New event: `RecordFinishedUntimed` | additive — an indexer that does not know it simply does not index untimed finishes |
| **A `Finished` record may now have `finish_time_s == None`** | **read this** — see below |
| No new error code, no changed signature, no changed event layout | — |
| Installed by `upgrade` at the **same** address (`CCVW7WVC…`) | no new address; existing records intact |

**`state == Finished && finish_time_s == None` is the marker for "finished, no official time"** —
declared by the organiser, not measured by a chip. Before v2.2 that combination could not exist, so a
client that assumed "`Finished` implies a time" must now handle the empty case. It must **never** be
rendered as `0` or `00:00:00`.

Why a new function and a new event rather than `record_finish(id, 0)` (option B, **rejected**):
`RecordFinished` carries a plain `u32`, and every consumer already decoding it would read `0` as a
zero-second race. `record_finish` and `RecordFinished` are **untouched** — including the refusal of
`0`. The two finish paths never share an event, so a consumer can tell them apart from the event name
alone.

## What changed from v2.0.1 (MINOR, additive)

STE-36. `create_event` used to be guarded only by `organiser.require_auth()`. That proves the
caller holds the keypair, and proves **nothing** about `name` — which is a free-form `String`.
Anyone could create "Jakarta Marathon 2026" and sell entries to it. v2.1 adds a second layer: an
**organiser allowlist held by the admin**.

| Change | Impact on clients |
| --- | --- |
| `add_organiser` / `remove_organiser` / `is_organiser` new in C1 | additive |
| New events: `OrganiserAdded`, `OrganiserRemoved` | additive |
| New error codes: `OrganiserAlreadyAdded(16)`, `OrganiserNotFound(17)`, `NotAllowlistedOrganiser(18)` | additive — nothing renumbered |
| **`create_event` can now revert with `NotAllowlistedOrganiser(18)`** | **behaviour change** — a caller who is not allowlisted is refused; the signature is unchanged |
| Installed by `upgrade` at the **same** address (`CAPB6NQP…`) | no new address; existing events intact |

Two things you must read before using this version:

- **The allowlist starts EMPTY.** `upgrade` replaces code, not storage, and no migration moves the
  organisers of existing events into the allowlist. Until the admin calls `add_organiser`, **no**
  `create_event` succeeds. Seeding is a deploy step, not an afterthought.
- **Revocation is forward-only.** `remove_organiser` does not touch events already created: their
  organiser is still the organiser and can still `add_category`, `set_event_status`, manage
  scanners, and `record_finish` in C2. What is lost is only the ability to create **new** events. A
  race whose entries have already sold cannot be cancelled by one storage write.

## What changed from v1.0.1 (BREAKING)

v1 is already live and **non-upgradeable**, so its addresses are permanent and this version does
**not replace that contract in place** — v2 is a new pair of addresses. The old one stays recorded
in `docs/deployments.md` as an archive; what governs new work is this document.

| Change | Impact on clients |
| --- | --- |
| `enter` takes `addon_ids: Vec<u32>` (the 4th argument, before `participant_hash`) | **breaking** — every caller of `enter` must be updated; send `[]` when no add-ons are bought |
| `RecordData` gains an `addon_ids: Vec<u32>` field | additive — a decoder reading by field name is safe |
| `EventStatus` gains a `Cancelled` variant | **breaking for a closed enum** — `be/`, `fe/` and `sdk/` validated only 4 variants (see §8) |
| `upgrade(new_wasm_hash)` new in **both** contracts | additive |
| `add_addon` / `reserve_addon` / `get_addon` / `addon_count` + the new `AddOnData` type in C1 | additive |
| New events: `AddOnAdded`, `AddOnReserved`, `ContractUpgraded` (both contracts) | additive |
| New error codes: `AddOnNotFound(14)`, `AddOnQuotaFull(15)`, `TooManyAddOns(106)`, `DuplicateAddOn(107)` | additive — nothing renumbered |
| The contracts are now **upgradeable** | see §4 — the non-transferable claim is now about the deployed wasm, not about the address forever |

Sibling documents:

| File | Contents |
| --- | --- |
| `docs/specs/HASH_AND_TOTP.md` | the byte-exact definitions of `participant_hash`, TOTP, and the QR payload |
| `docs/specs/vectors/` | JSON test vectors for both |
| `docs/specs/reference/` | two reference implementations (Node + Rust) that must agree |
| `docs/specs/CHANGELOG.md` | version history + the rules for changing it |
| `docs/specs/verify.sh` | runs both reference implementations |

---

## 0. Provenance — this document is derived from wasm, not retyped

The contents of sections 1–4 below are **read out of the build artefacts**, not copied from the
source. The commands:

```bash
cd sc
stellar contract build

stellar contract info interface --wasm target/wasm32v1-none/release/event_registry.wasm
stellar contract info interface --wasm target/wasm32v1-none/release/race_record.wasm

stellar contract info hash --wasm target/wasm32v1-none/release/event_registry.wasm
stellar contract info hash --wasm target/wasm32v1-none/release/race_record.wasm
```

The artefacts used for this freeze:

| Contract | Wasm | Wasm hash (sha256) | Size |
| --- | --- | --- | ---: |
| EventRegistry (C1, v2.5) | `sc/target/wasm32v1-none/release/event_registry.wasm` | `995d19ea17a4cd6094de05b867cdbdbc636264e739b3386b5367bc4ebeea6942` | 35,814 B |
| RaceRecord (C2, v2.2) | `sc/target/wasm32v1-none/release/race_record.wasm` | `0e29026d2f87c09dc30c255854a28baaeecaa543ae5e98add61ba35b511e02ba` | 23,051 B |

Each version moves exactly one of the two. EventRegistry did **not** change in v2.2 (its v2.1 hash
stood, and its address was not `upgrade`d); RaceRecord does **not** change in v2.3 — `bib_no` carries
a different number, but no C2 code produced it, so its hash is exactly the one frozen at v2.2 — and
it does not change in v2.4 or v2.5 either, which touch C1 alone.

> RaceRecord's `bib_no` field still carries the doc comment "the category sequence handed out by
> `EventRegistry::reserve_slot`", which v2.3 makes wrong. Doc comments travel in the contract spec
> and therefore in the wasm hash, so correcting that sentence would mean an `upgrade` transaction
> against a live contract whose behaviour did not change. The table in §2.2 below is right; the code
> comment is corrected at C2's next real wasm change.

Artefacts that have been **replaced at the same address** through `upgrade` (the full history and
its transactions are in `docs/deployments.md`):

| | sha256 | Size |
| --- | --- | ---: |
| EventRegistry v2.0.0/v2.0.1 | `22bb432ecfd5480a7dbfe68949df2aa6ccd9c87c21db2b7ec9dd19bf6d032a2f` | 22,952 B |
| EventRegistry v2.1.0/v2.2.0 | `cf0090331f199766af56c243a9de22c0581ea030b02940695851d64231fec3c0` | 26,948 B |
| EventRegistry v2.3.0 | `c8b5e82a2dde8366949cb6399d5b7eccdcbbc37d86ddd48a2adc61e40c9869cd` | 28,794 B |
| EventRegistry v2.4.0 | `33b5e687b6439eff5c9e7d6a3f736d3e5484b2235d1d87c006b33fabe8e1f890` | 31,770 B |
| RaceRecord v2.0.0 | `c90a428152f0d8605cbb7466128b32b6dc821aa4735d930c280fe6fd4b58c0fc` | 21,795 B |
| RaceRecord v2.0.1/v2.1.0 | `27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b` | 21,814 B |

Five of those artefacts are also **committed**, each as the "before" of an upgrade test that
deploys the genuinely live code, writes state with it, then replaces it with the current build:
`22bb432e…`, `cf009033…`, `c8b5e82a…` and `33b5e687…` in `sc/contracts/event_registry/testdata/`
(the first proves `DataKey::Organiser` was added safely, the second that the per-distance bibs
already on chain still decode once bibs become event-wide, the third that a sold-out category written
by the running code takes a larger quota and sells again, the fourth that an event the running code
opened takes a close date and stops at it while an event with none runs as before) and `27749180…` in
`sc/contracts/race_record/testdata/` (proves every record state the old code could write still
decodes, and that `record_finish_untimed` works on records it minted).

The previously frozen v1 artefacts (still live at the v1 addresses, see `docs/deployments.md`):
`61d85dd567f65b7ed61ea8282880af6413104af3c8bbd2bbaec3e55f73578474` (C1, 14,964 B) and
`75d380456c6c9cc2d52e2e3beded4e3d84a4b00e9926aeed0eaf9ba3e607919f` (C2, 19,435 B).

Those hashes are **an ordinary sha256 of the wasm file** — a reviewer can check them without the
Stellar CLI:

```bash
shasum -a 256 sc/target/wasm32v1-none/release/event_registry.wasm
# 995d19ea17a4cd6094de05b867cdbdbc636264e739b3386b5367bc4ebeea6942
```

The toolchain that produced them: `rustc 1.93.0`, `stellar 27.0.0`, `soroban-sdk =26.1.1`,
OZ `stellar-tokens =0.7.2` (see `CLAUDE.md` for why the versions are pinned).

> If your wasm hash differs from the table above, do not immediately assume this document is wrong:
> Rust builds are not bit-for-bit reproducible across machines and toolchains. What must match is
> the **interface contents** (`stellar contract info interface`), not the hash. The hash exists so
> there is one concrete artefact to point at. What was deployed to testnet is recorded in
> `docs/deployments.md` (STE-33) with its own hash.

---

## 1. EventRegistry (C1) — the public surface

One instance serves every event. Design: `docs/SYSTEM_DESIGN.md` §3.1.

### 1.1 Functions

Types in the argument column use Soroban's names (`Address`, `String`, `Symbol`, `BytesN<32>`).
Every `Result<T, Error>` means: on success it returns `T`, on failure it **reverts** with
`Error(Contract, #code)`.

| Function | Arguments | Returns | Who must authorize | Possible errors |
| --- | --- | --- | --- | --- |
| `__constructor` | `admin: Address` | — | — (runs once at deploy) | — |
| `upgrade` | `new_wasm_hash: BytesN<32>` | `Result<(), Error>` | the stored **`Admin`** | `NotInitialized(1)`, plus a host error if the hash has not been uploaded |
| `set_race_record` | `race_record: Address` | `Result<(), Error>` | the stored **`Admin`** | `NotInitialized(1)`, `RaceRecordAlreadySet(7)` |
| `add_organiser` | `organiser: Address` | `Result<(), Error>` | the stored **`Admin`** | `NotInitialized(1)`, `OrganiserAlreadyAdded(16)` |
| `remove_organiser` | `organiser: Address` | `Result<(), Error>` | the stored **`Admin`** | `NotInitialized(1)`, `OrganiserNotFound(17)` |
| `create_event` | `organiser: Address, name: String, metadata_hash: BytesN<32>, uri: String, starts_at: u64` | `Result<u32, Error>` (event_id) | the **`organiser`** (the argument), which must be on the admin's allowlist | `NotInitialized(1)`, `NotAllowlistedOrganiser(18)` |
| `add_category` | `event_id: u32, code: Symbol, distance_m: u32, quota: u32, price_usdc: i128` | `Result<u32, Error>` (category_id) | **that event's organiser** (from storage) | `EventNotFound(2)`, `InvalidQuota(8)`, `InvalidPrice(9)`, `InvalidDistance(10)` |
| `increase_quota` | `event_id: u32, category_id: u32, new_quota: u32` | `Result<(), Error>` | **that event's organiser** (from storage) | `EventNotFound(2)`, `CategoryNotFound(3)`, `QuotaNotIncreased(19)` |
| `set_registration_closes` | `event_id: u32, closes_at: u64` | `Result<(), Error>` | **that event's organiser** (from storage) | `EventNotFound(2)` |
| `add_addon` | `event_id: u32, code: Symbol, price_usdc: i128, quota: u32` | `Result<u32, Error>` (addon_id) | **that event's organiser** (from storage) | `EventNotFound(2)`, `InvalidQuota(8)`, `InvalidPrice(9)` |
| `set_event_status` | `event_id: u32, status: EventStatus` | `Result<(), Error>` | **that event's organiser** | `EventNotFound(2)`, `InvalidStatus(11)` |
| `add_scanner` | `event_id: u32, scanner: Address` | `Result<(), Error>` | **that event's organiser** | `EventNotFound(2)`, `ScannerAlreadyAdded(12)` |
| `remove_scanner` | `event_id: u32, scanner: Address` | `Result<(), Error>` | **that event's organiser** | `EventNotFound(2)`, `ScannerNotFound(13)` |
| `reserve_slot` | `event_id: u32, category_id: u32` | `Result<u32, Error>` (the bib: unique in the event, from 1) | **only the wired RaceRecord contract** (invoker-contract auth) | `RaceRecordNotSet(6)`, `EventNotFound(2)`, `EventNotOpen(4)`, `RegistrationClosed(20)`, `CategoryNotFound(3)`, `QuotaFull(5)` |
| `reserve_addon` | `event_id: u32, addon_id: u32` | `Result<i128, Error>` (the price charged) | **only the wired RaceRecord contract** (invoker-contract auth) | `RaceRecordNotSet(6)`, `EventNotFound(2)`, `EventNotOpen(4)`, `RegistrationClosed(20)`, `AddOnNotFound(14)`, `AddOnQuotaFull(15)` |
| `get_admin` | — | `Result<Address, Error>` | — (view) | `NotInitialized(1)` |
| `get_race_record` | — | `Result<Address, Error>` | — (view) | `RaceRecordNotSet(6)` |
| `get_event` | `event_id: u32` | `Result<EventData, Error>` | — (view) | `EventNotFound(2)` |
| `get_category` | `event_id: u32, category_id: u32` | `Result<CategoryData, Error>` | — (view) | `CategoryNotFound(3)` |
| `get_organiser` | `event_id: u32` | `Result<Address, Error>` | — (view) | `EventNotFound(2)` |
| `is_organiser` | `addr: Address` | `bool` | — (view) | **never reverts** (`false` when not allowlisted) |
| `is_scanner` | `event_id: u32, addr: Address` | `bool` | — (view) | **never reverts** (`false` when absent) |
| `event_count` | — | `u32` | — (view) | **never reverts** (`0` when there are none) |
| `category_count` | `event_id: u32` | `u32` | — (view) | **never reverts** (`0` when there are none) |
| `get_addon` | `event_id: u32, addon_id: u32` | `Result<AddOnData, Error>` | — (view) | `AddOnNotFound(14)` |
| `addon_count` | `event_id: u32` | `u32` | — (view) | **never reverts** (`0` when there are none) |
| `get_registration_closes` | `event_id: u32` | `Result<Option<u64>, Error>` (unix seconds; `None` = closes manually only) | — (view) | `EventNotFound(2)` |

Important notes for D2/D3:

- **`get_category` on an `event_id` that does not exist returns `CategoryNotFound(3)`, not
  `EventNotFound(2)`.** It reads the `Category(event_id, category_id)` key directly without
  checking the event first. Do not use this error to tell "no such event" from "no such category" —
  use `get_event` for that.
- **`reserve_slot` cannot be called by an EOA.** Its gate is invoker-contract auth: the stored
  `RaceRecordAddr` address must authorize, and a contract address only authorizes implicitly when it
  is the *direct cross-contract caller*. RaceRecord does not implement `CustomAccountInterface`
  (`__check_auth`), so there is no signature an EOA could present for that address.
- **`set_race_record` is once and for all.** A second call reverts with `RaceRecordAlreadySet(7)`,
  so the trusted caller of `reserve_slot` cannot be swapped after wiring.
- The quota check and the increment happen **inside one invocation**, so two simultaneous entries
  cannot both take the last slot; the second reads the already-incremented `entered_count` and
  reverts with `QuotaFull(5)`. The same holds for `reserve_addon` and `AddOnQuotaFull(15)`.
- **`reserve_slot` returns a bib that is unique within the event and starts at 1** (v2.3). Every
  distance of an event draws from one sequence, so no two runners at a race share a number and
  nobody is given `0`. The number says nothing about the distance — see "What changed from v2.2.0"
  above for why, and for what a pre-v2.3 event does instead.
- **`reserve_addon` returns the PRICE, not a sequence number.** Its caller (`RaceRecord.enter`)
  needs the price in order to charge, and reading it through a second call would mean the amount
  charged and the unit taken come from two different reads. The unit's sequence number is still
  emitted in the `AddOnReserved` event (the `seq` field) for fulfilment purposes.
- **`add_addon` reuses `InvalidQuota(8)` and `InvalidPrice(9)`.** The conditions are identical to
  `add_category`'s (`quota == 0`, `price_usdc < 0`), so a new code would only force clients to
  distinguish the same thing twice. `price_usdc == 0` is legal: a free add-on with a quota is still
  bounded.
- **`create_event` has TWO gates, and they answer different questions.**
  `organiser.require_auth()` answers "does the caller hold this keypair"; the allowlist check
  answers "has the admin vetted this keypair". Without the second, `name` is a free-form `String`
  and the first gate happily admits a stranger who signs for their own address while naming their
  event "Jakarta Marathon 2026". `require_auth` comes first, so a caller who does not hold the key
  learns nothing about the allowlist's contents.
- **The allowlist is per-address and contract-wide, not per-event.** What it grants is the thing an
  organiser needs **before** they have an event. Per-event authority stays where it always was:
  `EventData.organiser`, read by `add_category`, `set_event_status`, `add_scanner`, and
  `record_finish` in C2. `is_organiser(addr)` does **not** answer "is addr the organiser of event
  X" — use `get_organiser(event_id)` for that.
- **`is_organiser` is not an enforcer.** It is the read a console uses to decide whether to show the
  "create event" form. A client that skips it still gets a revert, not an event.
- **The allowlist starts empty after an upgrade** (see "What changed from v2.0.1"), and
  `remove_organiser` revokes nothing from events already created.
- **`increase_quota` only ever raises the number** (v2.4). `new_quota` must be strictly greater
  than the category's current `quota`; equal and smaller both revert with `QuotaNotIncreased(19)`,
  under one code because they are one rule. A published quota is what runners paid against, and a
  shrink would put `entered_count` above its own `quota` — `reserve_slot` would then report
  `QuotaFull(5)` for a race that had been rewritten underneath entrants who are already on chain.
  Stopping registration is `set_event_status(Closed)`, which is reversible; this is not. The
  function reads and writes nothing else: `entered_count`, the event's bib counter, the price, the
  code and the distance are all untouched, and no storage key was added for it.
- **A client must not treat `quota` as fixed for the life of an event** (v2.4). It could not change
  before; it can now. `QuotaIncreased` carries `previous` **and** `current` precisely so that a
  second batch reads as a dated fact rather than as a denominator that moved between two of a
  client's own reads.
- **Raising a quota is an application-level promise as well as a write.** The contract cannot check
  whether the organiser announced the second batch, and a bigger field is a real change to what a
  runner bought. The console pairs the increase with a signed announcement (STE-34). Nothing here
  enforces that, and no client should be written as though it does.
- **`increase_quota` has no status gate**, on purpose. A `Closed` event is exactly where the
  second-batch flow puts it — lift the cap, then re-open — and on a `Cancelled` or `Completed` event
  the larger number sells nothing, because `reserve_slot` requires `Open`.
- **A registration close date is enforced by the ledger clock** (v2.5). From `closes_at` on —
  `env.ledger().timestamp() >= closes_at`, unix seconds — `reserve_slot` and `reserve_addon` revert
  `RegistrationClosed(20)`, so `RaceRecord.enter` does too. The status is checked **first**: a
  `Closed` event answers `EventNotOpen(4)` whatever its date. An event with no date is never refused
  by this rule, which is every event created before v2.5.
- **`set_registration_closes` moves the date either way** (v2.5). Earlier is closing early; a past
  date closes at once; later is an extension, and also the only way to reopen after the date — a
  status change alone does not. Setting the date the event already has changes nothing and emits
  nothing. There is no status gate (on a terminal event the date sells nothing either way) and no way
  to remove a date once set. The console pairs a later date with a signed announcement (STE-40); the
  contract does not check that, and no client should be written as though it does.
- **`get_registration_closes` reverts `EventNotFound(2)` for an unknown event** rather than answering
  `None`, which would read as "this race closes manually".
- **`upgrade` replaces this contract's wasm in place.** The address, storage and balances do not
  change; only the code does. It takes effect **after** the invocation finishes, so a storage
  migration needs a second call. The hash must already be uploaded to the ledger. See §4.

### 1.2 Types

```text
EventData {
  metadata_hash: BytesN<32>,
  name: String,
  organiser: Address,
  starts_at: u64,
  status: EventStatus,
  uri: String,
}

CategoryData {
  code: Symbol,
  distance_m: u32,
  entered_count: u32,   // slots taken in THIS distance; the quota counter, not the bib (v2.3)
  price_usdc: i128,     // 7-decimal representation
  quota: u32,           // raisable, never lowerable, via increase_quota (v2.4)
}

AddOnData {
  code: Symbol,
  price_usdc: i128,     // 7-decimal representation
  quota: u32,
  reserved_count: u32,  // units taken so far, never decreases
}

EventStatus = Draft | Open | Closed | Completed | Cancelled
```

> The field order above is the order **`contractspecv0` emits** (alphabetical), not the declaration
> order in Rust. That is simply how a `#[contracttype]` struct is encoded: as an `ScMap` **keyed by
> field name** and sorted. TypeScript clients never notice (the bindings handle it), but anyone
> parsing raw XDR should know the order is alphabetical.

The legal `EventStatus` transitions (anything else → `InvalidStatus(11)`, including a transition to
itself):

```text
Draft  -> Open | Closed | Cancelled
Open   -> Closed | Completed | Cancelled
Closed -> Open | Completed | Cancelled
Completed -> (terminal)
Cancelled -> (terminal)
```

`Cancelled` is **not** a synonym for `Closed`. `Closed` means entries are shut but the race still
happens, and the organiser may reopen it. `Cancelled` means the race is off, with no way back. Going
from `Completed` to `Cancelled` is deliberately **not** allowed: a race that was run and whose
results were published did happen. There are no on-chain refunds — that remains an off-chain promise
(`docs/SYSTEM_DESIGN.md` §11); the value of this status is that "cancelled" is recorded on the chain
rather than only in a banner on a website. `reserve_slot` and `reserve_addon` both demand `Open`, so
a cancelled event refuses new entries with `EventNotOpen(4)` without any extra guard.

### 1.3 Events (`#[contractevent]`)

Soroban's encoding: `topics = [Symbol(event name), ...fields marked #[topic] in declaration
order]`, `data = an ScMap` keyed by field name for the non-topic fields (**sorted
alphabetically**, not in declaration order), and an **empty** `ScMap` when every field is a topic.

| Event | Topics (in order) | Data (map, alphabetical) |
| --- | --- | --- |
| `EventCreated` | `"event_created"`, `event_id: u32`, `organiser: Address` | *(none)* |
| `CategoryAdded` | `"category_added"`, `event_id: u32` | `category_id: u32`, `price: i128`, `quota: u32` |
| `QuotaIncreased` | `"quota_increased"`, `event_id: u32`, `category_id: u32` | `current: u32`, `previous: u32` |
| `RegistrationClosesSet` | `"registration_closes_set"`, `event_id: u32` | `current: u64`, `previous: Option<u64>` |
| `AddOnAdded` | `"add_on_added"`, `event_id: u32` | `addon_id: u32`, `price: i128`, `quota: u32` |
| `EventStatusChanged` | `"event_status_changed"`, `event_id: u32` | `status: EventStatus` |
| `ScannerAdded` | `"scanner_added"`, `event_id: u32`, `scanner: Address` | *(none)* |
| `ScannerRemoved` | `"scanner_removed"`, `event_id: u32`, `scanner: Address` | *(none)* |
| `OrganiserAdded` | `"organiser_added"`, `organiser: Address` | *(none)* |
| `OrganiserRemoved` | `"organiser_removed"`, `organiser: Address` | *(none)* |
| `SlotReserved` | `"slot_reserved"`, `event_id: u32`, `category_id: u32` | `seq: u32` (the bib — event-wide and from 1 since v2.3; layout unchanged) |
| `AddOnReserved` | `"add_on_reserved"`, `event_id: u32`, `addon_id: u32` | `price: i128`, `seq: u32` |
| `ContractUpgraded` | `"contract_upgraded"`, `new_wasm_hash: BytesN<32>` | *(none)* |

A real XDR example (taken from the `emits_category_added` snapshot test, simplified):

```json
{
  "topics": [{"symbol": "category_added"}, {"u32": 0}],
  "data": {"map": [
    {"key": {"symbol": "category_id"}, "val": {"u32": 0}},
    {"key": {"symbol": "price"},       "val": {"i128": "50000000"}},
    {"key": {"symbol": "quota"},       "val": {"u32": 200}}
  ]}
}
```

Enum values appear as a vec holding a single symbol, e.g. `status: Open` →
`{"vec": [{"symbol": "Open"}]}`.

For STE-16 (the indexer): filter `getEvents` on the first topic (the event name) plus the `event_id`
topic for a per-event page. `CategoryAdded` deliberately does **not** make `category_id` a topic —
an event has few categories, so filtering per event is enough and a topic slot is saved. `AddOnAdded`
follows the same pattern; `AddOnReserved` **does** make `addon_id` a topic, because the question
there is "how many units of this add-on sold", not "what add-ons does this event have".

`QuotaIncreased` **does** make `category_id` a topic, unlike `CategoryAdded`, because the question
it answers is per distance — "did the 10K open a second batch" — and an indexer wants that page
without decoding every category event of the race. Both numbers travel in the data: `current` alone
would leave a consumer diffing against its own last read, which reports what the indexer saw rather
than what the chain did. Note the alphabetical data order, `current` before `previous`, which is the
`ScMap` wire order and not the declaration order.

`RegistrationClosesSet` carries both dates for the same reason as `QuotaIncreased`: "entries were
extended from the 20th to the 27th" is a dated fact, and a consumer should not diff against its own
last read to state it. `previous` is `None` (`ScVal::Void`) the first time a date is set. Setting the
date the event already has emits nothing, so every `RegistrationClosesSet` is a real move.

`OrganiserAdded` / `OrganiserRemoved` deliberately do **not** carry an `event_id`: the allowlist is
contract-wide, and the grant happens before its recipient has an event to name. An indexer wanting to
show "who may create events" filters on these two topic names alone.

Note the topic names: `AddOnReserved` → `"add_on_reserved"`, not `"addon_reserved"`. Soroban derives
an event's name from its struct name, and `AddOn` breaks into two words. Function arguments and
struct fields stay `addon_id` / `addon_ids` — genuinely inconsistent, and mentioned here precisely so
that nobody has to guess.

### 1.4 Errors (`#[contracterror]`, `repr(u32)`)

| Code | Name | When |
| ---: | --- | --- |
| 1 | `NotInitialized` | instance storage has no `Admin`/`EventCount` yet |
| 2 | `EventNotFound` | unknown `event_id` |
| 3 | `CategoryNotFound` | unknown `(event_id, category_id)` |
| 4 | `EventNotOpen` | `reserve_slot` while the status is ≠ `Open` |
| 5 | `QuotaFull` | `entered_count >= quota` |
| 6 | `RaceRecordNotSet` | `reserve_slot`/`get_race_record` before wiring |
| 7 | `RaceRecordAlreadySet` | `set_race_record` called a second time |
| 8 | `InvalidQuota` | `quota == 0` |
| 9 | `InvalidPrice` | `price_usdc < 0` |
| 10 | `InvalidDistance` | `distance_m == 0` |
| 11 | `InvalidStatus` | an illegal `EventStatus` transition (including to itself) |
| 12 | `ScannerAlreadyAdded` | the scanner is already on that event's allowlist |
| 13 | `ScannerNotFound` | `remove_scanner` for an address that is not there |
| 14 | `AddOnNotFound` | unknown `(event_id, addon_id)` |
| 15 | `AddOnQuotaFull` | `reserved_count >= quota` on an add-on |
| 16 | `OrganiserAlreadyAdded` | `add_organiser` for an address already on the allowlist |
| 17 | `OrganiserNotFound` | `remove_organiser` for an address that is not on the allowlist |
| 18 | `NotAllowlistedOrganiser` | `create_event` from an address the admin has not allowlisted |
| 19 | `QuotaNotIncreased` | `increase_quota` with a `new_quota` that is not strictly greater than the category's current `quota` |
| 20 | `RegistrationClosed` | `reserve_slot` / `reserve_addon` (and so `RaceRecord.enter`) at or after the event's registration close date, on an event that is otherwise `Open` |

---

## 2. RaceRecord (C2) — the public surface

One **non-transferable** record per entry, bound to the runner's address. Design:
`docs/SYSTEM_DESIGN.md` §3.2 (+ §5 for the lifecycle).

### 2.1 Functions

| Function | Arguments | Returns | Who must authorize | Possible errors |
| --- | --- | --- | --- | --- |
| `__constructor` | `admin: Address, registry: Address, token: Address, name: String, symbol: String, base_uri: String` | — | — (once, at deploy) | OZ `BaseUriMaxLenExceeded(211)`, `NameMaxLenExceeded(213)`, `SymbolMaxLenExceeded(214)` |
| `upgrade` | `new_wasm_hash: BytesN<32>` | `Result<(), Error>` | the stored **`Admin`** | `NotInitialized(100)`, plus a host error if the hash has not been uploaded |
| `enter` | `runner: Address, event_id: u32, category_id: u32, addon_ids: Vec<u32>, participant_hash: BytesN<32>` | `Result<u32, Error>` (token_id) | the **`runner`** — one auth tree that also covers the SEP-41 `transfer` sub-invocation | its own: `NotInitialized(100)`, `TooManyAddOns(106)`, `DuplicateAddOn(107)`; **propagated** from EventRegistry: `2,3,4,5,6,14,15`; from the SAC: the SAC's error codes; OZ: `MathOverflow(205)`, `TokenIDsAreDepleted(206)` |
| `claim_racepack` | `token_id: u32, operator: Address` | `Result<(), Error>` | the **`operator`**, who must be that event's organiser **or** an allowlisted scanner | `NotInitialized(100)`, `RecordNotFound(101)`, `NotAuthorized(104)`, `AlreadyClaimed(102)`, propagated `EventNotFound(2)` |
| `record_finish` | `token_id: u32, finish_time_s: u32` | `Result<(), Error>` | **that event's organiser** (read from the registry) | `NotInitialized(100)`, `RecordNotFound(101)`, `InvalidFinishTime(105)`, `InvalidState(103)`, propagated `EventNotFound(2)` |
| `record_finish_untimed` | `token_id: u32` | `Result<(), Error>` | **that event's organiser** (read from the registry) | `NotInitialized(100)`, `RecordNotFound(101)`, `InvalidState(103)`, propagated `EventNotFound(2)` |
| `record_dnf` | `token_id: u32` | `Result<(), Error>` | **that event's organiser** | `NotInitialized(100)`, `RecordNotFound(101)`, `InvalidState(103)`, propagated `EventNotFound(2)` |
| `extend_record_ttl` | `token_id: u32` | `Result<(), Error>` | **nobody — permissionless** | `RecordNotFound(101)` |
| `record_of` | `token_id: u32` | `Result<RecordData, Error>` | — (view) | `RecordNotFound(101)` |
| `records_of` | `runner: Address` | `Vec<u32>` | — (view) | **never reverts** (`[]` when empty) |
| `verify` | `token_id: u32, participant_hash: BytesN<32>` | `bool` | — (view) | **never reverts**; an unknown token → `false` |
| `owner_of` | `token_id: u32` | `Address` | — (view, OZ base) | OZ panic `NonExistentToken(200)` |
| `balance` | `owner: Address` | `u32` | — (view, OZ base) | — |
| `token_uri` | `token_id: u32` | `String` | — (view, OZ base) | `NonExistentToken(200)`, `UnsetMetadata(210)` |
| `total_supply` | — | `u32` | — (view, OZ enumerable) | — |
| `name` | — | `String` | — (view, collection metadata) | `UnsetMetadata(210)` |
| `symbol` | — | `String` | — (view, collection metadata) | `UnsetMetadata(210)` |
| `get_admin` | — | `Result<Address, Error>` | — (view) | `NotInitialized(100)` |
| `get_registry` | — | `Result<Address, Error>` | — (view) | `NotInitialized(100)` |
| `get_token` | — | `Result<Address, Error>` | — (view) | `NotInitialized(100)` |

Important notes for D2/D3:

- **`enter` is a single atomicity boundary.** Its order: `runner.require_auth()` → validate
  `addon_ids` (touching no state yet) → `reserve_slot` on the registry → one `reserve_addon` per
  `addon_id`, each returning its price → `transfer(runner, organiser, total)` on the SAC
  (**skipped when `total == 0`**) → `Enumerable::sequential_mint` → write
  `RecordData{state: Entered, addon_ids}`. If any step fails, all of it is undone: no quota slot or
  add-on unit is consumed without payment, and no record exists without its fee.
- **`total = category.price_usdc + Σ addon.price_usdc`, one transfer.** Not one transfer per item:
  the runner's wallet approves a single number, and that is the number that actually moves.
- **It is `total == 0` that skips the token call entirely**, not `price == 0`. A free category
  **plus** a paid add-on still charges. A free category plus free add-ons calls the token not at
  all — the runner needs no balance, and for a classic `G...` account, no trustline.
- **The `addon_ids` rules** (checked **before** any state is touched, so a rejection consumes no
  quota): at most **16** ids (`MAX_ADDONS_PER_ENTRY`), no more than `addon_count(event_id)`, and
  **no id twice**. The first two are `TooManyAddOns(106)`; a duplicate is `DuplicateAddOn(107)`.
  Wanting two jerseys means two add-ons with two quotas, not one id written twice. The order of
  `addon_ids` is preserved as-is in `RecordData`.
- **Send `[]` (an empty `Vec`) when buying nothing.** That is the v1 path unchanged: one transfer of
  the category price.
- **`verify` returns `true`** only when the record exists, the hash matches exactly, **and** the
  token still has an owner. How to compute a `participant_hash` this function will accept is in
  `docs/specs/HASH_AND_TOTP.md` — the value the backend hashes is exactly the one the chain receives
  (proven by the test `host_sha256_matches_every_participant_hash_vector` in
  `sc/contracts/race_record/src/test.rs`).
- **`claim_racepack` is the arbiter of "one pack per entry".** Its guard is `state == Entered`; a
  second scan (the same desk, or a second offline desk whose queue has only just been sent) gets
  `AlreadyClaimed(102)`. The scanner PWA's local roster check is a UX optimisation, not an enforcer.
- **`token` is a constructor parameter, not a constant.** Testnet points at the sUSD SAC, mainnet
  will point at Circle's USDC, with no code change. See §4.
- **`record_finish_untimed` is a twin of `record_finish` with no time** (v2.2). The same organiser
  gate (a scanner may check a runner in, but never publish a result), the same `RacepackClaimed`
  guard, the same terminal `Finished`. It leaves `finish_time_s` as `None` and writes `result_at`.
  It has no `finish_time_s` argument, so it cannot revert `InvalidFinishTime(105)`.
- **How to read a result:** `Finished` + `finish_time_s: Some(t)` is an official time of `t`
  seconds; `Finished` + `finish_time_s: None` is **finished with no official time** (declared by the
  organiser); `Dnf` is did-not-finish or no-show. A result is never rewritten — an untimed finish
  cannot later be given a time, and a timed one cannot be erased into "no time".

### 2.2 Types

```text
RecordData {
  addon_ids: Vec<u32>,           // add-ons bought by this entry, in reservation order
  bib_no: u32,                   // the bib from reserve_slot: unique in the event, from 1 (v2.3)
  category_id: u32,
  claimed_at: Option<u64>,
  entered_at: u64,
  event_id: u32,
  finish_time_s: Option<u32>,    // None on a Finished record = finished, no official time (v2.2)
  participant_hash: BytesN<32>,
  result_at: Option<u64>,
  state: RecordState,
}

RecordState = Entered | RacepackClaimed | Finished | Dnf
```

The lifecycle (anything outside it → `InvalidState(103)` / `AlreadyClaimed(102)`):

```text
(mint)  -> Entered
Entered -> RacepackClaimed   (claim_racepack, organiser/scanner)
Entered -> Dnf               (record_dnf, organiser — no-show)
RacepackClaimed -> Finished  (record_finish, organiser — finish_time_s = Some(t))
RacepackClaimed -> Finished  (record_finish_untimed, organiser — finish_time_s = None, v2.2)
RacepackClaimed -> Dnf       (record_dnf, organiser)
Finished, Dnf                (terminal, no way out)
```

`record_finish` and `record_finish_untimed` both **refuse** a record that is not yet
`RacepackClaimed`: a runner who never collected their race pack cannot have a result.

### 2.3 Events (`#[contractevent]`)

| Event | Topics (in order) | Data (map, alphabetical) |
| --- | --- | --- |
| `Mint` *(from OZ, during `enter`)* | `"mint"`, `to: Address` | `token_id: u32` |
| `RecordEntered` | `"record_entered"`, `runner: Address`, `event_id: u32` | `bib_no: u32`, `token_id: u32` |
| `RacepackClaimed` | `"racepack_claimed"`, `token_id: u32`, `event_id: u32` | `operator: Address` |
| `RecordFinished` | `"record_finished"`, `token_id: u32`, `event_id: u32` | `finish_time_s: u32` |
| `RecordFinishedUntimed` | `"record_finished_untimed"`, `token_id: u32`, `event_id: u32` | *(none)* |
| `RecordDnf` | `"record_dnf"`, `token_id: u32`, `event_id: u32` | *(none)* |
| `ContractUpgraded` | `"contract_upgraded"`, `new_wasm_hash: BytesN<32>` | *(none)* |

**`Mint` is part of the frozen surface.** It is emitted by `Enumerable::sequential_mint` inside OZ
rather than by our code, but the indexer sees it anyway and its order is deterministic: `Mint` always
comes **before** `RecordEntered` within the same `enter` invocation.

One successful `enter` emits, in order and from three different emitters:

1. `slot_reserved` — **the EventRegistry contract id**
2. `add_on_reserved` × the number of add-ons — **the EventRegistry contract id** (v2; absent when
   `addon_ids` is empty), in `addon_ids` order
3. `transfer` — **the SAC contract id** (only when `total > 0`)
4. `mint` — the RaceRecord contract id
5. `record_entered` — the RaceRecord contract id

An indexer must filter **per contract id**, not at a fixed offset: the number of events in one
`enter` now depends on how many add-ons were bought and whether the total was zero.

**A finish emits exactly one of `record_finished` or `record_finished_untimed`, never both** (v2.2).
`record_finished_untimed` is a new name rather than `record_finished` with a `0`, so an indexer
filtering on `"record_finished"` keeps seeing only real times. To index every finish, subscribe to
both names; the untimed one carries no data (its `ScMap` is empty, the same shape as `record_dnf`).

**`record_entered` does not carry `addon_ids`.** The add-ons bought are read from `record_of` (the
`addon_ids` field) or reconstructed from the registry's `add_on_reserved`, which is in fact richer —
it carries each unit's `seq` and the `price` actually charged.

### 2.4 Errors (`#[contracterror]`, `repr(u32)`)

| Code | Name | When |
| ---: | --- | --- |
| 100 | `NotInitialized` | the instance wiring (`Admin`/`RegistryAddr`/`TokenAddr`) is absent |
| 101 | `RecordNotFound` | unknown `token_id` |
| 102 | `AlreadyClaimed` | `claim_racepack` while the state is ≠ `Entered` — the anti-double-race-pack guard |
| 103 | `InvalidState` | `record_finish` / `record_finish_untimed` while the state is ≠ `RacepackClaimed`, or leaving a terminal state |
| 104 | `NotAuthorized` | the operator is neither the organiser nor an allowlisted scanner |
| 105 | `InvalidFinishTime` | `finish_time_s == 0` |
| 106 | `TooManyAddOns` | `addon_ids` is longer than `addon_count(event_id)` or than 16 |
| 107 | `DuplicateAddOn` | `addon_ids` holds the same id twice |

Plus the OZ enum embedded in RaceRecord's spec (not ours, do not reuse):

| Code | Name |
| ---: | --- |
| 200 | `NonExistentToken` |
| 201 | `IncorrectOwner` |
| 202 | `InsufficientApproval` |
| 203 | `InvalidApprover` |
| 204 | `InvalidLiveUntilLedger` |
| 205 | `MathOverflow` |
| 206 | `TokenIDsAreDepleted` |
| 207 | `InvalidAmount` |
| 208 | `TokenNotFoundInOwnerList` |
| 209 | `TokenNotFoundInGlobalList` |
| 210 | `UnsetMetadata` |
| 211 | `BaseUriMaxLenExceeded` |
| 212 | `InvalidRoyaltyAmount` |
| 213 | `NameMaxLenExceeded` |
| 214 | `SymbolMaxLenExceeded` |

---

## 3. The error-code band convention (MANDATORY)

| Band | Owner |
| --- | --- |
| `1..=99` | EventRegistry (C1) |
| `100..=199` | RaceRecord (C2) |
| `200+` | OpenZeppelin `NonFungibleTokenError` (200–214 in `stellar-tokens 0.7.2`) |
| the next multiple of 100 | a new contract |

**Why these bands exist.** A Soroban `ScError` carries a bare `u32` and **carries no contract
identity**. `enter` calls EventRegistry and the SAC cross-contract, and their reverts propagate to
the caller unchanged. Without disjoint bands, an `Error(Contract, #4)` coming out of `enter` could
mean `EventRegistry::EventNotOpen` **or** `RaceRecord::InvalidState`, and the D2 SDK would have to
guess. With bands, **the number itself names its origin**: `#4` is certainly C1, `#103` is certainly
C2, `#200+` is certainly OZ.

A concrete example James and Ancung will meet: `enter` on an event that is not yet `Open` fails with
`Error(Contract, #4)` — that is EventRegistry's `EventNotOpen`, not a RaceRecord error.

Enforced mechanically by the test `error_codes_of_the_two_contracts_are_disjoint_bands` in
`sc/contracts/race_record/src/test.rs`: the build fails if the bands ever overlap again.

**Error codes are public ABI.** Once this freeze is merged, codes must not be renumbered, and a
removed variant's number must not be reused. New variants take the next free number inside their
contract's band.

---

## 4. Non-transferable: the functions DO NOT EXIST — and what that means now v2 is upgradeable

**RaceRecord does not export `transfer`, `transfer_from`, `approve`, `approve_for_all`, `burn` or
`burn_from`.** That is what makes a record unable to change hands — not a guard that reverts, but
the absence of any exported code path that rewrites the owner mapping. A guard can be misconfigured;
a function that does not exist cannot be called.

**v2 adds `upgrade`, and that changes the shape of the guarantee. Do not read it as unchanged:**

| | v1 (live, non-upgradeable) | v2 |
| --- | --- | --- |
| Mechanically guaranteed | the deployed wasm has no function that moves a record — **forever, for that address** | the deployed wasm has no function that moves a record — **for the code installed right now** |
| Taken on trust | nothing | **that the admin key does not install wasm that adds one** |
| How to check it | `check-exports.sh` + the wasm test + checking the live contract at deploy time | exactly the same, plus a `contract_upgraded` in the ledger every time the code changes |

The alternative was to freeze RaceRecord while EventRegistry gained add-ons — meaning the next change
to `enter` would need a new address again. That is a trade taken knowingly, and `ContractUpgraded`
exists so that a code change under an unchanged address stays visible on the chain.

Technically: a Soroban contract exposes exactly the functions in its `#[contractimpl]` — there is no
fallback dispatch and no `delegatecall`. OZ's non-fungible module separates the *storage primitives*
(`Base::mint`, `Base::owner_of`, `Base::balance`, `Base::token_uri`,
`Enumerable::sequential_mint`) from the public `NonFungibleToken` / `NonFungibleEnumerable` traits
that would export those forbidden functions. RaceRecord **does not implement those traits** and only
calls the storage primitives.

RaceRecord's legitimate export surface — **20 functions, no more** (v2.2 added
`record_finish_untimed`, which writes a record's state and never its owner):

```text
__constructor  upgrade  enter  claim_racepack  record_finish  record_finish_untimed  record_dnf
extend_record_ttl  record_of  records_of  verify  owner_of  balance  token_uri  total_supply
name  symbol  get_admin  get_registry  get_token
```

Enforced from two sides, both of which must be green before a PR or a deploy:

1. **`sc/scripts/check-exports.sh`** — build, `stellar contract info interface`, then grep. It exits
   non-zero if a forbidden name appears, if EventRegistry's surface leaks into RaceRecord, or if the
   wasm exceeds 128KB. `upgrade` is deliberately **not** on the "EventRegistry surface" list: both
   contracts have their own `upgrade`, so finding it here is correct rather than a leak.
2. **`cargo test`** — the test `exports::race_record_wasm_exports_nothing_that_could_move_a_record`
   parses the wasm's export section directly (not the source).

`burn` is deliberately absent too: a running history is append-only. Its privacy consequence is
acknowledged openly in `docs/SYSTEM_DESIGN.md` §11, point 2.

---

## 5. The payment token (SEP-41 / SAC)

`RaceRecord.__constructor` takes a `token: Address` and stores it in instance storage
(`DataKey::TokenAddr`, read through `get_token`). **Not a constant inside the code.**

| Network | Asset | Address |
| --- | --- | --- |
| testnet | sUSD (Sterun USD), issued by us | `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` |
| mainnet (later) | USDC (Circle) | *(configured at mainnet deploy — does not exist yet)* |

The full sUSD details (issuer, distributor, issuance transactions, SEP-41 verification, how to get a
trustline) are in **`docs/deployments.md`**, which arrived with the STE-30 branch
(`ops/26-issue-susd-deploy-sac`) and **was not yet merged when this STE-10 branch was created** — so
if that file is not in your working tree, that is why, not a typo. The SAC address in the table above
is copied verbatim from there and is already live on testnet. Explorer:
<https://stellar.expert/explorer/testnet/contract/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU>

Both are classic Stellar assets with **7 decimals** exposed to contracts through a SAC, so swapping
sUSD for USDC only changes a config value at deploy time. No contract logic changes, no interface
changes, no regenerated bindings.

`price_usdc` in `CategoryData` **and `AddOnData`** is an `i128` in a 7-decimal representation
(e.g. 5.00 sUSD = `50000000`). What actually moves in one `enter` is the **sum**:
`category.price_usdc + Σ addon.price_usdc`.

---

## 6. Who consumes this freeze

| Ticket | Component | What it uses |
| --- | --- | --- |
| STE-11 | PII vault + backend hash/salt (James) | `docs/specs/HASH_AND_TOTP.md`, `verify`, `enter` |
| STE-14 | TS bindings (Axel) | this whole document — the bindings are generated from the same wasm |
| STE-15 | `SterunClient` (James) | function signatures + error codes + bands |
| STE-16 | Indexer (James) | §1.3 and §2.3 — topic/data shapes + emission order |
| STE-17 | Organiser console (Ancung) | `create_event`, `add_category`, `set_event_status`, scanners, `record_finish` |
| STE-18 / 21 / 22 | QR pass + scanner PWA (Ancung) | `claim_racepack`, `is_scanner`, `record_of`, plus TOTP in `HASH_AND_TOTP.md` |
| STE-33 | Testnet deploy | wasm hashes + constructor parameters (§0, §5) |
| STE-35 | Paid add-ons (Ancung) | `add_addon`, `get_addon`, `addon_count`, `enter(addon_ids)`, `AddOnReserved` |
| STE-41 | Untimed finish | `record_finish_untimed`, `RecordFinishedUntimed`, and `finish_time_s == None` on a `Finished` record — consumed by the `be/` indexer + CSV (James) and the `fe/` profile (Ancung) |
| STE-46 | Registration closes on its own | `set_registration_closes`, `get_registration_closes`, `RegistrationClosesSet`, `RegistrationClosed(20)` — consumed by the `be/` indexer and the SDK (James) and the `fe/` wizard, console header and "Reopen and extend" flow, which must pair a later date with a signed announcement (Ancung) |
| STE-55 | Raising a sold-out quota | `increase_quota`, `QuotaIncreased`, `QuotaNotIncreased(19)` — consumed by the `be/` indexer (James) and the `fe/` console's "add capacity" flow, which must pair it with a signed announcement (Ancung) |

---

## 7. The rules for changing this

Once this STE-10 PR is merged, **every** change to:

- a function signature (name, arguments, types, order, return),
- a `#[contractevent]` layout (event name, which fields are topics, their order),
- an error code or name,
- the definition of `participant_hash` / TOTP,

must go through:

1. **A new PR** approved by **Axel (PM) + fable (AI co-PM)**. No self-merges.
2. **An entry in `docs/specs/CHANGELOG.md`** with the new version + date + reason + impact.
3. **Regenerated TS bindings (STE-14)** and a version bump, because every D2/D3 consumer holds a
   generated copy.
4. For a hash/TOTP change: **`bash docs/specs/verify.sh` must stay green**, and any existing vector
   whose meaning changed must be called out explicitly in the changelog (not quietly regenerated).

Error codes are **never renumbered**. Adding a new variant is fine; changing an old variant's number
is not.

## 8. Client migration checklist for v2 — DONE

The v2 contracts are live (their addresses are in `docs/deployments.md`) and `be/`, `fe/` and `sdk/`
now run against them. This checklist was deliberately not done as part of the contract PR — that is
James's and Ancung's code — so it was recorded here rather than being discovered through a runtime
error. It is kept as a record of what the migration touched.

| Package | What had to change | If it had not |
| --- | --- | --- |
| `sdk/` | ~~`EventStatus` accepts `"Cancelled"`~~ — **done** | — |
| `sdk/` | ~~`EnterArgs.addOnIds` passed through to `enter`~~ — **done** | — |
| `sdk/` | ~~Add-on methods on `SterunClient`~~ — **done (STE-37)**: `addAddon`, `getAddon`, `listAddOns`, `addonCount`, and the `SterunAddOn` type | — |
| `be/` | ~~`EVENT_STATUSES` + the `directory.ts` JSON schemas~~ — **done**, plus the `events_status_check` CHECK constraint (migration 006) this row originally failed to mention | — |
| `be/` | ~~the v2 addresses~~ — **done**: `be/` and `fe/` point at the v2 pair, the index and vault were truncated | — |
| `be/` | optional: index `add_on_reserved` for add-on sales reporting | no add-on data in the roster |
| `fe/` | ~~`EventStatusBadge` needs a colour for `Cancelled`~~ — **done** | — |
| `fe/` | add-on selection UI in the entry flow (STE-21) | add-ons cannot be bought through the web app |
| `fe/` | add-on price + quota UI in the organiser console (STE-17) | the console stays on the v1 model: add-ons as a description, with no price and no stock |

> **The `fe/` rows had a prerequisite that was not written down here, and it was blocking STE-21
> quietly.** To show selectable add-ons, `fe/` has to be able to **read** an event's add-ons — and
> until STE-37 `SterunClient` had no add-on method at all. It was not only creating them that was
> blocked; reading them was too. What hid this: `sdk/vendor/event-registry.ts` **has** every
> function, so it looks ready at a glance — but that is an automatic cast of the wasm, not a surface
> anyone may use (`registry` and `record` are private, and the bindings are not exported from
> `src/index.ts`).
>
> Now available:
>
> ```ts
> const addOns = await sterun.listAddOns(eventId);   // SterunAddOn[]
> // { addonId, code, priceStroops, quota, reservedCount, unitsLeft }
> await sterun.enter({ runner, eventId, categoryId, addOnIds: [0, 2], participantHash }, asRunner);
> ```
>
> `reserve_addon` is **not** wrapped and will not be: it calls `race_record.require_auth()`, so it is
> an inter-contract step inside `enter` rather than something a client may call. Wrapping it would
> only give people a way to call something that always reverts.

`be/` decodes `RecordData` by field name, so the new `addon_ids` does **not** break it — the field is
simply ignored until something uses it.
