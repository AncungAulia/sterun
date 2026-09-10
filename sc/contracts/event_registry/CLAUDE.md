# `event_registry` — C1 (CLAUDE.md)

The organiser-facing registry for running events. **One instance serves every event.** The
authoritative design: `docs/SYSTEM_DESIGN.md` §3.1. The frozen interface: `docs/specs/INTERFACE.md`
§1.

## What is stored (`DataKey`)

| Key | Storage | Contents |
| --- | --- | --- |
| `Admin` | instance | `Address` |
| `RaceRecordAddr` | instance | `Address` — **one-shot**, see below |
| `EventCount` | instance | `u32` |
| `Event(event_id)` | persistent | `EventData` |
| `Category(event_id, category_id)` | persistent | `CategoryData` |
| `CategoryCount(event_id)` | persistent | `u32` |
| `Scanner(event_id, scanner)` | persistent | `bool` |
| `AddOn(event_id, addon_id)` | persistent | `AddOnData` (v2) |
| `AddOnCount(event_id)` | persistent | `u32` (v2) |
| `Organiser(organiser)` | persistent | `bool` (v2.1) — the admin's allowlist, **contract-wide** |

`DataKey` is **not** documented in `INTERFACE.md`: it is a storage schema, not a surface clients
call. `check-interface.mjs` records it as `internalTypes`, so any **new** `#[contracttype]` that
appears turns the gate red — deliberately, so that a new public type forces a spec PR.

**Since v2 this table is APPEND-ONLY forever.** The contract is upgradeable, so new code will read
entries written by old code. A `DataKey` variant is transmitted as its **name**, so appending a
variant at the end is safe; deleting one, renaming one, or changing its value type orphans the old
entries with no error at all. The full rules and their reasoning: `sc/CLAUDE.md`.

## Seven things that are easy to break

1. **`set_race_record` is one-shot.** A second call is refused (`RaceRecordAlreadySet = 7`). The
   reason: that address is the only trusted caller of `reserve_slot`. If it could be swapped, a
   compromised admin could point it at another contract and mint slots without paying. Its wiring is
   STE-33's business.
2. **`reserve_slot` may only be called by RaceRecord.** Its gate is invoker-contract auth on the root
   frame. **`mock_all_auths()` cannot prove this gate** (recording mode satisfies `require_auth` for
   any address, contract addresses included) — use `env.mock_auths(&[...])`.
3. **`entered_count` doubles as the bib number.** `reserve_slot` increments it and returns the value
   as `seq`. So touching how that counter advances means changing bib numbers already printed into
   on-chain records. That is not a refactor, it is a data change.
4. **`EventStatus` transitions.** `Draft → Open → Closed → Completed`, with `Closed ↔ Open` allowed
   (an organiser can reopen entries) and `Completed` **terminal**. An illegal transition is
   `InvalidStatus = 11`. **v2** adds `Cancelled`: allowed from `Draft`/`Open`/`Closed`, terminal, and
   **not** allowed from `Completed` — a race that was run and whose results were published did
   happen. `Cancelled` ≠ `Closed`: `Closed` means "entries shut, the race goes ahead, can be
   reopened". There are no on-chain refunds; the value is that "cancelled" is recorded on the chain.
5. **`reserve_addon` returns the PRICE, not a `seq`.** (v2) Its caller is `RaceRecord.enter`, which
   needs the number in order to charge. Reading it through a second call would mean the amount
   charged and the unit taken come from two different reads. The unit's `seq` is still emitted in the
   `AddOnReserved` event for fulfilment. Changing its return value changes how `enter` charges.
6. **`create_event` has TWO gates.** (v2.1, STE-36) `organiser.require_auth()` answers "does the
   caller hold this keypair"; `is_organiser` answers "has the admin vetted this keypair". `name` is a
   free-form `String`, so without the second gate anyone could publish "Jakarta Marathon 2026". What
   to remember when touching it:
   - the allowlist is **contract-wide**, not per-event, and **admin-gated**, not organiser-gated.
     What it grants is the thing an organiser needs *before* they have an event. Per-event authority
     stays in `EventData.organiser`;
   - `remove_organiser` is **forward-only**: events already created stay with their organiser, along
     with every power they have here and in C2. Cancelling a race whose entries have sold is not the
     work of one storage write;
   - after an `upgrade`, the allowlist is **empty**. There is no migration. Until the admin calls
     `add_organiser`, no `create_event` succeeds — that is a deploy step, not an afterthought.

7. **`reserved_count` never decreases.** Cancelling an event does not "return" jerseys already sold,
   because the refund is off-chain. If that ever changes, it is a new feature with a new function —
   not a counter quietly decremented.

## Error codes — band `1..=99`, never renumbered

`NotInitialized=1`, `EventNotFound=2`, `CategoryNotFound=3`, `EventNotOpen=4`, `QuotaFull=5`,
`RaceRecordNotSet=6`, `RaceRecordAlreadySet=7`, `InvalidQuota=8`, `InvalidPrice=9`,
`InvalidDistance=10`, `InvalidStatus=11`, `ScannerAlreadyAdded=12`, `ScannerNotFound=13`,
`AddOnNotFound=14`, `AddOnQuotaFull=15`, `OrganiserAlreadyAdded=16`, `OrganiserNotFound=17`,
`NotAllowlistedOrganiser=18`.

`add_addon` **reuses** `InvalidQuota=8` and `InvalidPrice=9` — its conditions are exactly
`add_category`'s (`quota == 0`, `price < 0`), and a new code would only force clients to distinguish
the same thing twice.

The numbers 4 and 5 are the ones clients see most, because `RaceRecord.enter` cross-calls here and
its reverts propagate unchanged: an `Error(Contract, #4)` out of `enter` is **C1's** `EventNotOpen`,
not a C2 error. That is what the bands are for.

## The events emitted

`EventCreated`, `CategoryAdded`, `EventStatusChanged`, `ScannerAdded`, `ScannerRemoved`,
`SlotReserved`, plus in v2: `AddOnAdded`, `AddOnReserved`, `ContractUpgraded`, plus in v2.1:
`OrganiserAdded`, `OrganiserRemoved` (their topics carry **no** `event_id` — the allowlist is
contract-wide).

Topic names derive from struct names, and `AddOn` breaks into two words:
`AddOnReserved` → `"add_on_reserved"`, **not** `"addon_reserved"`. Function arguments stay
`addon_id`. Inconsistent, yes — do not guess, check `INTERFACE.md` §1.3.

The topic-versus-data layout is **frozen** in `INTERFACE.md` §1.3, and that is what the STE-16
indexer filters on. Remember: the `data` field is an `ScMap` keyed by field name, so its wire order
is **alphabetical**, not declaration order. It is `#[topic]` that keeps declaration order.

## Tests

`src/test.rs`, 66 tests, `lib.rs` coverage 98%. Every revert path has its own test. If you add a
`pub fn` or an error variant, add **positive + negative + edge** with it — `cargo test` is not a
place for happy paths alone.

`mod upgrade` deploys the registry **from wasm** (`env.register(bytes, args)`), because
`update_current_contract_wasm` can only replace an executable that genuinely exists. So
`stellar contract build` is not merely advice here: stale wasm means the upgrade tests are testing
yesterday's code.

One test there does not use the local build as its "old code":
`state_written_by_the_live_wasm_survives_the_allowlist_upgrade` deploys the wasm that was
**genuinely live** before STE-36 (`testdata/event_registry_live_pre_allowlist.wasm`, `22bb432e…`),
writes an event/category/add-on/scanner/bib with it, then upgrades to the current build. That is the
only pair that can prove `DataKey::Organiser` was added safely. The rules for replacing that fixture
are in `testdata/README.md`.

```bash
cd sc && stellar contract build && cargo test -p event_registry
```
