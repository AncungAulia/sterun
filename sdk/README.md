# `@sterun/sdk`

Call the Sterun race-record contracts from TypeScript. No Rust, no Stellar CLI,
no hand-built XDR.

Sterun issues one **non-transferable** on-chain record per race entry, bound to
the runner who registered. This package is the client for the two contracts that
do it, frozen at [`docs/specs/INTERFACE.md`](../docs/specs/INTERFACE.md) v1.0.0.

```bash
npm install @sterun/sdk
```

Ships with **RaceRecord JSON Schema v1.0** — the public format a runner profile
renders and a third party verifies.

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

## The public document format

`raceRecordDocument` joins a record to its event and its category so the result
stands alone. A stranger reading it does not have to ask what `event_id 2,
category_id 1` was.

```ts
import { parseRaceRecordDocument } from "@sterun/sdk";

const doc = await sterun.raceRecordDocument(tokenId);   // no wallet needed
```

```json
{
  "schema_version": "1.0.0",
  "network": { "passphrase": "Test SDF Network ; September 2015", "…": "…" },
  "token_id": 0,
  "owner": "GAJVXTF5…CUPWVR",
  "bib_no": 0,
  "participant_hash": "feb3cea9…3fe29",
  "state": "Finished",
  "event": { "event_id": 0, "name": "Sterun Testnet Rehearsal 2026", "…": "…" },
  "category": { "code": "10K", "distance_m": 10000, "price_stroops": "50000000" },
  "timings": { "entered_at": "1788252277", "finish_time_s": 3161, "…": "…" },
  "links": { "record_contract": "https://stellar.expert/…", "…": "…" }
}
```

Validate anything that arrived from outside your process — a file, an API
response, a copy somebody emailed you:

```ts
const record = parseRaceRecordDocument(untrusted);   // throws ZodError, listing every problem
```

The JSON Schema itself ships in the package at
`node_modules/@sterun/sdk/schema/race-record-v1.0.json`, so you can hand it to
any validator in any language. `raceRecordJsonSchema()` returns the same
document.

Three things about it are worth knowing before you write a consumer:

1. **Every 64- and 128-bit value is a decimal string** — `price_stroops`,
   `starts_at`, `entered_at`, `claimed_at`, `result_at`. `JSON.parse` produces
   doubles, integers above 2^53 lose precision silently, and `price_stroops` is
   an `i128`. Parse them with `BigInt`, never `Number`.
2. **The version is inside the document.** If you stored one, you have the file
   and not the URL it came from; `schema_version` is how you know how to read it.
3. **It carries no personal data and cannot be made to.** Only
   `participant_hash`, which is a commitment: whoever holds the off-chain data
   plus the salt can recompute it and prove the record is that person, and
   nobody can work backwards from it. The schema is closed at every level, so a
   document carrying a name or a national ID is *invalid*, not tolerated.

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

## Versioning

The **package** is `0.x` while the client surface settles. The **schema** is
`1.0.0` and frozen — third parties store documents and re-read them later, and a
format that keeps moving is not a format. The two move independently;
[`CHANGELOG.md`](CHANGELOG.md) has the compatibility rules.

## Development

```bash
pnpm install
pnpm --filter @sterun/sdk test   # 134 tests, no network
pnpm --filter @sterun/sdk e2e    # the full flow against live testnet
```

The generated contract bindings are vendored into `vendor/` and compiled by a
`prebuild` hook, so a fresh clone needs no extra step. `pnpm --filter
@sterun/sdk vendor` refreshes them after the contracts are regenerated; a test
fails if the copies drift. See [`CLAUDE.md`](CLAUDE.md).
