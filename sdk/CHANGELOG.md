# Changelog — `@sterun/sdk`

Two things are versioned here and they move independently:

- **the package**, `@sterun/sdk`, following semver;
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
