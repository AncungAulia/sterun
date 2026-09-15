# BRIEF — The organiser allowlist in EventRegistry v2 (via an IN-PLACE UPGRADE)

> **A completed brief, kept as a record.** This is the instruction under which STE-36 was built and
> upgraded in place on 2026-09-09/10. It was originally written in Indonesian and translated on
> 2026-09-10 when the repository moved to English; nothing about the instruction itself was changed.
> What actually shipped is recorded in `docs/deployments.md` and `docs/specs/CHANGELOG.md` [2.1.0].

You are an engineering agent, **high effort**. The feature is focused, but this is an **IN-PLACE
UPGRADE of a LIVE contract** — be careful with storage compatibility. Small commits, English
Conventional Commits.

## The decision (from Axel, PM — Linear STE-36, option A)
Today anyone can `create_event` under any name → organiser impersonation. The fix: **an organiser
allowlist in EventRegistry v2**, as a hard gate. The admin is **STERUN_ADMIN** (in `.env`). An
organiser requests access off-chain and the admin calls `add_organiser`. KYC/KYB is post-pilot (NOT
now).

**IMPORTANT: this is an UPGRADE, not a redeploy.** EventRegistry v2 is already live and upgradeable
at `CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU`. Add the feature → build new wasm →
`upgrade(new_wasm_hash)` → **the address STAYS**, and existing events are intact. RaceRecord v2 does
NOT change.

## 0. Read first
`sc/contracts/event_registry/src/lib.rs` (especially `add_scanner`/`remove_scanner`/`is_scanner` +
`create_event`), `docs/specs/INTERFACE.md` + `docs/specs/CLAUDE.md` (the spec-change procedure),
`sc/scripts/upgrade-testnet.sh`, `docs/deployments.md` (the v2 entry).

## 1. Contract scope (EventRegistry v2 only)
Mirror the existing, already-tested scanner pattern exactly:
- Storage: `DataKey::Organiser(Address) -> bool`. **APPEND the new variant at the END of the DataKey
  enum** (do not insert it in the middle, do not change an existing variant — storage compatibility
  across the upgrade).
- `add_organiser(env, organiser: Address)` — admin-gated (`read_admin(&env)?.require_auth()`), writes
  the key, reverts if it already exists (`OrganiserAlreadyAdded`). Emits `OrganiserAdded`.
- `remove_organiser(env, organiser: Address)` — admin-gated, deletes the key, reverts if absent
  (`OrganiserNotFound`). Emits `OrganiserRemoved`.
- `is_organiser(env, addr: Address) -> bool` — a view (`.unwrap_or(false)`).
- **The `create_event` gate**: after `organiser.require_auth()`, refuse when `!is_organiser(organiser)`
  → revert with the new error `NotAllowlistedOrganiser`. (`require_auth` stays; the allowlist is an
  identity layer on top of it.)
- New errors: the NEXT FREE codes in the EventRegistry band (1..=99). The current maximum is 13
  (`ScannerNotFound`) → use 14, 15, 16. **DO NOT renumber the existing ABI.**

## 2. Tests (MANDATORY, matching v1's rigour)
- `add_organiser` by the admin succeeds; by a non-admin it reverts.
- `create_event` from a wallet NOT on the allowlist → reverts with `NotAllowlistedOrganiser`; from an
  allowlisted one → succeeds.
- `remove_organiser` then `create_event` → reverts again.
- The `is_organiser` view is correct (true/false/after-remove).
- **Upgrade storage compatibility**: an event written BEFORE the Organiser variant was added still
  reads back correctly (use the existing upgrade test pattern in `test.rs`, module `upgrade`). This
  is the evidence the in-place upgrade is safe.
- `cargo llvm-cov` >80%. Every revert path.

## 3. Spec + docs
- Update `docs/specs/INTERFACE.md` through the procedure in `docs/specs/CLAUDE.md` (bump the version,
  e.g. v2.1.0 — new functions are a minor). Document add/remove/is_organiser + the `create_event`
  gate.
- Update the relevant CLAUDE.md files (root + `sc/contracts/event_registry/`).

## 4. Deploy = AN IN-PLACE UPGRADE (Axel pre-authorises this, WITHOUT an ACC gate)
1. All tests and e2e GREEN first (the merge gate).
2. Build the new EventRegistry wasm. Use `sc/scripts/upgrade-testnet.sh` (or
   `stellar contract invoke ... -- upgrade --new_wasm_hash <hash>`) with **STERUN_ADMIN** from
   `.env`, targeting the LIVE contract `CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU`.
   **The address STAYS.**
3. **Seed the allowlist**: `add_organiser` for the pilot organiser wallet so the demo keeps working —
   at minimum `STERUN_ORGANISER_ADDRESS` from `.env`. (Record in deployments.md which wallets were
   allowlisted.)
4. On-chain sanity: (a) `create_event` from a wallet NOT on the allowlist (e.g. STERUN_TEST_A) →
   **REFUSED** with `NotAllowlistedOrganiser`; (b) from STERUN_ORGANISER (allowlisted) → succeeds;
   (c) an existing event still reads (`get_event 0`) — the evidence storage survived. With
   transaction evidence.
5. Record in `docs/deployments.md`: an UPGRADE entry (contract CAPB6NQP…, the old→new wasm hashes,
   the upgrade tx, the allowlisted wallets, stellar.expert links). The address does NOT change.
6. **Merge to main** (after e2e are green): push the branch → PR → merge (documented). Any new deploy
   key goes in the gitignored `.env`.
7. STOP and set the worktree comment, starting with `ALLOWLIST DEPLOYED:` and holding the address
   (unchanged), the old→new wasm, the allowlisted wallets, and a summary of the sanity evidence.

## 5. Conventions
- **MCP Stellar Raven is mandatory** for verifying decisions (upgrade storage compatibility, the
  allowlist pattern, auth). Load with
  `ToolSearch "select:mcp__stellar-raven__search,mcp__stellar-raven__execute"`.
- Small commits, English Conventional Commits, following the repository's commit convention in the
  root `CLAUDE.md`.
- Asking questions is forbidden — take Raven's best practice, decide, and document it in the commit.
- Scope guard: ONLY EventRegistry v2 and its spec/docs. Do not touch RaceRecord, `be/`, `fe/` or
  `sdk/`. Do not redeploy to a new address — an in-place upgrade is mandatory.

Begin: read the files, verify through Raven, build the feature (small commits), test fully, upgrade
the live contract in place, seed the allowlist, run the on-chain sanity checks, merge, report.
