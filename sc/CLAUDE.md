# `sc/` — the Soroban contracts (CLAUDE.md)

The cargo workspace for both Sterun contracts. Rust `#![no_std]`, target `wasm32v1-none`. The full
reference is in [`README.md`](README.md) — this file is only the rules you must hold **before**
writing code here.

| Member | Ticket | Its CLAUDE.md |
| --- | --- | --- |
| `contracts/event_registry/` | STE-5 (C1) | [`contracts/event_registry/CLAUDE.md`](contracts/event_registry/CLAUDE.md) |
| `contracts/race_record/` | STE-9 (C2) | [`contracts/race_record/CLAUDE.md`](contracts/race_record/CLAUDE.md) |
| `bindings/` | STE-14 (C3) | generator output — **never hand-edit**, see [`bindings/README.md`](bindings/README.md) |
| `scripts/` | STE-9 / STE-14 / STE-33 | the three gates CI runs + the testnet deploy script |

## Daily commands

```bash
cd sc
stellar contract build            # REQUIRED first — the tests read the wasm it produces
cargo test                        # 66 (event_registry) + 60 (race_record)
cargo clippy --all-targets -- -D warnings
cargo fmt --all
./scripts/check-exports.sh        # non-transferable, proven from the wasm
node scripts/check-interface.mjs  # the frozen spec vs the wasm vs the bindings
```

**The `build` → `test` order is mandatory**, not ceremony: the test
`race_record::test::exports::race_record_wasm_exports_nothing_that_could_move_a_record` takes apart
the export section of `target/wasm32v1-none/release/race_record.wasm`. If that wasm is absent, the
test **fails** (deliberately, rather than skipping quietly).

Since v2 there is a second and sharper reason: the `mod upgrade` module in **both** crates deploys
its contract **from wasm** (`env.register(bytes, args)`), because `update_current_contract_wasm` can
only replace an executable that actually exists. Stale wasm means the upgrade tests are testing
yesterday's code. If you change `lib.rs` and go straight to `cargo test`, you are testing the old
build — build first.

Coverage is affected too: a contract run as wasm is **not** instrumented, so `upgrade` would appear
as 0% if it were only exercised through wasm. That is why `upgrade_runs_natively_too` exists in both
crates — it makes the coverage report honest about what actually ran.

Coverage — an 80% floor, currently 99%:

```bash
cargo llvm-cov --no-report
cargo llvm-cov report --json --summary-only --output-path target/coverage.json
node scripts/coverage-gate.mjs target/coverage.json
```

## Versions are pinned EXACTLY — do not raise one without checking this first

`soroban-sdk = "=26.1.1"` (**protocol 26**, not 27/28) and OZ `stellar-*` `= "0.7.2"` in
`[workspace.dependencies]`. The reason is not general caution: OZ 0.7.2 (the latest release as of
2026-08-31) requires `soroban-sdk ^26.1.0`, so as long as RaceRecord uses the OZ non-fungible base,
this workspace **cannot** move to 27. Raise it only after OZ ships a protocol-27-compatible release —
and verify that through MCP Stellar Raven first, not from memory.

Stellar CLI **27.0.0** is still used (its build/deploy is backwards-compatible). The CLI and rustc
versions that produced the wasm hashes are recorded in `README.md`; CI pins the same numbers.

## Error code bands — the convention most easily broken in this repository

| Band | Owner | In use now |
| --- | --- | --- |
| `1..=99` | `event_registry` (C1) | `1..=18` |
| `100..=199` | `race_record` (C2) | `100..=107` |
| `200+` | OpenZeppelin `NonFungibleTokenError` (200–214 in stellar-tokens 0.7.2) | `200..=214` |
| the next multiple of 100 | a new contract | — |

A Soroban `ScError` carries only a `u32` **with no contract identity**, and a revert from a
sub-invocation propagates to the caller unchanged. `enter` cross-calls both EventRegistry **and** the
SAC, so without disjoint bands an `Error(Contract, #4)` out of `enter` could be `EventNotOpen` (C1)
or `InvalidState` (C2), and the D2 SDK would have to guess. The test
`error_codes_of_the_two_contracts_are_disjoint_bands` guards it.

**Error codes are public ABI: never renumbered, and a removed variant's number is never reused.** A
new variant takes the next free number in its band, through the procedure in `docs/specs/CLAUDE.md`.

## A contract must NOT be an ordinary dependency of another member

Both crates are `crate-type = ["lib", "cdylib"]`, and `#[contractimpl]` puts
`#[cfg_attr(target_family = "wasm", export_name = "…")]` on every entry point. Linking one contract's
rlib into another's cdylib fails outright:

```
warning: Linking globals named '__constructor': symbol multiply defined!
error: failed to load bitcode of module "event_registry.…-cgu.0.rcgu.o"
```

For cross-calls, use a local `#[contractclient]` (see `contracts/race_record/src/registry.rs`) or
`contractimport!`. Another contract crate may **only** appear in `[dev-dependencies]`, for tests.

## An auth caveat in tests (soroban-sdk 26.1.1)

`mock_all_auths()` uses *recording* auth mode, in which a `require_auth` on the root frame is
satisfied for any address — **including a contract address**. So `mock_all_auths()` **cannot** prove
an auth gate on the root frame (the invoker-contract gate on `reserve_slot`, for instance). For every
auth-gate assertion, use `env.mock_auths(&[...])` (enforcing).

## Deploying

`scripts/deploy-testnet.sh` is what deployed the pair currently live (addresses and evidence:
`docs/deployments.md`). Two things not to change without a reason:

- **`upload` first, then `deploy --wasm-hash`** (not `deploy --wasm`). The upload prints the hash
  that genuinely landed on the ledger, so the recorded hash is read from the chain.
  `--optimize=false` keeps the bytes identical to the artefact that produced the bindings and
  `INTERFACE.md` §0.
- **The sanity check runs the negative cases too.** A deploy that only proves the happy path has not
  proven the guards survived to a real network — and those guards are the product.

Running that script again produces a **new** pair of addresses (deploys use a random salt). Since v2
that is no longer the only way to change a live contract — see below.

## v2: the contracts are upgradeable, and storage keys are append-only FOREVER

**Already used twice** to change a live contract without changing its address: RaceRecord v2.0.1 (an
internal optimisation) and EventRegistry v2.1.0 (the organiser allowlist, STE-36). The second added a
`DataKey` variant to a contract already holding other people's events, so the rules below stop being
theory there. The evidence is more than procedure: the wasm that was live before the upgrade is
committed in `contracts/event_registry/testdata/`, and
`state_written_by_the_live_wasm_survives_the_allowlist_upgrade` deploys that code, writes state with
it, then replaces it with the current build and reads it all back. If you add another `DataKey`
variant, copy that pattern — and refresh its fixture **after** your upgrade lands, not from a local
build.

Both contracts export an admin-gated `upgrade(new_wasm_hash)` that calls
`env.deployer().update_current_contract_wasm`. This is Soroban's **native** mechanism: the bytecode is
replaced in place, the address, storage and balances do not move, and there is no proxy and no
`delegatecall`. So no storage slot can be mis-aliased — but the new code **reinterprets the old
entries**, and that is where all of the risk lives:

- **Never delete, rename, or change the type of a `DataKey` variant.** A `#[contracttype]` enum is
  transmitted as the **variant's name**, so adding a variant is safe; renaming one orphans every entry
  written under the old name, silently, with no error.
- **Never add a REQUIRED field to a struct that is already stored** (`RecordData`, `EventData`,
  `CategoryData`, `AddOnData`). A `#[contracttype]` struct is a map keyed by field name: an old value
  fails to decode into a struct that gained a required field. Need new per-record data? Use a new
  `DataKey` variant.
- **`stellar-tokens` owns OZ's owner/balance/enumeration keys.** Bumping its major through an upgrade
  is a storage migration, not a version bump.
- An `upgrade` only takes effect **after** the invocation finishes, so a migration needs a second
  call. The new wasm hash must already be uploaded, and nothing checks that the new wasm still has an
  `upgrade` — upgrading to wasm without one spends the upgradeability permanently.

The consequence most easily misread is in RaceRecord: the claim "a record cannot change hands" is now
about the **deployed wasm** plus the admin key, not about that address forever. The table is in
`docs/specs/INTERFACE.md` §4. Do not restate the v1 claim as though nothing changed.

## Before saying "done"

1. `cargo test` green (positive + negative + edge, with every revert path having its own test).
2. `./scripts/check-exports.sh` green.
3. `node scripts/check-interface.mjs` green — if it is red, **do not edit `INTERFACE.md` to match**;
   it is a frozen spec. See `docs/specs/CLAUDE.md`.
4. The coverage gate green.
5. `cargo clippy --all-targets -- -D warnings` and `cargo fmt --all -- --check` clean.

CI (`.github/workflows/contracts.yml`) runs all five. Run them locally first — a CI run is 4–5
minutes, the local cycle 30 seconds.
