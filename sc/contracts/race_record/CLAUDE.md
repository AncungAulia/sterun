# `race_record` — C2 (CLAUDE.md)

The **non-transferable** race record and its lifecycle. The authoritative design:
`docs/SYSTEM_DESIGN.md` §3.2. The frozen interface: `docs/specs/INTERFACE.md` §2.

## The product claim the whole of Sterun rests on

> A race record cannot change hands.

That is **not** held up by a guard that could be misconfigured. It is true because
`race_record.wasm` **exports no function** that could move one. A Soroban contract has only the
functions on its export surface — there is no fallback dispatch and no delegatecall.

**Since v2 that sentence has a limit, and it must not be copied without it.** This contract now has
an `upgrade`, so:

| | Mechanically guaranteed | Taken on trust |
| --- | --- | --- |
| v1 (live, non-upgradeable) | its wasm has no function that moves a record, **forever** | — |
| v2 | the wasm **installed right now** has no function that moves a record | that the admin key does not install wasm which adds one |

What is checked stays exactly the same (`check-exports.sh`, the wasm test, checking the live
contract at deploy time), plus a `contract_upgraded` in the ledger every time the code changes. If
you restate this claim in a README, on the landing page, or in grant material: **write the v2
version**, not the v1 one.

How it is done: use only OpenZeppelin's *storage primitives* (`Base::mint`, `Base::owner_of`,
`Base::balance`, `Base::token_uri`, `Enumerable::sequential_mint`) and do **not** implement the
`NonFungibleToken` / `NonFungibleEnumerable` traits — those traits are what would export `transfer`,
`transfer_from`, `approve`, `approve_for_all`, `burn` and `burn_from`.

**If you implement one of those traits, the product's claim becomes a lie.** Guarded from two sides:
`scripts/check-exports.sh` (grepping the built interface) and the `exports::…` test in `src/test.rs`
(parsing the wasm's export section directly). Both run in CI.

The legitimate export surface — **20 functions**: `__constructor`, `upgrade`, `enter`,
`claim_racepack`, `record_finish`, `record_finish_untimed` (v2.2), `record_dnf`,
`extend_record_ttl`, `record_of`, `records_of`, `verify`, `owner_of`, `balance`, `token_uri`,
`total_supply`, `name`, `symbol`, `get_admin`, `get_registry`, `get_token`.

`upgrade` is deliberately **not** on the "leaked EventRegistry surface" list in
`check-exports.sh`: both contracts have their own `upgrade`, so finding it here is correct rather
than a leak.

## `enter` — one invocation, four effects, and the order matters

```
validate addon_ids (touching no state yet)
  →  reserve_slot (C1)
  →  reserve_addon (C1) × the number of add-ons, each returning its price
  →  transfer sUSD (the SAC, only when the TOTAL > 0)
  →  sequential_mint + write_record
```

**Quota before money.** A closed event, a full category, or a sold-out add-on fails before a single
stroop moves, and the runner loses only the fee of a failed transaction — not their money. Reversing
this order would mean taking the money and then possibly refusing the slot.

All of it is atomic because it is one invocation: a failed payment rolls back the category quota,
**every add-on unit taken in the same call**, and the mint. The tests
`a_failed_payment_rolls_back_quota_and_mint`,
`a_failed_payment_rolls_back_the_add_on_reservations_too` and
`a_sold_out_add_on_rolls_back_the_slot_the_fee_and_the_mint` guard it.

**One transfer for the whole basket**, not one per item: the runner's wallet approves a single
number, and that is the number that actually moves. What decides whether the token is called at all
is the **total**, not the category price — a free category plus a paid add-on still charges.

The `addon_ids` rules (checked before state is touched, so a rejection consumes no quota): at most
`MAX_ADDONS_PER_ENTRY` (16), no more than `addon_count(event_id)`, and no id twice. Those two bounds
are **not** redundant: the second keeps the loop short for a sane event, the first keeps it bounded
whatever an organiser publishes. Duplicates are refused (`DuplicateAddOn = 107`) because they would
take two units of stock while the record noted one.

Its event emission is **frozen and ordered** too (`INTERFACE.md` §2.3), from **three different
emitters**:

| # | Event | Emitter |
| --- | --- | --- |
| 1 | `slot_reserved` | EventRegistry |
| 2 | `add_on_reserved` × the number of add-ons | EventRegistry — absent when `addon_ids` is empty |
| 3 | `transfer` | the sUSD SAC — **only** when `total > 0` |
| 4 | `mint` | RaceRecord |
| 5 | `record_entered` | RaceRecord |

The STE-16 indexer must key on **contract id**, not on a fixed offset: the number of events in one
`enter` now depends on how many add-ons were bought and whether the total was zero. The tests
`enter_emits_four_events_from_three_emitters_in_the_frozen_order` and
`an_entry_with_add_ons_emits_one_addon_reserved_per_unit_before_the_transfer` exercise those shapes.

`record_entered` does **not** carry `addon_ids`. What was bought is read from `record_of`, or from
the registry's `add_on_reserved` — which is in fact richer, carrying each unit's `seq` and the
`price` actually charged.

## The lifecycle

`Entered → RacepackClaimed → Finished` or `→ Dnf`. `Finished` and `Dnf` are terminal.

**The anti-double-race-pack guard lives in `claim_racepack`**: the state must be exactly `Entered`.
A second scan — from the same desk, or from a second offline desk whose queue drained later — finds
`RacepackClaimed` and reverts with `AlreadyClaimed` (102). What makes "one pack per entry" true is
the **chain**, not volunteer discipline.

`record_finish` refuses a record that is not yet `RacepackClaimed` (`InvalidState` 103): you cannot
finish a race whose race pack was never collected.

### Two ways to finish, one of them with no time (v2.2, STE-41)

| Call | Record afterwards | Event |
| --- | --- | --- |
| `record_finish(id, t)`, `t > 0` | `Finished`, `finish_time_s: Some(t)` | `record_finished` (data `finish_time_s`) |
| `record_finish_untimed(id)` | `Finished`, `finish_time_s: None` | `record_finished_untimed` (no data) |

`record_finish_untimed` exists for events without chip timing, and it is a deliberate **twin** of
`record_finish`: the same organiser gate (`auth_organiser`, so a scanner cannot publish a result),
the same `RacepackClaimed` guard, the same terminal `Finished`. **`Finished` + `None` is the
marker for "finished, no official time"** — it could not exist before v2.2.

Rules that keep that marker trustworthy — do not "simplify" them away:

- **Never make `record_finish` accept `0`**, and never reuse `RecordFinished` for untimed finishes.
  `RecordFinished.finish_time_s` is a bare `u32`; every consumer already decoding it would read `0`
  as a zero-second race. That was option B in STE-41, and it was rejected for exactly this reason.
- **No storage change was needed or made**: `finish_time_s` has been `Option<u32>` since v1. Keep it
  that way — see "`RecordData` must never gain another REQUIRED field" below.
- A result is never rewritten: an untimed finish cannot later be given a time, and a timed one cannot
  be erased into "no time" (`an_untimed_finish_is_terminal`,
  `record_finish_untimed_rejects_terminal_states`).

## Error codes — band `100..=199`, never renumbered

`NotInitialized=100`, `RecordNotFound=101`, `AlreadyClaimed=102`, `InvalidState=103`,
`NotAuthorized=104`, `InvalidFinishTime=105`, `TooManyAddOns=106`, `DuplicateAddOn=107`.
OZ's `NonFungibleTokenError` occupies `200..=214`.

An error outside those two bands coming out of a function of this contract is **not** this
contract's error — it propagated from EventRegistry (`1..=99`) or from the SAC.

## How to call EventRegistry

**Do not** make `event_registry` an ordinary `[dependencies]` entry — its `__constructor` symbol
collides (see `sc/CLAUDE.md`). What is used instead: a local `#[contractclient]` trait in
`src/registry.rs` with only the 6 functions actually needed (`reserve_slot`, `reserve_addon`,
`addon_count`, `get_category`, `get_organiser`, `is_scanner`) plus a mirrored
`#[contracttype] CategoryData` with **identical field names**. `event_registry` stays as a
`[dev-dependencies]` entry so tests can register a real registry in the same `Env`.

That mirror could drift from C1 silently — the test
`mirrored_category_data_decodes_the_registrys_own_struct` is what guards it. `registry.rs` shows as
0% in the coverage report and that is **correct**: it is macro input with no body, which is why it is
not gated.

## `participant_hash` and `verify`

On chain there is only the hash, **never** PII. Its byte-exact definition is frozen in
`docs/specs/HASH_AND_TOTP.md`, and two tests in `src/test.rs`
(`host_sha256_matches_every_participant_hash_vector`,
`every_participant_hash_vector_is_accepted_by_enter_and_verify`) read the **same vector file** as the
reference implementations. So if the spec and the contract ever diverge, `cargo test` goes red first
— rather than it being discovered in production.

## TTL

`extend_record_ttl` is **permissionless**: anyone may pay to extend the life of someone else's
record. That is deliberate — an archived record cannot be verified, and a runner must not lose their
evidence merely for holding no XLM. The STE-12 keeper job calls it on a schedule.

## Tests

`src/test.rs`, 72 tests, `lib.rs` coverage 97% region / 99% line.

`mod upgrade` deploys RaceRecord **from wasm**, so `stellar contract build` has to run first — and
its World builds its own registry, because `set_race_record` is one-shot.

`records_written_by_the_live_wasm_survive_the_untimed_upgrade` starts from
`testdata/race_record_live_pre_untimed.wasm` — the executable that was genuinely live at `CCVW7WVC…`
before STE-41 — and checks its own fixture against the hash the ledger reported. It is the "before"
of the **next** upgrade too: when you ship one, fetch the then-live wasm with
`stellar contract fetch` first (provenance and rules in `testdata/README.md`).

**`RecordData` must never gain another REQUIRED field.** A `#[contracttype]` struct is a map keyed by
field name, so an already-stored record fails to decode into a struct that gained a required field.
That is why `addon_ids` went in at v2, while no v2 record existed. Need new per-record data later? A
new `DataKey` variant, or an `Option`. The `test_snapshots/` are committed too (generated
automatically by the soroban testutils) — if their diff moves without you changing behaviour, that is
a signal, not noise.

```bash
cd sc && stellar contract build && cargo test -p race_record
```
