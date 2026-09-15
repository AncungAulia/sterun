# Sterun

**Race records that cannot change hands, on Stellar.**

A runner finishes a race and the only proof lives in the organiser's database — when the organiser
folds, the proof goes with them. Sterun puts that record on-chain as a **non-transferable** token:
it cannot be sold, cannot be moved, and anyone can verify it without a wallet.

Full design: **[`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md)**.

## Live on testnet right now

Contracts are on their **v2** pair. v1 is still on chain and still verifiable, but nothing in this
repository points at it any more.

| What | Address | Explorer |
| --- | --- | --- |
| EventRegistry (C1) | `CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU` | [open](https://stellar.expert/explorer/testnet/contract/CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU) |
| RaceRecord (C2) | `CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW` | [open](https://stellar.expert/explorer/testnet/contract/CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW) |
| sUSD SAC (entry-fee token) | `CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU` | [open](https://stellar.expert/explorer/testnet/contract/CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU) |

The backend that serves them is live too, at **<https://api-sterun.jameshub.fun>** — try
[`/config`](https://api-sterun.jameshub.fun/config) to see which contracts a running process
believes in, or [`/openapi.json`](https://api-sterun.jameshub.fun/openapi.json) for the whole API.

The TypeScript client is on npm: **[`@sterunxyz/sdk`](https://www.npmjs.com/package/@sterunxyz/sdk)**.

Complete deployment evidence — on-chain wasm hashes, every transaction, the
`enter → claim → finish` rehearsal and its negative cases:
**[`docs/deployments.md`](docs/deployments.md)**.

## Layout

Five folders, one responsibility each:

| Folder | Contents | Stack | Conventions |
| --- | --- | --- | --- |
| [`sc/`](sc/) | Soroban smart contracts + generated TS bindings | Rust, `soroban-sdk =26.1.1`, target `wasm32v1-none` | [`sc/CLAUDE.md`](sc/CLAUDE.md) |
| [`be/`](be/) | backend API, PII vault, indexer, TTL keeper | Node 24, TypeScript, Fastify | [`be/CLAUDE.md`](be/CLAUDE.md) |
| [`sdk/`](sdk/) | `@sterunxyz/sdk` — the client every app calls contracts through | Node 24, TypeScript | [`sdk/CLAUDE.md`](sdk/CLAUDE.md) |
| [`fe/`](fe/) | runner + organiser web app, scanner PWA | Next.js 16, React 19, Tailwind v4 | [`fe/CLAUDE.md`](fe/CLAUDE.md) |
| [`landing-page/`](landing-page/) | landing page + design system | Next.js 16, React 19, Tailwind v4 | [`landing-page/CLAUDE.md`](landing-page/CLAUDE.md) |
| [`docs/`](docs/) | design, the **frozen** spec, deployment evidence | Markdown | [`docs/CLAUDE.md`](docs/CLAUDE.md) |

`be/`, `sdk/`, `fe/` and `landing-page/` are one **pnpm workspace**. `sc/` is a cargo workspace that
stands on its own — two ecosystems, two toolchains, never mixed.

## Running it

You need **Node ≥ 22** (we use 24), **pnpm 10**, and — only if you touch the contracts —
**Rust 1.93** + **Stellar CLI 27**.

```bash
pnpm install          # once, from the repository root
pnpm dev              # backend on http://127.0.0.1:3001
curl localhost:3001/health   # {"status":"ok",...}
curl localhost:3001/config   # the contract addresses this process resolved
```

Everything else runs from the root and applies to the whole workspace:

```bash
pnpm build      # be (tsc) + sdk (tsc) + fe and landing-page (next build)
pnpm lint
pnpm typecheck
pnpm test
```

Per package: `pnpm --filter fe dev`, `pnpm --filter be test`, `pnpm --filter @sterunxyz/sdk test`.

Contracts are a separate ecosystem, driven from `sc/`:

```bash
cd sc
stellar contract build            # REQUIRED before cargo test — some tests read the wasm
cargo test
node scripts/check-interface.mjs  # frozen spec vs wasm vs bindings
```

## Getting testnet sUSD in under 10 minutes

Paid categories charge an entry fee in **sUSD**, a classic Stellar asset. An account cannot hold one
without a **trustline**, and `RaceRecord.enter` rolls back entirely when it is missing. One command
handles all of it:

```bash
pnpm faucet --new
```

Every step is safe to repeat:

```
account GD7DHD3FDWZRBU5GCI5LTQT2VFRJXRTSCG6DJOP5SNVOATYE76POYVCE
  1/3 XLM       account created and funded by Friendbot
  2/3 trustline opened for sUSD
  3/3 payout    50 sUSD sent, tx 3688fa62…
  balance seen by contracts (SAC): 50 sUSD
```

That last line is read through the **SAC**, not through an explorer. It is the balance the contract
sees when `enter` charges the fee, which makes it the only number that proves the account can
actually pay.

| You | Command |
| --- | --- |
| need a fresh account as well | `pnpm faucet --new` |
| already have an account | `pnpm faucet --secret S...` |
| do **not** hold the distributor key | `pnpm faucet --new --no-payout` → account + trustline ready, ask the PM for sUSD |
| want a different amount | `pnpm faucet --secret S... --amount 25` |

Paying out sUSD needs `SUSD_DISTRIBUTOR_SECRET` in `be/.env` (see
[`be/.env.example`](be/.env.example)). Without it the first two steps still run and the tool says
what is missing. Issuer and SAC addresses are **never hardcoded** anywhere — they are read from
`docs/deployments.md`.

## The frozen spec — read this before writing a backend, SDK or app

The contract interface, event layout, error codes and the definitions of `participant_hash` and
TOTP are **frozen** in [`docs/specs/`](docs/specs/). If you are writing a client, that is the source
of truth — not `lib.rs`, and not this file.

```bash
bash docs/specs/verify.sh   # two reference implementations must agree on every vector
```

The rules for changing it are in [`docs/specs/CLAUDE.md`](docs/specs/CLAUDE.md). Error codes are
public ABI and are **never renumbered**.

## CI

| Workflow | What it protects |
| --- | --- |
| [`contracts.yml`](.github/workflows/contracts.yml) | contract build + tests, coverage ≥80% (currently 99%), frozen spec vs wasm vs bindings, the non-transferable export surface, and agreement between the two reference implementations |
| [`typescript.yml`](.github/workflows/typescript.yml) | install from the lockfile, lint, typecheck, build and test the whole TS workspace |

wasm sha256 hashes and the coverage table are written to the **job summary**, so they can be read
without installing Rust.

## Licence & context

Built for the **Instawards** grant (30 days). Testnet uses **sUSD**, which we issue ourselves;
mainnet will use USDC (Circle) — the only thing that changes is the SAC address RaceRecord holds,
with no change to contract code.
