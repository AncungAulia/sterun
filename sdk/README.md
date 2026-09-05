# `@sterun/sdk`

Call the Sterun race-record contracts from TypeScript. No Rust, no Stellar CLI,
no hand-built XDR.

Sterun issues one **non-transferable** on-chain record per race entry, bound to
the runner who registered. This package is the client for the two contracts that
do it, frozen at [`docs/specs/INTERFACE.md`](../docs/specs/INTERFACE.md) v1.0.0.

```bash
pnpm add @sterun/sdk
```

## Quickstart

Reading needs no wallet at all — no signer, no funded account, no browser
extension. That is what makes a public runner profile public.

```ts
import { SterunClient, TESTNET } from "@sterun/sdk";

const sterun = new SterunClient({
  ...TESTNET,
  contracts: {
    eventRegistry: "CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64",
    raceRecord: "CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4",
  },
});

const event = await sterun.getEvent(0);
// { eventId: 0, name: "Sterun Testnet Rehearsal 2026", status: "Open", … }

const records = await sterun.recordsOfDetailed("GAJVXTF5…CUPWVR");
// [{ tokenId: 0, bibNo: 0, state: "Finished", finishTimeS: 3161, … }]

await sterun.verify(0, participantHash); // true if this record is that person
```

Those are the live testnet addresses today. They are **arguments, not
constants**: v1 contracts are non-upgradeable, so a redeploy is a new pair of
addresses. The current pair is always in
[`docs/deployments.md`](../docs/deployments.md).

## Writing

Anything that changes state needs a signer and a source account. Both travel
together, per call, because one race flow changes actor several times: the
organiser opens the event, the runner pays and enters, an allowlisted scanner
device checks them in, the organiser publishes the result.

```ts
import { Keypair } from "@stellar/stellar-sdk";
import { SterunClient, TESTNET } from "@sterun/sdk";

const organiser = Keypair.fromSecret(process.env.ORGANISER_SECRET!);
const sterun = new SterunClient({ ...TESTNET, contracts });

const { value: eventId } = await sterun.createEvent(
  {
    organiser: organiser.publicKey(),
    name: "Bandung Half Marathon 2026",
    metadataHash: sha256OfYourMetadataDocument, // 64 hex chars
    uri: "https://example.org/events/bhm-2026.json",
    startsAt: 1789000000n,
  },
  SterunClient.as(organiser),
);

await sterun.addCategory(
  { eventId, code: "21K", distanceM: 21_097, quota: 500, priceStroops: 50_000_000n },
  SterunClient.as(organiser),
);
await sterun.setEventStatus(eventId, "Open", SterunClient.as(organiser));
```

In a browser, pass the wallet's own values instead of a keypair — Stellar
Wallets Kit's `signTransaction` already has the shape the SDK expects:

```ts
await sterun.enter(args, { publicKey: address, signTransaction: kit.signTransaction });
```

`publicKey` is not decoration next to the signer: it is the account the
transaction is **simulated** for, and the simulation is what records the auth
entries. Simulate as one address and sign as another and the signature will not
satisfy the auth tree.

## Entering a race

`enter` is one transaction. Inside it: the quota is reserved, the entry fee moves
from runner to organiser through the SEP-41 token, and the record is minted. The
runner signs a single auth tree that also covers the nested `transfer`, so the
fee cannot be paid without an entry and an entry cannot exist without the fee.

```ts
const { value: tokenId, txHash } = await sterun.enter(
  { runner: address, eventId, categoryId, participantHash },
  { publicKey: address, signTransaction: kit.signTransaction },
);
```

A free category (`priceStroops: 0n`) skips the token call entirely — the runner
needs neither a balance nor a trustline.

`participantHash` is `sha256(name || national_id || emergency_contact || salt)`,
defined byte-exactly in
[`docs/specs/HASH_AND_TOTP.md`](../docs/specs/HASH_AND_TOTP.md). Personal data
never goes on chain; only this commitment does.

## Errors you can branch on

Every failure is a typed error. A revert is a `SterunContractError` carrying the
variant, the code, and which contract it came from:

```ts
import { SterunContractError } from "@sterun/sdk";

try {
  await sterun.enter(args, actor);
} catch (e) {
  if (e instanceof SterunContractError) {
    switch (e.variant) {
      case "QuotaFull":     return showSoldOut();
      case "EventNotOpen":  return showNotYetOpen();
      case "AlreadyClaimed": return showPackAlreadyCollected();
    }
  }
  throw e;
}
```

`e.source` is worth reading. `enter` calls EventRegistry and the token contract
cross-contract, and their reverts propagate out unchanged — so `QuotaFull` out
of `enter` is EventRegistry's, and `e.source` says `"event-registry"`. The error
codes sit in disjoint bands precisely so the number alone identifies its origin
(`1..=99` EventRegistry, `100..=199` RaceRecord, `200+` OpenZeppelin).

A failure that is **not** a revert — transport, a malformed request, an archived
ledger entry — is a `SterunNetworkError` instead. The two demand opposite
responses: a revert is an answer and retrying gives the same one; a network
failure is the absence of an answer, and retrying is exactly right.

## Method reference

| Method | Contract | Authorized by |
| --- | --- | --- |
| `createEvent` | EventRegistry | the `organiser` argument |
| `addCategory`, `setEventStatus`, `addScanner`, `removeScanner` | EventRegistry | that event's organiser |
| `enter` | RaceRecord | the runner (one auth tree, fee included) |
| `claimRacepack` | RaceRecord | the organiser or an allowlisted scanner |
| `recordFinish`, `recordDnf` | RaceRecord | that event's organiser |
| `extendRecordTtl` | RaceRecord | nobody — permissionless rent top-up |
| `getEvent`, `getCategory`, `listCategories`, `getOrganiser`, `isScanner`, `eventCount`, `categoryCount` | EventRegistry | — (view) |
| `recordOf`, `recordsOf`, `recordsOfDetailed`, `verify`, `ownerOf`, `balanceOf`, `totalSupply`, `tokenUri`, `feeToken`, `wiredRegistry` | RaceRecord | — (view) |

Every write returns `{ value, txHash, ledger }` — `txHash` is what you paste
into stellar.expert.

## Amounts and times are `bigint`

`priceStroops` and `startsAt` are `bigint`, and stay that way. An entry fee is
`i128` in 7-decimal stroops: 5 sUSD is `50_000_000n`. A float round-trip of
0.1 sUSD is off by one stroop, and one stroop short of the fee makes `enter`
fail with nothing the caller can act on. `formatStroops` renders them for
display; there is deliberately no parser going the other way.

## What is not here

- **Transfer, approve, burn.** They do not exist on the contract either. A race
  record cannot change hands because no exported code path writes the owner —
  not because a guard refuses. See INTERFACE.md §4.
- **PII.** Names, national IDs and emergency contacts live in the Sterun
  backend, never on chain and never in this package.
- **TOTP / QR check-in codes.** Specified in `docs/specs/HASH_AND_TOTP.md` and
  implemented by the backend and the scanner PWA.

## Development

```bash
pnpm bindings                    # from the repo root — REQUIRED before install
pnpm install
pnpm --filter @sterun/sdk test   # 84 tests, no network
pnpm --filter @sterun/sdk e2e    # the full flow against live testnet
```

`pnpm bindings` before `pnpm install` is not a suggestion: pnpm copies `file:`
dependencies into its store, so installing before the bindings are built
captures a copy with no `dist/` and no amount of rebuilding fixes it. See
[`CLAUDE.md`](CLAUDE.md).
