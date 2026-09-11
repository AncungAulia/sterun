@AGENTS.md

# `landing-page/` — the landing page (CLAUDE.md)

The `@AGENTS.md` block above is rewritten by `next dev` — leave it, and commit it with your work.
What follows belongs to Sterun.

Owner: **Nabil**. Component C13 (landing page + design system).

The stack: **Next.js 16.3.3**, React 19.2.8, Tailwind v4, TypeScript 5, ESLint 9.

**This folder is a pnpm workspace member** (`pnpm-workspace.yaml` at the root), so the only lockfile
that applies is the root `pnpm-lock.yaml`:

```bash
pnpm install                       # from the repository ROOT
pnpm --filter landing-page dev
pnpm --filter landing-page build
pnpm --filter landing-page lint
```

> **There is a stray `landing-page/pnpm-lock.yaml` in the repo, and it should be deleted.** It is
> what a `pnpm install` run from inside this folder leaves behind: nothing reads it (CI installs the
> root lockfile with `--frozen-lockfile`), but it gets committed and it drifts. Do not run an install
> from inside this folder.

## What is already here

The design system landed with STE-7: `app/tokens.css` holds the brand, greyscale and status tokens,
and the `app/tokens` route renders every one of them in the situation it was chosen for. The usage
rules — asset files, minimum sizes, the type ladder, the contrast reasoning — are in
[`../docs/brand.md`](../docs/brand.md).

`app/tokens.css` is duplicated into `fe/`, deliberately: the two apps deploy separately. Change one,
change the other in the same commit. That duplication is the agreed answer until a shared package is
worth its cost; an honest duplicate beats a wrong abstraction.

## The limits of what the copy may claim

The landing page sells the protocol, so a claim on it has to be true:

- **Non-transferable** may be stated as fact — it is proven from the wasm export surface
  (`sc/contracts/race_record/CLAUDE.md`), not promised. Since v2 that claim has a boundary worth
  keeping: it is about the deployed wasm plus the admin key, not about an address forever
  (`docs/specs/INTERFACE.md` §4).
- **"Live on Stellar testnet" is true.** Take the addresses and explorer links from
  `docs/deployments.md` rather than retyping them; that is the only source updated when an address
  changes, and the addresses did change when v2 landed.
- Testnet uses **sUSD**, not USDC. USDC only applies on mainnet.

## Conventions

- The landing page's own copy: **Indonesian**, unless Axel decides otherwise. That is a decision
  about the product's audience, and it is separate from the repository's documentation, which is in
  English so it can be reviewed from outside the team.
- Accessibility and performance are not later polish — this is the page a grant reviewer opens first.
- Update this file as soon as the design system takes shape (tokens, components, how `fe/` consumes
  them).
