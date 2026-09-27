# Sterun Web App — Architecture Guide

> Read this before writing a single line of code in `fe/`.
> Read it alongside [`docs/WEB_APP_IA.md`](../../docs/WEB_APP_IA.md) (which pages exist and what is
> on them), [`fe/app/tokens.css`](../app/tokens.css) (Nabil's design tokens), and
> [`docs/specs/`](../../docs/specs/) (the contract interface + the hash/TOTP spec, both **frozen**).

---

## 1. Overview

`fe/` is a Next.js App Router application holding **four different surfaces** in one deployment: the
public directory, the entrant flow, the organiser console, and a volunteer scanner that has to work
without a signal.

It is not a marketing site (that is `landing-page/`, Nabil's), and it is not a CRUD app. The truth
lives on a blockchain, not in a database of ours. Most of the rules in this document follow from
those two facts.

How responsibility is split:

| Layer | Contents |
| --- | --- |
| `app/` | routing only: no logic, no UI |
| `src/modules/` | one folder per feature: its pages, components, hooks, logic and tests |
| `src/components/` | components two or more features use, by purpose: `ui` (shadcn), `form`, `feedback`, `layout`, `wallet` |
| `src/hooks/` | hooks two or more features use |
| `src/lib/` | shared chain, wallet, backend and place code, by purpose |
| `src/utils/` | pure helpers with no side effects |

The rule that decides where a file goes, and why, is in §4. The reasoning for grouping by feature
is in `docs/superpowers/specs/2026-09-15-fe-folder-structure-design.md`.

---

## 2. Stack

| Package | What for |
| --- | --- |
| `next` 16 (App Router) | the framework |
| `typescript` 5 | the language |
| `tailwindcss` v4 | styling — tokens from `app/tokens.css`, not a JS config |
| `@sterunxyz/sdk` | the **only** way to talk to the contracts |
| `@creit.tech/stellar-wallets-kit` | wallet connections (Freighter, xBull, Albedo, WalletConnect, Ledger) |
| `@tanstack/react-query` | caching and refetching chain reads |
| `zustand` | small global state (the active wallet, online status) |
| `idb` | an IndexedDB wrapper for pass secrets, rosters, and the claim queue |
| `qrcode` | rendering the QR pass |
| `lucide-react` | icons |

**The Wallets Kit question is settled: npm, scope `@creit.tech` (with a dot), `^2.6.0`.** The
official documentation ([stellarwalletskit.dev](https://stellarwalletskit.dev)) points at **JSR**
under a differently spelled scope (`@creit-tech`, with a hyphen). The npm package is the one that
fits this pnpm workspace and requires `@stellar/stellar-sdk ^17.0.0`, matching `pnpm.overrides` at
the root. Kit v2 uses a **static** class rather than an instance and persists the chosen wallet and
address to localStorage itself, which is what keeps a refresh connected without us storing anything.

What is **not** used, and why:

- **`@stellar/stellar-sdk` directly** — `@sterunxyz/sdk` uses it internally; do not call it yourself
  from a component. Its version is already forced to one through `pnpm.overrides` at the root; two
  copies in one graph means two RPC clients and signer objects crossing a major version.
- **`sc/bindings/*` directly** — that is generator output. `@sterunxyz/sdk` already wraps it and adds
  the error handling we need.
- **Dark mode / `next-themes`** — an STE-7 decision: v1 is light only. The QR pass also forces a
  light surface, because a camera needs the contrast.

---

## 3. Folder structure

What exists today. Routes and modules marked *(planned)* are the ones STE-21 round 2, STE-22 and
STE-24 still build; they follow the same shape.

```
fe/
├── app/                                  ← ROUTING ONLY. No logic, no UI.
│   ├── (browse)/
│   │   ├── page.tsx                      /                       → modules/directory
│   │   ├── events/[eventId]/page.tsx     /events/:id             → modules/event-detail
│   │   ├── events/[eventId]/enter/       /events/:id/enter       → modules/entry
│   │   ├── events/[eventId]/entered/[tokenId]/                   → modules/entry
│   │   ├── preview/done/page.tsx         a preview of the wizard's last step
│   │   └── runner/[address]/, profile/   (planned, STE-24)
│   ├── (organiser)/org/
│   │   ├── (console)/page.tsx            /org                    → modules/organiser/home
│   │   ├── (console)/events/[eventId]/   /org/events/:id         → modules/organiser/race
│   │   └── new/page.tsx                  /org/new                → modules/organiser/create
│   ├── (offline)/
│   │   ├── pass/[tokenId]/               /pass/:token            → modules/pass
│   │   └── scan/                         (planned, STE-22)
│   ├── layout.tsx, providers.tsx, not-found.tsx
│   ├── globals.css
│   └── tokens.css                        ← NABIL'S. Do not edit without talking to him.
│
├── public/                               brand logos, places/<ISO2>.json
├── guides/ARCHITECTURE.md                ← this file
├── test/                                 setup.ts, e2e/, and the checks no one feature owns
│
└── src/
    ├── components/
    │   ├── ui/          shadcn. Generated, but ours: editing is allowed.
    │   ├── form/        Field, Help, DateTimeField, SearchableSelect, Stepper
    │   ├── feedback/    ErrorNotice, EmptyState, EventStatusBadge, NonRefundableNotice
    │   ├── layout/      Header, SiteFrame, NotFoundMessage
    │   └── wallet/      WalletButton, WalletGate, GetTestSusd
    ├── hooks/           useWallet, useEvents, useEventMetadata, useRunnerRecords, useArea,
    │                    useNowSeconds, useSusdBalance, useChainWrite, useMediaQuery
    ├── lib/
    │   ├── chain/       sterun (the SterunClient), env
    │   ├── event/       events, metadata, status-label, add-ons
    │   ├── wallet/      kit (Stellar Wallets Kit), freighter-mobile, susd
    │   ├── api/         client (the be/ backend), upload, errors, plain-error
    │   ├── place/       places, area
    │   └── confetti.ts
    ├── data/            places.json (generated by scripts/build-places.mjs)
    ├── utils/           cn, format, geo, missing-field
    └── modules/
        ├── directory/       Directory
        │   ├── components/  EventCard, FeaturedEvents, FilterDrawer, AreaPicker, …
        │   ├── hooks/       useEventDocuments, useNearbyPrompt
        │   └── lib/         browse, filters
        ├── event-detail/    EventDetail, EventView (the organiser's preview reuses it)
        │   └── components/  TabDetails, TabTimeline, TabCategories, TabAddOns, …
        ├── entry/           EntryFlow, EnteredPage
        │   ├── components/  StepDistance, StepRunner, StepPay, PayDialog, Bib, …
        │   ├── hooks/       useEntryAttempt
        │   └── lib/         attempt, basket, details, gate, receipt, entry-store, participants, …
        ├── organiser/
        │   ├── shared/      the console frame, NeedsBell, StatCard, NotAllowed,
        │   │                useOrganiser, useNeeds, useRaceRecords, chart, needs, records, scanners
        │   ├── home/        OrganiserHome, RacesTable, EntriesComparison, TrendingEntries
        │   ├── create/      CreateEvent, the Step* components and their fields, useEventRun,
        │   │                event-document, run, preview, missing
        │   └── race/        RaceConsole, the Overview / Entries / Scanners tabs, race, status-action
        ├── pass/             PassPage
        │   ├── components/   PassQr, Countdown, CodeRow, ClaimedPanel, GetPassHere, …
        │   ├── hooks/        usePassCode, useOnline
        │   └── lib/          totp, pass-api
        ├── profile/         (planned)
        └── scanner/         (planned)
```

Inside any folder the shape repeats: the page components at its root, then `components/`,
`hooks/`, `lib/`, and `__tests__/` holding the tests of the files beside it.

---

## 4. The rules per layer

### 4.1 `app/` — routing only

A `page.tsx` does one thing: render its module's component.

```tsx
// app/(browse)/page.tsx
import { Directory } from "@/modules/directory/Directory";

export default function DirectoryPage() {
  return <Directory />;
}
```

No logic, no hooks, no UI. If you are tempted to write a `useState` in a `page.tsx`, that is a sign
the code belongs in `modules/`.

Route groups (`(browse)`, `(organiser)`, `(offline)`) **do not change URLs**. They exist for two
things: giving each surface a different layout, and marking the service worker's boundary.

### 4.2 Where a file goes

**Used by one feature: it lives in that feature's folder.** Its component goes in the module's
`components/`, its hook in `hooks/`, its logic in `lib/`. **Used by two or more: it moves up**
to `src/components/`, `src/hooks/` or `src/lib/`, into the folder named for what it is for.
When a second feature needs something, promote it in the same commit; do not import it from where
it sits.

Two deliberate exceptions: `hooks/useChainWrite.ts` is shared with one user today because the
scanner writes to the chain through it next, and `components/ui/` is shadcn's and stays whole.

**A module never imports another module's `components/`, `hooks/` or `lib/`.** It may render
another module's page component (the wizard's Review step renders `event-detail/EventView`,
the public race page, as its preview). Shared code never imports from `modules/`.

**One Sterun-specific rule:** a module in `(offline)` (`pass/`, `scanner/`) **must not import
anything from a `(browse)` or `(organiser)` module**. Both have to live in a bundle the service
worker precaches, without dragging in pages that must not be cached.

### 4.3 `src/components/` — shared components

- `ui/`: shadcn primitives. `form/`: fields and what builds a form. `feedback/`: notices,
  badges, empty and error states. `layout/`: the site's chrome. `wallet/`: connecting, gating and
  topping up a wallet.
- **No business logic** in `ui/`, `form/` and `feedback/`: no chain-reading hooks, no SDK calls,
  driven by props alone. `wallet/` is the exception by nature.
- Every visual value comes from a token (§6).

### 4.4 `src/modules/` — one folder per feature

The page component at the module's root is what `app/` renders. The organiser module is large
enough to be split once more, into `shared/`, `home/`, `create/` and `race/`, one per page plus
what they share.

### 4.5 Hooks

The rules, wherever a hook lives:
- One hook per file, named `use*.ts`
- **Read hooks** use React Query on top of a read-only `SterunClient`. Do not `fetch` the RPC
  directly from a module.
- **Write hooks** use a signing `SterunClient` and **must** expose `isPending` (waiting for the
  wallet) and `isConfirming` (waiting for the chain). Those two states feel very different to a user:
  one is waiting for them, the other for the network.
- Always guard with `enabled: !!address` before a wallet is connected
- Zustand stores are hooks too, named `use*Store.ts`

### 4.6 `src/lib/` — chain, wallet, backend

Everything that knows about Stellar, the backend, or storage. A component must not know the details.

| Folder | Contents |
| --- | --- |
| `chain/` | `sterun.ts`: the read-only `SterunClient`; `env.ts`: contract addresses and API url from env, validated at boot |
| `event/` | `events.ts`: the event list and one event's summary; `metadata.ts`: download a race document and check its hash; `status-label.ts`; `add-ons.ts`: joins a document's add-ons to their chain rows |
| `wallet/` | `kit.ts`: the Wallets Kit setup and signing adapters; `freighter-mobile.ts`; `susd.ts`: balance, trustline, faucet |
| `api/` | `client.ts`: `apiFetch()` to `be/`; `upload.ts`; `errors.ts`: every error to one sentence; `plain-error.ts` |
| `place/` | `places.ts`: countries, provinces, cities; `area.ts`: the visitor's area |

A feature's own storage or backend calls live in its module (`entry/lib/entry-store.ts`,
`entry/lib/participants.ts`, `organiser/shared/lib/records.ts`). TOTP and hashing for the pass and
the scanner arrive with them.

### 4.7 Tests

A feature's tests sit in `__tests__/` in the folder of the file they test
(`modules/entry/components/__tests__/PayDialog.test.tsx`). `test/` keeps `setup.ts`, the opt-in
e2e runs, and the checks no one feature owns (UI rules, the committed `.env`, the route layouts,
`app/providers.tsx`). `ui-rules.test.ts` does not sweep `__tests__/`: a test's strings are not UI.

### 4.8 `src/utils/` — pure helpers

Functions with no state and no coupling to the chain. `shortAddress()`, `formatPrice()` (7-decimal
stroops → a human display), `formatDuration()` (seconds → `hh:mm:ss`), `formatDistance()`.

---

## 5. Data access rules

### 5.0 There is no "list events" in the contract, and that is deliberate

`EventRegistry` has only `event_count` + `get_event(id)`. A view returning an unbounded vector gets
slower and more expensive exactly as the protocol succeeds, until one day it crosses a resource limit
and the directory stops loading for everyone. So the list is assembled client-side
(`lib/event/events.ts`): read `event_count`, then `get_event` for each id in parallel.

Two failures there are **not the same**, and the difference is visible on screen:

| What failed | What is done |
| --- | --- |
| one id the registry counted but which cannot be read | it goes into `unreadable`, the rest still display (a ledger entry can expire in Soroban) |
| one event's categories | the event still displays, without its categories |
| `event_count` itself (the RPC is down) | **throw** — a dead RPC and an empty registry must never look the same |

That last one is a rule, not a preference: drawing "no events yet" on top of a dead network tells
every visitor the protocol is used by nobody.

### 5.1 Four sources, and which one is right

| Source | Used for | Nature |
| --- | --- | --- |
| The chain via `@sterunxyz/sdk` | everything that has to be correct | **authoritative** |
| The `be/` indexer (`/events`, `/records`) | long lists, filtering, speed | fast, may lag |
| The `be/` vault (`/participants`) | submitting PII, one's own summary | never returns PII |
| The `be/` roster (`/events/:id/roster`) | the scanner only | contains `totp_secret`, the most sensitive thing there is |

The rule: **the indexer may accelerate, it may not decide**. A number that drives a decision —
remaining quota, a record's state, the result of `verify` — is read from the chain. If the two
disagree, the chain is right and the UI must not quietly show the wrong one.

### 5.2 `SterunClient` — read-only vs signing

Public pages **need no wallet at all**:

```ts
// src/lib/chain/sterun.ts
import { SterunClient, TESTNET } from "@sterunxyz/sdk";
import { CONTRACTS } from "./env";

export const readClient = new SterunClient({ ...TESTNET, contracts: CONTRACTS });
```

To write, the actor is decided **per call**, not per client. That matters in Sterun because one flow
involves four different signers within minutes: the organiser opens the event, an entrant pays, a
scanner scans, the organiser publishes the results.

```ts
await sterun.enter(
  { runner, eventId, categoryId, addOnIds, participantHash },
  { publicKey: runner, signTransaction },
);
```

`publicKey` is not decoration next to `signTransaction`: it is the source account used to build and
simulate the transaction, and **the simulation is what records the auth entries**. Simulating with
the wrong address produces an auth tree for that address, so even a correct signature will not
satisfy it.

Every write function returns a `SentResult<T>`:

```ts
{ value: T, txHash: string, ledger: number | null }
```

`txHash` is what goes into an explorer link. **Always show it** after a successful action — it is
the evidence this entire product sells.

### 5.3 Contract addresses from env, never hardcoded

`@sterunxyz/sdk` deliberately does not carry contract addresses (the reasoning is in
`sdk/src/network.ts`): a redeploy means a **new pair of addresses**, and a constant inside the
package would quietly point at the old pair. That has already happened once — the v2 pair replaced
the v1 pair on 2026-09-09.

The source of truth for addresses: [`docs/deployments.md`](../../docs/deployments.md). In the app
they arrive through env and are validated in `lib/chain/env.ts` at boot — rather than being checked one by
one at each point of use.

```
NEXT_PUBLIC_EVENT_REGISTRY=CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU
NEXT_PUBLIC_RACE_RECORD=CCVW7WVCPHLPQASIDE6DLT7P7YCE3VUNGRCWDVKEA7XAD56LX22HA6NW
NEXT_PUBLIC_SUSD_SAC=CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU
NEXT_PUBLIC_API_URL=…
```

### 5.4 PII never touches the chain, and the hash is computed in the browser

The entrant form sends the name, national ID and emergency contact **to the backend only**. What
reaches the contract is `participant_hash` alone.

On the profile page, the identity-check block computes the hash **entirely in the visitor's browser**
and calls `verify(token_id, hash)`. The PII is not sent to any server, ours included. If you are
tempted to send it to the backend "to make it easier", that voids the product's core claim.

---

## 6. UI rules

### 6.1 Language: all UI text in **English**

Every piece of text a user sees is written in English: button labels, headings, error messages,
empty states, help text, units, placeholders.

```tsx
// WRONG
<Button>Daftar sekarang</Button>
<EmptyState>Belum ada event</EmptyState>

// RIGHT
<Button>Register</Button>
<EmptyState>No events yet</EmptyState>
```

Since 2026-09-10 the `.md` documents are English too, including this one, because the repository is
reviewed from outside the team. Code comments always were. So this is now one rule rather than
several.

### 6.2 Never use an em dash in UI text

The characters `—` (em dash) and `–` (en dash) are **forbidden** in text a user sees.

```tsx
// WRONG
<p>Registration closes soon — don&apos;t wait</p>

// RIGHT
<p>Registration closes soon. Do not wait.</p>
<p>Registration closes soon, so do not wait.</p>
```

The fix: split it into two sentences, or use a comma, or brackets. If a separator is genuinely
needed, use an ordinary hyphen (`-`).

This ban is **for UI text only**. Code comments and `.md` documents are unaffected.

### 6.3 Design tokens: never write a raw value

Nabil's rule, and it is absolute: **no hex, no font name, and no pixel value inside a component.** If
the value you need does not exist yet, add a new token to `tokens.css` — and because `tokens.css` has
two copies (`fe/` and `landing-page/`), change **both in one commit**.

What you need to know from `tokens.css`:

| Thing | Rule |
| --- | --- |
| `--color-teal` | if it is teal, it is clickable. Do not use it for decoration. |
| `--color-success` / `--color-danger` | the dark versions, for text and badges on light surfaces |
| `--color-success-strong` / `--color-danger-strong` | the light versions, **only for the scanner's GREEN/RED panels**, requiring text ≥32px |
| `--font-hero` | Big Shoulders 700, **only** at ≥48px (the landing hero, the scanner verdict) |
| `--font-display` | Poppins italic 500-600, for headings. Use the `.heading` / `.heading-strong` classes |
| `--font-sans` | Poppins roman 400-500, for body text. Never above 600. |
| `.numeric` | **required** for bibs, 6-digit codes, times, amounts and addresses |
| `--text-bib` | 72px, only for the bib number on the QR pass |

`.numeric` is not cosmetic: without tabular figures, a TOTP code changing every 30 seconds jitters in
width as its digits change.

The focus ring is already defined globally in `tokens.css`. Do not override it, and never write
`outline: none` without a replacement.

### 6.4 Errors are always mapped, never raw

A contract error code is a `u32` with no contract identity. `Error(Contract, #4)` can mean two
different things depending on which contract threw it. `@sterunxyz/sdk` already provides the mapping:

```ts
import { classifyContractError, SterunContractError } from "@sterunxyz/sdk";
```

The bands: `1..=99` EventRegistry, `100..=199` RaceRecord, `200+` OpenZeppelin.

Errors that **must have their own presentation**, not a generic toast: `QuotaFull(5)`,
`EventNotOpen(4)`, `NotAllowlistedOrganiser(18)`, `AlreadyClaimed(102)`, `InvalidState(103)`,
insufficient sUSD balance, and the user declining to sign. Each has a different way out for the user,
so each needs a different message.

---

## 7. Offline rules

These apply to `(offline)` only. Other pages **must not** be cached: a stale directory voids the
claim that the chain is the source of truth.

- The service worker precaches **only** `/pass/*` and `/scan/*`
- Every other route: network-only
- `totp.ts` and `hash.ts` **must be tested against `docs/specs/vectors/`**, not against your own
  implementation. The backend and the scanner have to produce identical numbers; testing against
  yourself only proves you are consistent with your own mistake.
- TOTP verification tolerance: ±1 step. Comparison is **constant-time**.
- The claim queue is persisted in IndexedDB with retry backoff, and must survive an app restart
- An `AlreadyClaimed` revert goes onto the flagged list and **must not disappear quietly**
- A drifted device clock raises a banner, because it is the most common cause of a false RED

---

## 8. Path alias

`@/` points at `src/`.

```json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
```

Never use `../../` across folders. Within a single module, relative imports are still fine.

---

## 9. Naming conventions

| Item | Convention | Example |
| --- | --- | --- |
| Component files | PascalCase | `EventCard.tsx` |
| Hook files | camelCase, `use` prefix | `useRecordsOf.ts` |
| Utility / lib files | camelCase | `format.ts`, `totp.ts` |
| Zustand stores | camelCase, `Store` suffix | `useWalletStore.ts` |
| Folders inside a module | lowercase, plural | `components/`, `hooks/`, `lib/`, `__tests__/` |
| Module folders | kebab-case | `event-detail/` |
| TypeScript types | PascalCase | `type ScanVerdict = …` |
| Constants | SCREAMING_SNAKE_CASE | `CONTRACTS`, `TOTP_STEP_SECONDS` |
| On-chain values | as they come from the SDK | `EventStatus`, `RecordState` |

---

## 10. Setup

From the **repository root**, not from `fe/`:

```bash
pnpm install
pnpm --filter fe dev
pnpm --filter fe typecheck
pnpm --filter fe lint
```

The five setup items STE-8 was to do before the first module — `next/font`, the metadata, creating
`src/` and repointing the path alias, `lib/chain/env.ts` with boot-time validation, and pinning the Wallets
Kit version — are **all done**. The Wallets Kit outcome is recorded in §2.

---

## 11. Checklist before writing a module

- [ ] `page.tsx` only renders the module's component, with no logic
- [ ] Chain reads go through a hook in `hooks/`, not a `fetch` from the module
- [ ] Write hooks expose `isPending` and `isConfirming`
- [ ] `txHash` is shown and clickable after every successful action
- [ ] Contract addresses come from `lib/chain/env.ts`, with nothing hardcoded
- [ ] Contract errors go through `classifyContractError`, not a raw message
- [ ] `QuotaFull`, `EventNotOpen`, `AlreadyClaimed`, `InvalidState` each have their own presentation
- [ ] **No em dash in UI text**
- [ ] **All UI text in English**
- [ ] No hex, font names or raw px in a component
- [ ] `.numeric` is applied to bibs, TOTP codes, times, amounts and addresses
- [ ] A file used by one feature lives in that feature; used by two, it moves up (§4.2)
- [ ] Tests sit in `__tests__/` beside the file they test
- [ ] Imports use `@/`, not `../../`
- [ ] `(offline)` modules import nothing from `(browse)` or `(organiser)`
- [ ] PII is never sent to the chain, and the identity-check hash is computed in the browser
- [ ] Loading, empty and error states all exist — a slow testnet is a normal condition
