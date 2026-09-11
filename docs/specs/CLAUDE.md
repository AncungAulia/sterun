# `docs/specs/` — the FROZEN spec (CLAUDE.md)

**Everything in this folder is frozen.** It is the C4 *handoff contract* (STE-10): what **James**
(backend + indexer) and **Ancung** (web app + QR pass + scanner PWA) hold so they can work in
parallel without reading anyone's `lib.rs`. Current folder version: **v2.2.0**.

| File | Contents |
| --- | --- |
| `INTERFACE.md` | function signatures + who authorizes + which errors are possible, `#[contractevent]` layout (topic vs data), both error enums and their bands, wasm hashes, the sUSD SAC address |
| `HASH_AND_TOTP.md` | `participant_hash` + TOTP + the QR payload, **byte-exact** |
| `vectors/` | JSON test vectors — **frozen artefacts** |
| `reference/node/`, `reference/rust/` | two reference implementations that must agree |
| `verify.sh` | runs both, and fails hard when they disagree |
| `CHANGELOG.md` | version history + **the rules for changing it** |

## Rule number one

When the code and this document differ, **this document is right**, and the difference is itself a
bug. Never edit `INTERFACE.md` to match a new wasm — the repair runs the other way.

Enforced mechanically by `node sc/scripts/check-interface.mjs`, which diffs three sides: the built
wasm, the tables in `INTERFACE.md`, and `sc/bindings/*/src/index.ts`. It runs in CI on every push.

## How to change the spec (when you really must)

This applies to changes to a **function signature**, a **`#[contractevent]` layout**, an **error
code**, or a **hash/TOTP definition**:

1. **A new PR**, approved by **@Axel (PM) + @fable**. No self-merge for a spec change — this is the
   single exception to the merge-directly workflow in the root `CLAUDE.md`.
2. **An entry in `CHANGELOG.md`**: the new version, the date, what changed, why, and the impact on
   data that already exists and on clients already running.
3. **Regenerate the TS bindings** (`sc/bindings/`, procedure in `sc/bindings/README.md`).
4. `bash docs/specs/verify.sh` green **and** `cd sc && cargo test` green.
5. If **an existing vector's value changes**, say so **explicitly** in the changelog entry.

**Vectors are never quietly regenerated to make a test pass.** A vector is a frozen artefact; when
an implementation disagrees with one, the implementation is wrong until proven otherwise.

## Two things that must never happen, full stop

- **Error codes are never renumbered.** A Soroban `ScError` is only a `u32` with no contract
  identity, so the number itself is the contract. A deleted variant's number is never reused. A new
  variant takes the next free number in its band (`1..=99` C1, `100..=199` C2, `200+` OZ).
- **Hash definitions are never changed in a patch release.** Changing one invalidates **every**
  `participant_hash` already on chain — old records could no longer be re-verified. That is a MAJOR
  at minimum, plus a written migration plan.

## Versions per file

There is one version for the whole folder; each file's title carries the version at which **that
file** last changed. So `INTERFACE.md (v2.2.0)` sitting next to `HASH_AND_TOTP.md (v1.0.1)` is
deliberate: v2 changed the contract interface and did **not touch a single byte** of the hash/TOTP
definitions. What is in force is always the topmost entry in `CHANGELOG.md`.

## v2 and contract addresses

v1 is non-upgradeable, so v2 was a **new address pair** rather than a replacement in place.
`INTERFACE.md` documents v2; the v1 addresses still exist and are still driven by their own v1 wasm.
If you are debugging something that talks to an old address, the document in force is the `[1.0.1]`
entry in `CHANGELOG.md`, not the current `INTERFACE.md`.

From v2 onwards both contracts are **upgradeable**, and that adds one rule no gate in this folder
can enforce: **storage keys are append-only, forever**. The reasoning and consequences are in the
`[2.0.0]` entry of `CHANGELOG.md` and in `sc/CLAUDE.md`.

## Verification

```bash
bash docs/specs/verify.sh           # the two reference implementations must agree
node sc/scripts/check-interface.mjs # wasm ↔ INTERFACE.md ↔ bindings
cd sc && cargo test                 # includes tests that read the same vectors/
```

All three run in CI. `reference/node/` deliberately has **zero npm dependencies** and
`reference/rust/` is a standalone crate (its own `[workspace]`, deliberately **not** a member of
`sc/`) — so that the two are genuinely independent and their agreement means something.
