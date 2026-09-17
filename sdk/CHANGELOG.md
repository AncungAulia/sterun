# Changelog — `@sterunxyz/sdk`

> **Renamed from `@sterunxyz/sdk` before the first publish (2026-09-10).** No
> version of this package was ever published under the old name, so nothing to
> migrate — but the old name appears in tickets, in `docs/`, and in commit
> history from before the rename, which is why it is recorded here rather than
> quietly dropped. The scope moved because the `sterun` npm org already belonged
> to another account of the same owner and an org name cannot be changed.

Two things are versioned here and they move independently:

- **the package**, `@sterunxyz/sdk`, following semver;
- **RaceRecord JSON Schema**, whose version is written inside every document it
  describes and inside `schema/race-record-v*.json`.

The package is `0.x` on purpose while the client surface settles. The **schema
is not** — it is `1.0.0` and frozen, because third parties store documents and
re-read them later, and a format that keeps moving is not a format.

## Schema compatibility rules

| Change | Version |
| --- | --- |
| new optional property, new enum member in a place that already tolerates unknown values | MINOR |
| relaxing a constraint (a pattern gets wider, a required field becomes optional) | MINOR |
| new **required** property, removing a property, tightening a constraint, renaming anything | **MAJOR** |
| changing how `participant_hash` is computed | **MAJOR**, and only via the procedure in `docs/specs/CLAUDE.md` |

A MAJOR schema version ships as a new file (`schema/race-record-v2.0.json`) and
a new `$id`. The old file stays where it is — documents that reference it are
already in other people's hands.

---

## [Unreleased]

### Added

- **`setRegistrationCloses(eventId, closesAt)` and `getRegistrationCloses(eventId)`** (STE-46,
  contracts v2.5). An event can close entries on its own at a date: from `closesAt` (unix seconds, the
  ledger's clock) on, `enter` reverts `RegistrationClosed(20)` while the event is still `Open`.
  `getRegistrationCloses` answers `null` for an event with no date, which is every event created
  before v2.5. A `closesAt` that is not a whole number or does not fit in a `u64` is refused before
  anything is signed. An extension changes what runners were promised: pair a later date with a
  signed announcement, which the contract does not check.
- `RegistrationClosed` (20) in the EventRegistry error table.
- **`recordResults(eventId, results)`** (STE-60, contracts v2.6): many results for one event in one
  organiser signature. Each result is `{ tokenId, kind: "timed", finishTimeS }`, `{ tokenId, kind:
  "untimed" }` or `{ tokenId, kind: "dnf" }`, the same `kind` words as the backend's results preview.
  **Atomic**: one invalid row reverts the batch. An empty list, more than `RECORD_RESULTS_MAX_BATCH`
  rows, a token listed twice, or a time outside 1..u32 is refused before signing.
- **`RECORD_RESULTS_MAX_BATCH = 120`** and **`chunkResults(results, size?)`**. 120 is measured against
  the per-transaction limits live on testnet and mainnet (identical on 2026-09-17): the 16,384 bytes
  of contract events bind first, and the network's simulation refuses 121.
- `ResultForAnotherEvent` (108) in the RaceRecord error table.

**Needs the v2.5 EventRegistry and the v2.6 RaceRecord.** Against older contracts these methods fail
with a host error, because the functions do not exist yet.

## [0.3.1] — 2026-09-17

### Fixed

- **A write that simulated cleanly and then failed on the ledger now throws the contract error it
  failed with** (STE-61). Two scanner desks claiming one race pack in the same ledger, or two runners
  taking the last place, used to throw `SterunNetworkError: ... could not be simulated: Cannot read
  properties of undefined (reading 'type')`: stellar-sdk 17 leaves `returnValue: undefined` on a
  FAILED transaction and its `result` getter crashes on it, so the `AlreadyClaimed` / `QuotaFull` the
  ledger recorded was lost. `runWrite` now checks for `FAILED` before reading the result and decodes
  the error from the transaction's diagnostic events (`host_fn_failed`).

### Added

- `SterunContractError.phase` (`"simulation"` or `"ledger"`), `.txHash` and `.ledger`. A ledger failure
  is a real, fee-charged transaction you can link to; a simulation refusal submitted nothing.
- `SterunNetworkError.txHash`, for a ledger failure whose reason the RPC response does not carry.
- `ledgerFailureCode(diagnosticEvents)`: the contract error code in a failed transaction's events.

## [0.3.0] — 2026-09-16

### Added

- `announcementMessage(fields)` and `verifyAnnouncement(announcement)` for signed event announcements
  (STE-40). The first builds the exact text an organiser's wallet signs (`signMessage`); the second
  checks a signature, ed25519 or SEP-53, without trusting any server. Whether the signer is the
  organiser is a separate chain read: `getEvent(eventId).organiser`. Browser-safe.
- `announcementBodySha256(body)` and `ANNOUNCEMENT_HEADER` (`"Sterun announcement v1"`).
- `schema/announcement-v1.vectors.json`: the test vectors the SDK and the backend are both pinned to.

## [0.2.0] — 2026-09-15

### Added

- `SterunClient.increaseQuota({ eventId, categoryId, newQuota })` — raise a
  sold-out category's quota for a second batch (contracts v2.4, STE-55/STE-56).
  `newQuota` is the new total; equal to or below the current quota reverts
  `QuotaNotIncreased(19)`, since a published quota only ever rises. The error
  map already names 19.
- `SterunRecord.addonIds: number[]` — the add-ons an entry paid for, in the
  order they were reserved, read from `RecordData.addon_ids` (v2, STE-42). `[]`
  when it bought none, and `[]` rather than `undefined` for a v1-shaped record,
  so `record.addonIds.length` is always safe. Ids only; resolve names and prices
  with `listAddOns(eventId)`. A new **required** field on a returned type, so a
  consumer constructing `SterunRecord` literals must add it — which is why this
  is a MINOR bump at release rather than a patch.
- `recordFinishUntimed(tokenId, options?)` — marks a finish with **no official
  time**, for events without chip timing (STE-41, `docs/specs/INTERFACE.md`
  v2.2.0). Organiser only, from `RacepackClaimed` only, terminal. The record
  comes back as `state: "Finished"` with `finishTimeS: null`, and that pair is
  the marker for "finished, no official time". It is **not**
  `recordFinish(tokenId, 0)`, which the contract still refuses
  (`InvalidFinishTime`, 105).
- The vendored race-record bindings carry `record_finish_untimed` and the
  `RecordFinishedUntimed` event.

### Behaviour to be aware of

- A `Finished` `SterunRecord` may now have `finishTimeS === null`. Code that
  formatted every finished record's time must handle that case and must never
  render it as `0`.

---

## [0.1.0] — 2026-09-05

First release. RaceRecord JSON Schema **v1.0.0**.

### Added

- `SterunClient`: the full flow over both contracts — `createEvent`,
  `addCategory`, `setEventStatus`, `addScanner`, `removeScanner`, `enter`,
  `claimRacepack`, `recordFinish`, `recordDnf`, `extendRecordTtl`, plus every
  view (`getEvent`, `getCategory`, `listCategories`, `getOrganiser`,
  `isScanner`, `eventCount`, `categoryCount`, `recordOf`, `recordsOf`,
  `recordsOfDetailed`, `verify`, `ownerOf`, `balanceOf`, `totalSupply`,
  `tokenUri`, `feeToken`, `wiredRegistry`).
- Reads need no wallet: no signer, no funded account, no browser extension.
- Typed errors. `SterunContractError` carries the variant, the numeric code and
  which contract produced it, decoded through the frozen error bands of
  `docs/specs/INTERFACE.md` §3. `SterunNetworkError` is kept separate, because a
  revert is an answer and a network failure is the absence of one.
- Per-call actors via `CallOptions` (`publicKey` + `signTransaction`), so one
  client serves organiser, runner and scanner. `SterunClient.as(keypair)` is the
  Node shorthand; a browser passes the wallet's own pair.
- **RaceRecord JSON Schema v1.0.0** — `raceRecordDocumentSchema` (zod),
  `parseRaceRecordDocument`, `safeParseRaceRecordDocument`,
  `raceRecordJsonSchema()`, and the generated document at
  `schema/race-record-v1.0.json`.
- `raceRecordDocument(tokenId)` / `raceRecordDocumentsOf(runner)` build that
  document straight from chain reads, with no wallet.

### Notes for anyone reading a document

- Every 64- and 128-bit value (`price_stroops`, `starts_at`, `entered_at`,
  `claimed_at`, `result_at`) is a **decimal string**. `JSON.parse` produces
  IEEE-754 doubles and `price_stroops` is an `i128`; a fee that round-trips
  through a double can come back a stroop short.
- `schema_version` is inside every document. If you saved a file, you have the
  file — not the URL it came from.
- The document carries `participant_hash` and nothing else about the person. No
  name, no national ID, no emergency contact, no salt, no TOTP secret. The
  schema is closed (`additionalProperties: false`) at every level, so a document
  carrying any of those is invalid rather than quietly tolerated.
- `links.transactions` is nullable throughout. Chain state does not record which
  transaction produced it; that provenance comes from the Sterun indexer, and a
  document without it is still valid.

### Contracts this release speaks to

Frozen at `docs/specs/INTERFACE.md` **v1.0.0**. Contract ids are **arguments,
not constants** — v1 contracts are non-upgradeable, so a redeploy means a new
pair of addresses, and a client with them baked in would keep talking to the old
pair until somebody cut a release. The live testnet pair is in
`docs/deployments.md`.
