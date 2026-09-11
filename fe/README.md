# The Sterun web app (`fe/`)

Sterun's web app: the event directory, the entry flow, the organiser console, the QR pass, and the
volunteer scanner. Next.js App Router + Tailwind v4, reading Soroban contracts on Stellar testnet.

Before writing code, read [`guides/ARCHITECTURE.md`](guides/ARCHITECTURE.md) (the folder structure
and its rules) and [`../docs/WEB_APP_IA.md`](../docs/WEB_APP_IA.md) (the page map).

## Running it

Every command from the **repository root**, not from `fe/` — this folder is a pnpm workspace member
and has no lockfile of its own.

```bash
pnpm install                     # once, from the root
pnpm --filter fe dev             # http://localhost:3000
```

There is no configuration step: the testnet values are committed in `fe/.env`.

Other commands:

```bash
pnpm --filter fe build
pnpm --filter fe typecheck       # next typegen && tsc --noEmit
pnpm --filter fe lint
```

The `next typegen` in `typecheck` is not decoration: `app/layout.tsx` uses `LayoutProps<"/">`, a
global type Next generates into `.next/types/` which is not committed. Without that step, `tsc` on a
machine that has never built fails with `TS2304: Cannot find name 'LayoutProps'`.

## Configuration

The default values live in `fe/.env` and **are committed**: all of them are public, the same as what
is in `docs/deployments.md`. To change them on your own machine, create a `fe/.env.local` that
overrides them (that file is not in git). Contract addresses are **not** hardcoded in the code —
their source is [`../docs/deployments.md`](../docs/deployments.md), and they are validated at boot in
`src/lib/env.ts`.

| Variable | Contents |
| --- | --- |
| `NEXT_PUBLIC_RPC_URL` | `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` |
| `NEXT_PUBLIC_EVENT_REGISTRY` | the EventRegistry contract id |
| `NEXT_PUBLIC_RACE_RECORD` | the RaceRecord contract id |
| `NEXT_PUBLIC_SUSD_SAC` | the sUSD SAC contract id |
| `NEXT_PUBLIC_API_URL` | the `be/` backend's base URL; may be empty until it is used |

A missing variable, or one that is not a valid contract id, means the app fails at boot with a
message naming the variable — rather than a vague error halfway down a page.

## Wallets

Stellar Wallets Kit (`@creit.tech/stellar-wallets-kit`), installed from **npm** — its official
documentation points at JSR with a differently spelled scope (`@creit-tech`, with a hyphen), but the
npm package `@creit.tech/...` is the one that fits this pnpm workspace and requires
`@stellar/stellar-sdk ^17.0.0`, matching `pnpm.overrides` at the root.

Kit v2 uses a **static** class rather than an instance, and stores the chosen wallet and address in
localStorage itself. That is what keeps a page refresh connected without us storing anything. All of
its use is confined to `src/lib/wallet.ts`.

To test it: install [Freighter](https://freighter.app), point it at **testnet**, and click
`Connect wallet` in the header.

## Structure

```
app/                routing only, no logic
  (browse)/         public pages, network-only
src/
  components/       elements/ (primitives) + layouts/ (structure)
  hooks/            every hook
  lib/              chain, backend, storage
  utils/            pure helpers
guides/             ARCHITECTURE.md
```

The full rules are in [`guides/ARCHITECTURE.md`](guides/ARCHITECTURE.md). The two broken most often:
**UI text must be in English**, and **never use an em dash in UI text**.
