# V2 BUILD BRIEF — Sterun contracts v2 (upgradeable + paid add-ons + Cancelled)

> **A completed brief, kept as a record.** This is the instruction under which the v2 contracts were
> built and deployed on 2026-09-09. It was originally written in Indonesian and translated on
> 2026-09-10 when the repository moved to English; nothing about the instruction itself was changed.
> What actually shipped is recorded in `docs/deployments.md` and `docs/specs/CHANGELOG.md` [2.0.0].

You are an engineering agent, **high effort**. Build the Sterun **v2** contracts in THIS worktree. Be
methodical, commit in small pieces, test fully.

## 0. Read first (MANDATORY — the live code, not memory)
- `CLAUDE.md` (root) + `docs/SYSTEM_DESIGN.md` + `docs/specs/INTERFACE.md`
- `sc/contracts/event_registry/src/lib.rs` + `sc/contracts/race_record/src/lib.rs` (v1, already live on testnet)
- `sc/scripts/deploy-testnet.sh` + `docs/deployments.md` (the v1 deploy pattern + the sUSD SAC address)

## 1. Context and decisions (from Axel, PM — Linear STE-35 + STE-34)
The v1 contracts are live but **NON-UPGRADEABLE** (no upgrade function — verified: zero matches for
`upgrade`/`update_current_contract_wasm`/`Upgradeable`). v1's `enter` charges **exactly one**
`category.price_usdc`, so it cannot sell paid add-ons (a jersey at +50, a tumbler at +30). Ancung
asked for add-ons in STE-35. Because v1 is immutable, **v2 means new addresses** — and we fit an
upgrade mechanism at the same time so that **this is the last time an address changes**.

## 2. v2 SCOPE (exactly this — no more, no less)
1. **Upgradeability (BOTH contracts):** an admin-gated `upgrade(new_wasm_hash: BytesN<32>)` →
   `env.deployer().update_current_contract_wasm(&new_wasm_hash)`. Verify the pattern and the
   storage-compatibility rules through **MCP Stellar Raven** (Soroban's native upgrade / the OZ
   Upgradeable model). Storage keys are **append-only forever** (never delete, rename or retype an
   existing key).
2. **On-chain add-ons (EventRegistry):**
   - `AddOnData { code: Symbol, price_usdc: i128, quota: u32, reserved_count: u32 }`; storage
     `AddOn(event_id, addon_id)` + `AddOnCount(event_id)`.
   - `add_addon(event_id, code, price_usdc, quota)` — organiser-auth (like `add_category`),
     validating `price>=0` and `quota>0`.
   - the views `get_addon` and `addon_count`.
   - `reserve_addon(event_id, addon_id)` — **RaceRecord-auth only** (like `reserve_slot`),
     quota-enforced, incrementing `reserved_count`, reverting with `AddOnQuotaFull` when it runs out.
3. **enter v2 (RaceRecord):** `enter(runner, event_id, category_id, addon_ids: Vec<u32>, participant_hash)`:
   - reserve the category slot, and call `reserve_addon` for each `addon_id` (quota-enforced)
   - charge `category.price_usdc + Σ addon.price_usdc` in **ONE atomic transfer** from runner to
     organiser (skipping the transfer when the total is 0)
   - mint the record; **store the chosen `addon_ids` in RecordData** so what a runner bought is
     verifiable
   - **ALL-OR-NOTHING** (one auth tree, one invocation). Bound the number of add-ons per enter (e.g.
     `<= addon_count`) to keep the loop bounded, and reject duplicate `addon_id`s.
4. **The `Cancelled` status (EventRegistry):** add `Cancelled` to `EventStatus`. Legal transitions:
   `Open→Cancelled`, `Closed→Cancelled`, `Draft→Cancelled`. `Cancelled` is terminal. `reserve_slot`
   already refuses anything that is not `Open`. `Closed` still means "entries are shut" — different
   from `Cancelled`.
5. **NO escrow** (refunds stay honestly off-chain). Because v2 is upgradeable, escrow can be added
   in place later — **do not build it now.**

## 3. Design decisions (decide WITH Raven, do not guess)
- Evolve the existing `event_registry` and `race_record` crates into v2 in place (the v1 wasm is
  archived by hash in `docs/deployments.md`, so moving the source forward to v2 is safe). Update the
  spec artefacts (`docs/specs/`) to v2 and mark v1 historical. **Preserve:** the disjoint error code
  bands (never renumber public ABI; a new error takes the next free code in its band), the
  non-transferable-by-absence property (RaceRecord still exports no transfer/approve/burn), and the
  TTL pattern.
- Verify every Stellar/Soroban decision through Raven + the `stellar-dev:smart-contracts` skill.

## 4. Conventions (MANDATORY)
- **Small commits, English Conventional Commits** (`feat:`, `fix:`, `test:`, `chore:`, `docs:`,
  `refactor:`) — with a scope naming v2, e.g. `feat(registry-v2): add on-chain paid add-ons`.
- **MCP Stellar Raven is mandatory** (load with
  `ToolSearch "select:mcp__stellar-raven__search,mcp__stellar-raven__execute"`).
- **Update the relevant CLAUDE.md files**: root + `sc/` + `sc/contracts/event_registry/` +
  `sc/contracts/race_record/` + `docs/specs/` (documenting the upgrade model + add-ons + Cancelled).
- **Full tests** (matching v1's rigour): unit + e2e (edge/positive/negative), `cargo llvm-cov`
  **>80%**, every revert and guard path. Required tests: **the upgrade path** (write state → upgrade
  → the state still reads correctly), **add-on quota** + **atomic charging** + **all-or-nothing
  rollback** (a failed transfer means neither the slot nor the add-on is consumed), **the Cancelled
  transitions**, and the non-transferable property (`check-exports`). Build the wasm reproducibly and
  record its hash.

## 5. The flow (AUTONOMOUS — Axel has pre-authorised it, WITHOUT an ACC gate this time)
1. Build v2 on this branch (`v2-addons-upgradeable`). Small commits.
2. **ALL tests and e2e GREEN** (this is the gate Axel set).
3. **Deploy to testnet** (NEW EventRegistry + RaceRecord addresses): follow the pattern in
   `sc/scripts/deploy-testnet.sh`. The keys are in `.env` (STERUN_ADMIN as deployer, the sUSD
   issuer/distributor to fund test sUSD). Wiring: `set_race_record` + set the **sUSD SAC** address
   `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` (the payment asset). On-chain sanity:
   `create_event → add_category → add_addon → set Open → enter (with an add-on, paying sUSD) → the
   record is Entered and the organiser's balance rose by category + add-on`. Record the contract
   addresses + wasm hashes + transactions + stellar.expert links in `docs/deployments.md`. Any new
   deploy key goes in the gitignored `.env`.
4. **Merge to main** (ONLY after all e2e are green): push the branch → PR → merge (documented as a
   PR).
5. **STOP and report**: update the worktree comment, starting with `V2 DEPLOYED:` and holding the v2
   EventRegistry and RaceRecord addresses + wasm hashes, so the orchestrator (Axel's main session)
   can comment to Ancung on Linear.

## 6. Scope guard
- This is Axel's contract work (C1/C2). Do not touch teammates' code (`be/`, `fe/`, `landing-page/`)
  except to record the new addresses in the docs. Do not disturb the live v1 contracts' state.
- Asking questions is forbidden — take Raven's recommended best practice, decide, and document the
  reasoning in the commit.

Begin: read the files, verify the upgrade and add-on patterns through Raven, design v2, build it in
small commits, test fully, deploy, merge, report.
