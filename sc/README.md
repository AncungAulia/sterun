# sc/ — the Sterun Soroban contracts

The cargo workspace for the Sterun contracts (Stellar/Soroban, Rust `#![no_std]`, target
`wasm32v1-none`).

| Contract | Ticket | Description |
|---|---|---|
| `contracts/event_registry` | STE-5 (C1) | The registry of events, categories, quotas, sUSD prices, the scanner allowlist, and `reserve_slot` |
| `contracts/race_record` | STE-9 (C2) | The **non-transferable** race record and its lifecycle (`Entered` → `RacepackClaimed` → `Finished`/`Dnf`), an atomic `enter` (quota + sUSD payment + mint in one invocation), and a permissionless `extend_record_ttl` |

## The FROZEN spec (STE-10) — read this before consuming these contracts

Both contracts' interfaces, their event layouts and their error codes are **already frozen** in
`docs/specs/` (frozen; the folder is currently at **v2.1.0** — the organiser allowlist in C1, on top
of add-ons + upgradeability + `Cancelled`). If you are writing a backend, an indexer, an SDK or a
frontend, that is the source of truth — not these `lib.rs` files:

| File | Contents |
| --- | --- |
| [`docs/specs/INTERFACE.md`](../docs/specs/INTERFACE.md) | function signatures + who authorizes + the possible errors, the `#[contractevent]` layouts (topic vs data), both error enums + their bands, the wasm hashes, the sUSD SAC address |
| [`docs/specs/HASH_AND_TOTP.md`](../docs/specs/HASH_AND_TOTP.md) | `participant_hash` + TOTP + the QR payload, **byte-exact** |
| [`docs/specs/vectors/`](../docs/specs/vectors/) | the JSON test vectors |
| [`docs/specs/reference/`](../docs/specs/reference/) | 2 reference implementations (Node + Rust) that must agree |
| [`docs/specs/CHANGELOG.md`](../docs/specs/CHANGELOG.md) | the version history + **the rules for changing it** |

```bash
bash ../docs/specs/verify.sh   # from sc/ — both reference implementations must agree
```

Changing a function signature, an event layout, an error code, or the hash/TOTP definitions requires
**a new PR + approval from @Axel + @fable + a CHANGELOG entry + regenerated TS bindings (STE-14)**.
Error codes are public ABI: **never renumber them.**

The tests `spec_vectors::host_sha256_matches_every_participant_hash_vector` and
`spec_vectors::every_participant_hash_vector_is_accepted_by_enter_and_verify` in
`contracts/race_record/src/test.rs` read the same vector file, so if the spec and the contract ever
diverge, `cargo test` fails first.

## Versions (pinned EXACTLY)

- `soroban-sdk = "=26.1.1"` — **protocol 26**, not 27/28.
  The reason: the latest OpenZeppelin `stellar-tokens` / `stellar-access` / `stellar-contract-utils`
  / `stellar-macros` crates (`0.7.2`, as of 2026-08-31) require `soroban-sdk ^26.1.0`. Move to 27
  only after OZ ships a compatible release.
- The OZ crates at `= "0.7.2"` in `[workspace.dependencies]`.

## Build artefacts (STE-14)

`stellar contract build` in `sc/` produces two wasm files. These are what STE-33 deployed, and what
the TS bindings in [`bindings/`](bindings/) are generated from:

| Contract | Wasm | sha256 | Size |
| --- | --- | --- | ---: |
| EventRegistry (C1, v2.1) | `target/wasm32v1-none/release/event_registry.wasm` | `cf0090331f199766af56c243a9de22c0581ea030b02940695851d64231fec3c0` | 26,948 B |
| RaceRecord (C2, v2.0.1) | `target/wasm32v1-none/release/race_record.wasm` | `27749180046a9a4e62e85ec46cb6b61cd35a0914db4f4eb61d66616febd4302b` | 21,814 B |

EventRegistry's pre-allowlist number (`22bb432e…032a2f`) and the v1 numbers (`61d85dd5…578474` /
`75d38045…07919f`) are still relevant: the first is the wasm STE-36 upgraded away from (committed as
a fixture in `contracts/event_registry/testdata/`), and the second pair is what the still-live v1
addresses run. Both are recorded in `docs/deployments.md` and `docs/specs/INTERFACE.md` §0.

The toolchain that produced the numbers above:

| | Version |
| --- | --- |
| `rustc` | 1.93.0 (254b59607 2026-01-19) |
| `stellar` CLI | 27.0.0 |
| `soroban-sdk` | `=26.1.1` (pinned, see above) |
| OZ `stellar-tokens` et al. | `=0.7.2` (pinned) |
| target | `wasm32v1-none`, the `release` profile from `Cargo.toml` |

Check them without the Stellar CLI — `stellar contract info hash` returns an ordinary sha256 of the
wasm file, so `shasum` is enough:

```bash
shasum -a 256 target/wasm32v1-none/release/*.wasm
```

### What is reproducible: the interface, not the bytes

**Do not assume the hashes above will match exactly on your machine.** Rust builds are not
bit-for-bit reproducible across machines, toolchain versions, or paths — and
`docs/specs/INTERFACE.md` §0 says so openly. The hash exists so there is one concrete artefact to
point at and compare, not as a promise of determinism.

This is not theoretical caution, and it is not uniform. The first CI run (`ubuntu-24.04`, with the
identical toolchain) produced:

| Contract | macOS (the table above) | Linux CI | Same? |
| --- | --- | --- | --- |
| `race_record.wasm` | `75d38045…07919f` | `75d38045…07919f` | yes |
| `event_registry.wasm` | `61d85dd5…578474` | `ed6c552a…7f80e8` | **no** |

One wasm identical, the other not, from the same commit and the same toolchain. That is why
`check-interface.mjs` treats a hash difference as a **WARN** and an *interface* difference as a
**FAIL**: the first depends on the machine, the second does not. The STE-33 deploy therefore records
the hash of the artefact that was **genuinely uploaded**, rather than assuming the hash in this
table.

What **must** match, and is guarded mechanically, is the **interface contents**. That is this job:

```bash
node scripts/check-interface.mjs      # needs `stellar contract build` first
```

That script reads three sides and *diffs* all three:

1. `stellar contract info interface --output json` from the wasm just built,
2. the frozen tables in `docs/specs/INTERFACE.md` (signatures + arguments + return types, error
   codes, event layouts, type fields),
3. the generated `bindings/*/src/index.ts`.

A changed signature, a renumbered error code, an event field moving from topic to data, or a new
undocumented function all mean **a non-zero exit**. A wasm hash difference is only a **WARN**, with
its reason printed. That is an honest guarantee: the shape is reproducible, the bytes are not.

## Commands

```bash
cd sc
stellar contract build            # -> target/wasm32v1-none/release/*.wasm
cargo test                        # unit + integration tests (needs the build above, see the note)
cargo clippy --all-targets -- -D warnings
cargo fmt --all
cargo llvm-cov --summary-only     # coverage (80% floor)
./scripts/check-exports.sh        # REQUIRED before a PR or deploy — see below
node scripts/check-interface.mjs  # REQUIRED — the frozen spec vs the wasm vs the bindings
```

The two Node scripts in `scripts/` are the same gates CI uses:

```bash
node scripts/check-interface.mjs               # needs `stellar contract build` first

cargo llvm-cov --no-report                     # coverage, in three steps
cargo llvm-cov report --json --summary-only --output-path target/coverage.json
node scripts/coverage-gate.mjs target/coverage.json
```

`coverage-gate.mjs` prints a Markdown table and **exits non-zero** if either contract's `lib.rs`
drops below 80% (region or line). Only those two `lib.rs` files are gated: coverage of `test.rs` is
nearly meaningless (test code covers itself) and `race_record/src/registry.rs` is only a
`#[contractclient]` trait declaration — macro input with no body, so llvm-cov reports it as 0%
forever. Both are still printed, not hidden.

Want proof the gate is not decorative? Raise its threshold and watch it go red:

```bash
COVERAGE_MIN=99 node scripts/coverage-gate.mjs target/coverage.json
```

## CI — `.github/workflows/contracts.yml`

Every claim in this file is re-derived from its source on a clean machine on every push and PR, in
three jobs:

| Job | What it proves |
| --- | --- |
| `contracts` | `cargo fmt --check`, `clippy -D warnings`, `stellar contract build`, `cargo test`, `check-exports.sh`, `check-interface.mjs`, then `cargo llvm-cov` through `coverage-gate.mjs` |
| `bindings` | both packages in `bindings/` do `npm ci && npm run build` — compiling as they are, with no hand edits |
| `spec` | `bash ../docs/specs/verify.sh` — the Node and Rust implementations agree on every frozen vector |

Two numbers are deliberately written to the **job summary** (not just the log), so they can be read
by someone who will never install Rust — a grant reviewer holding only a run URL, say: **each wasm's
sha256 + size**, and the **coverage table** with the 80% floor marked.

The workflow's versions are pinned to the toolchain recorded above: Rust `1.93.0` (through the
runner's own `rustup`, with no third-party action), stellar CLI `27.0.0` (through
`stellar/stellar-cli@v27.0.0` — that action reads its own ref to choose a release, so the ref is the
version), and `cargo-llvm-cov 0.8.7`. Changing one of those numbers there means changing it here too.

> **The build → test order is mandatory.** The test
> `race_record::test::exports::race_record_wasm_exports_nothing_that_could_move_a_record`
> reads `target/wasm32v1-none/release/race_record.wasm` and takes apart its export section. If that
> wasm is absent, the test fails with a message telling you to run `stellar contract build` first —
> deliberately failing rather than skipping quietly.

## The error-code convention: a band per contract

A Soroban `ScError` is only a `u32` **with no contract identity**, and a revert from a
sub-invocation (EventRegistry, the SAC) propagates to the caller unchanged. So error codes are split
into bands, making a raw `Error(Contract, #N)` immediately identifiable:

| Band | Owner |
|---|---|
| `1..=99` | `event_registry` (C1) |
| `100..=199` | `race_record` (C2) |
| `200+` | OpenZeppelin `NonFungibleTokenError` (200–214 in stellar-tokens 0.7.2) |
| the next multiple of 100 | a new contract |

A concrete example: an `enter` that fails because the event is not yet `Open` comes out as
`Error(Contract, #4)` — that is `EventRegistry::EventNotOpen`, and because 4 is outside RaceRecord's
band, a client knows for certain it is not a RaceRecord error. The test
`error_codes_of_the_two_contracts_are_disjoint_bands` fails if the bands ever overlap again.

## Non-transferable = the functions DO NOT EXIST (STE-9)

Sterun's product claim rests on one thing: a race record cannot change hands. That is not held up by
a guard that could be misconfigured, but by the fact that `race_record.wasm` **exports no function**
that could move one. RaceRecord uses only OpenZeppelin's *storage primitives* (`Base::mint`,
`Base::owner_of`, `Base::balance`, `Base::token_uri`, `Enumerable::sequential_mint`) and does **not**
implement the `NonFungibleToken` / `NonFungibleEnumerable` traits that would export `transfer`,
`transfer_from`, `approve`, `approve_for_all`, `burn` and `burn_from`.

Checked mechanically from two sides:

1. `scripts/check-exports.sh` — build, then `stellar contract info interface` and grep. It exits
   non-zero if a forbidden name appears, if EventRegistry's surface leaks into RaceRecord, or if the
   wasm exceeds 128KB.
2. `cargo test` — the `exports::…` test in `contracts/race_record/src/test.rs` parses the wasm's
   export section directly.

RaceRecord's legitimate export surface (19 functions): `__constructor`, `upgrade`, `enter`,
`claim_racepack`, `record_finish`, `record_dnf`, `extend_record_ttl`, `record_of`, `records_of`,
`verify`, `owner_of`, `balance`, `token_uri`, `total_supply`, `name`, `symbol`, `get_admin`,
`get_registry`, `get_token`.

`upgrade` (v2) moves the boundary of the non-transferable claim: what is proven mechanically is the
**deployed** wasm, and that the admin key does not install different wasm is a trust assumption. The
table is in `docs/specs/INTERFACE.md` §4.

## How RaceRecord calls EventRegistry

**Do not** use `event_registry` as an ordinary `[dependencies]` entry. Both crates are
`crate-type = ["lib", "cdylib"]` and `#[contractimpl]` puts
`#[cfg_attr(target_family = "wasm", export_name = "…")]` on every entry point, so linking its rlib
into RaceRecord's cdylib fails outright:

```
warning: Linking globals named '__constructor': symbol multiply defined!
error: failed to load bitcode of module "event_registry.…-cgu.0.rcgu.o"
```

What is used instead: a local trait with `#[contractclient]` in
`contracts/race_record/src/registry.rs` — only the 6 functions actually needed (`reserve_slot`,
`reserve_addon`, `addon_count`, `get_category`, `get_organiser`, `is_scanner`) plus a mirrored
`#[contracttype] CategoryData` with identical field names. `#[contractclient]` produces only a client
struct (no `export_name`, no `contractspecv0` entry), and `event_registry` remains a
**dev-dependency** so tests can register a real registry in the same `Env`. The test
`mirrored_category_data_decodes_the_registrys_own_struct` keeps that mirror in sync with C1.
