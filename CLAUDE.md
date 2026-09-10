# Sterun — Instawards MVP (root CLAUDE.md)

A **non-transferable race record** protocol for running events on **Stellar/Soroban**. Instawards
grant, $5k / 30 days. Full design: **`docs/SYSTEM_DESIGN.md`** (C1–C14, storage model, lifecycle,
TOTP, user flows). Read it before starting work.

This file holds the conventions that apply across the **whole** repository. Every folder has its own
`CLAUDE.md` carrying what applies **only** there — read the one for the folder you touch:

| Folder | What its `CLAUDE.md` covers |
| --- | --- |
| [`sc/`](sc/CLAUDE.md) | contract cargo workspace: build, test, gates, pinned versions, error bands |
| [`sc/contracts/event_registry/`](sc/contracts/event_registry/CLAUDE.md) | C1 — storage, quota, add-ons, scanner allowlist, `reserve_slot` |
| [`sc/contracts/race_record/`](sc/contracts/race_record/CLAUDE.md) | C2 — non-transferable, lifecycle, atomic `enter`, TTL |
| [`docs/`](docs/CLAUDE.md) | SYSTEM_DESIGN + `deployments.md` (deployment evidence) |
| [`docs/specs/`](docs/specs/CLAUDE.md) | the FROZEN C4 spec: how to change it, how to verify it |
| [`be/`](be/CLAUDE.md) | Node/TS backend (James) — API + PII vault + indexer + TTL keeper |
| [`sdk/`](sdk/CLAUDE.md) | `@sterunxyz/sdk` (James) — C5 `SterunClient` + C6 JSON Schema v1.0, packaging |
| [`fe/`](fe/CLAUDE.md) | Next.js web app (Ancung) |
| [`landing-page/`](landing-page/CLAUDE.md) | landing page (Nabil) |

## Scope of work (MANDATORY)
- Work in **THIS repository only** (AncungAulia/sterun). Never touch the `web3-rich` repository.
- Take Linear tickets **in order**, one at a time, following `blockedBy`.

## Repository layout (use what is already here; do not rearrange)
```
sc/            smart contracts (Soroban Rust) + generated TS bindings — cargo workspace
be/            backend (Node/TS, Fastify) — API + Stellar helpers + sUSD faucet
sdk/           @sterunxyz/sdk (Node/TS) — SterunClient on top of the bindings (C5)
fe/            web app (Next.js)
landing-page/  landing page (Next.js)
deploy/        Caddyfile + verify-deployment.sh (STE-31)
docs/          SYSTEM_DESIGN.md + deployments.md (evidence) + specs/ (the FROZEN spec)
```
Follow this `sc/be/sdk/fe/landing-page` layout, not the `contracts/packages/apps` one from the
ticket drafts. `sdk/` was added in STE-15 because C5 has to be importable from a browser (`fe/`, the
scanner PWA) — it cannot live inside `be/`, which drags in Fastify and `pg`.

`be/` + `sdk/` + `fe/` + `landing-page/` are **one pnpm workspace** (root `pnpm-workspace.yaml`);
`sc/` is a separate cargo workspace. `sc/bindings/*` is **not** in the pnpm workspace — it is
generator output, consumed through a `file:` dependency. From the root: `pnpm install`, `pnpm dev`,
`pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm faucet`, `pnpm indexer`,
`pnpm keeper`.

`sdk/` does **not** use a `file:` dependency: `sc/bindings/*/src/index.ts` is *vendored* into
`sdk/vendor/` as a byte-identical copy, because a package published to npm cannot carry a `file:`
dep. `sdk/test/vendor.test.ts` fails when the copies drift, so regenerating the bindings without
refreshing the SDK turns the suite red. Refresh with `pnpm --filter @sterunxyz/sdk vendor`.

`@stellar/stellar-sdk` is forced to a single version (`^17.0.1`) through `pnpm.overrides` in the
root `package.json`: the bindings generator writes `^14.5.0`, and two copies of the SDK in one graph
means two RPC clients plus signer objects crossing a major version boundary. The bindings themselves
must **never** be edited by hand.

## Where things stand (2026-09-10)

| Ticket | Component | Status |
| --- | --- | --- |
| STE-5 | EventRegistry (C1) | done, 33 tests |
| STE-30 | sUSD + SAC on testnet | done, SAC `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` |
| STE-9 | RaceRecord (C2) | done, 42 tests |
| STE-10 | freeze the interface + hash/TOTP (C4) | done, spec v1.0.1 |
| STE-14 | TS bindings + gate + CI (C3) | done |
| STE-33 | deploy contracts to testnet | done — **contracts LIVE** |
| STE-6 | pnpm monorepo + TS CI + backend skeleton + sUSD faucet | done |
| STE-11 | PII vault + hash/TOTP in the backend (C7) | done |
| STE-16 | indexer + TTL keeper + roster bundle (C8) | done |
| STE-15 | `@sterunxyz/sdk` — SterunClient (C5) | done, live testnet e2e |
| STE-19 | JSON Schema v1.0 + packaging (C6) | **done — published as `@sterunxyz/sdk`** |
| STE-20 | results CSV + API hardening (C7/j6) | done, live testnet e2e |
| STE-31 | deploy the backend to a VPS | **done** — live at `https://api-sterun.jameshub.fun` (jameserver / pve02 / ct-sterun), Cloudflare Tunnel |
| STE-8 | web app shell + wallet connect (C9) | done |
| STE-13 | event directory + detail read from chain (C9) | done, live testnet e2e |
| STE-17 | organiser console | in progress (Ancung) |
| STE-35 | **contracts v2**: upgradeable + paid add-ons + `Cancelled` | done, **LIVE on testnet** |
| STE-36 | **organiser allowlist** in EventRegistry (C1) | done, **LIVE via in-place `upgrade` — address UNCHANGED** |
| STE-37 | add-on methods on `SterunClient` | done, live v2 e2e |
| — | event metadata files (`POST /events/files`) | done, live e2e |
| — | **R2** object storage (`sterun-files`, APAC) | done — the API is stateless, the replica blocker is gone |
| — | migrate `be/` + `fe/` to the v2 addresses | done — index and vault truncated, v2 e2e passed |

Contracts are **live on testnet**, and there are now **two pairs**. Addresses and full transaction
evidence live in [`docs/deployments.md`](docs/deployments.md):

```
# v2 (STE-35 + STE-36) — paid add-ons, Cancelled, upgradeable, organiser allowlist.
# Interface: docs/specs/INTERFACE.md v2.1.0
EVENT_REGISTRY=CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU
RACE_RECORD=CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW

# v1 (STE-33) — still alive on chain, no longer used by be/ or fe/.
# Recorded as history; do not point anything at it again.
EVENT_REGISTRY_V1=CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64
RACE_RECORD_V1=CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4

SUSD_SAC=CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU
```

**The client migration to v2 is done.** `be/` and `fe/` point at the v2 pair;
`docs/deployments.md` gives the unqualified row name to v2 and labels the old one `v1`, so the
address parser in `be/src/deployments.ts` resolves v2 — and a test fails if it ever resolves v1.

The production index and vault were **truncated** during the move: `events.event_id` and
`records.token_id` are bare primary keys with no contract discriminator, so stacking two contracts'
data in one database means v2 event 0 overwrites v1 event 0 — and `participants` links PII to those
same `token_id`s. Procedure and reasoning: `be/OPERATIONS.md`, "Moving to the v2 contracts".

**M1 (D1 — contracts) is complete.** **M2 (D2 — `@sterunxyz/sdk` + backend) is complete**: the
package is published on npm as [`@sterunxyz/sdk`](https://www.npmjs.com/package/@sterunxyz/sdk).

The whole publish chain was verified before upload and again after: `npm pack` produces a tarball
that installs into an empty TypeScript project outside the repository, typechecks cleanly, and reads
the live v2 contracts through the packaged artifact rather than through the source tree.

**M3 (D3 — web + scanner + landing) is under way.** The web app is live: `/` and `/events/[id]` read
EventRegistry directly over RPC, with no database and no wallet. What remains: STE-17 console →
STE-21 entry + pass → STE-22 scanner → STE-24 profile → STE-32 Vercel deploy.

The backend runs as three processes from one `be/` package: the API (`pnpm dev`), the poller
(`pnpm indexer follow`) and the TTL keeper (`pnpm keeper run`). The full chain has been run against
live testnet, from PII going in to a roster coming out — step-by-step evidence is in
[`docs/deployments.md`](docs/deployments.md).

The v1 contracts are **non-upgradeable**: their addresses are permanent for that version, which is
why the STE-35 add-ons needed a new pair. **v2 is upgradeable** (`upgrade(new_wasm_hash)`,
admin-gated, on both contracts), so that should be the last time an address changes. **STE-36 proved
it**: the organiser allowlist landed in EventRegistry through `upgrade` — new function, new storage
key, same address, existing events intact.

The price is one rule no compiler can enforce: **storage keys are append-only, forever** — never
delete, rename or retype a `DataKey` variant, and never add a required field to a struct that is
already stored. Full reasoning in [`sc/CLAUDE.md`](sc/CLAUDE.md). And RaceRecord's non-transferable
claim is now about the **deployed** wasm plus the admin key rather than about the address forever —
the table is in `docs/specs/INTERFACE.md` §4, so do not copy the v1 sentence verbatim into grant
material.

## Workflow (in force since 2026-09-01; overrides the older "wait for approval before merging")

1. **A new branch per ticket**, named from the ticket description (e.g.
   `feat/1-event-registry-contract`).
2. **Small commits**, one meaningful step each, referencing `STE-#`. The commit body explains
   **why**, rather than restating the diff.
3. Ticket finished + tests green → **merge straight to `main`** (`git checkout main && git merge
   <branch> && git push origin main`), then **set the ticket to Done in Linear**. One ticket per
   merge, in dependency order. Axel has already given permission; no per-PR approval is needed.
4. Use the **Opus** model for both PM and worker roles (`claude --model opus`). Not fable.
5. **Update the `CLAUDE.md` of the folder you touched** in the same commit when a convention
   changes.
6. A deploy MUST commit its evidence (contract address + stellar.expert link, or a live URL) in
   **`docs/deployments.md`**.
7. Update the worktree comment at each checkpoint:
   `orca worktree set --worktree active --comment "..."`.

## Required tooling
- **MCP Stellar Raven** (`mcp__stellar-raven__search` / `execute` via ToolSearch) — verify **every**
  Stellar/Soroban decision (OZ non-fungible base, SEP-41/SAC, Wallets Kit, state archival/TTL,
  `stellar contract bindings typescript`, `stellar contract asset deploy`, installing the CLI in
  CI). Do not rely on memory.
- **The Stellar Soroban skill** (`stellar-dev:smart-contracts`) — scaffold/build/test patterns.

## CI — two workflows, on every push and PR
- **`contracts.yml`** — three jobs: `contracts` (fmt, clippy `-D warnings`, build, `cargo test`,
  `check-exports.sh`, `check-interface.mjs`, 80% coverage gate), `bindings` (both TS packages
  compile as generated), `spec` (`docs/specs/verify.sh` — the two reference implementations agree).
- **`typescript.yml`** — install from the lockfile (`--frozen-lockfile`), lint, typecheck, build and
  test the whole TS workspace. It touches no network, so it cannot go red because testnet had a bad
  afternoon.

wasm sha256 hashes and the coverage table are written to the **job summary**, so they can be read by
someone with no Rust installed at all — a grant reviewer holding only the run URL, for instance.

## Testing (MANDATORY, no bugs)
- **e2e** + **edge cases** + **positive cases** + **negative cases** for every ticket.
- Contracts: unit + integration (soroban testutils), `cargo llvm-cov` **>80%** (currently 99%),
  every revert path (QuotaFull, EventNotOpen, AlreadyClaimed, finish-before-claim), the quota race,
  TTL extension, and an assertion that the contract is non-transferable (no exported
  transfer/approve/burn).
- **Do not start the next ticket before the current one passes its tests and is merged.**

## Settled decisions (do not reopen)
- Testnet asset = **sUSD (Sterun USD)**, issued by us via SAC/SEP-41; mainnet = USDC (Circle).
- **6-digit TOTP.** PII stays off-chain (only `participant_hash` goes on-chain).
- **v1 non-upgradeable, v2 upgradeable** (native Soroban `update_current_contract_wasm`, not a
  proxy). Consequence: storage keys are append-only forever.
- **Paid add-ons live on-chain** (STE-35): `enter` charges `category.price + Σ addon.price` in
  **one** atomic transfer, and `RecordData.addon_ids` records what was bought.
- **`create_event` is gated by an organiser allowlist** (STE-36, option A). `require_auth` alone is
  not enough: `name` is a free `String`, so without an allowlist anyone could publish "Jakarta
  Marathon 2026". The admin is **STERUN_ADMIN** and access requests are handled off-chain. **B/KYC
  is post-pilot, not now.** The allowlist is contract-wide and revocation only moves forward —
  details in `sc/contracts/event_registry/CLAUDE.md`.
- **No escrow.** Refunds remain an off-chain promise. Because v2 is upgradeable, escrow can be added
  in place later — do not build it now.
- **Contract crate versions (pinned EXACTLY in `sc/Cargo.toml`)**: `soroban-sdk = "=26.1.1"`
  (protocol 26), OZ `stellar-tokens`/`stellar-access`/`stellar-contract-utils`/`stellar-macros` =
  `"=0.7.2"`. Reasoning and the conditions for raising them: `sc/CLAUDE.md`.
- **Contract layout**: a cargo workspace in `sc/`, members at `sc/contracts/<contract_name>/`.
- **Error code bands** `1..=99` C1 · `100..=199` C2 · `200+` OZ — reasoning and consequences in
  `sc/CLAUDE.md`. Error codes are **never renumbered**.
- **`docs/specs/` is FROZEN.** Changing a signature, an event layout, an error code or the
  hash/TOTP definitions requires the procedure in `docs/specs/CLAUDE.md`.

## Language

**Everything in this repository is written in English** — Markdown, code comments, commit messages
and PR descriptions alike.

That is a change from the original convention, which had `*.md` in Indonesian. The reason is
concrete rather than stylistic: this work is reviewed by people outside Indonesia, and a reviewer
who cannot read the reasoning is left judging the code by its surface. These documents carry the
*why* — why an index can be rebuilt, why an error code is never renumbered, why a bound is enforced
in code rather than declared in a schema — and that is exactly the part worth reading.

Team chat stays in whatever language the team speaks. It is the repository that has an outside
audience.
