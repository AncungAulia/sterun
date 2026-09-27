# A runner's public race record (STE-24) — design

**Route:** `/runner/[address]`, plus `/runner` to look an address up
**Built from:** `docs/design/profile/README.md` (STE-23, screens P1 to P12), `docs/specs/INTERFACE.md`
§2.1 to §2.4 and `docs/specs/HASH_AND_TOTP.md` §2 and §3 (both FROZEN), `docs/WEB_APP_IA.md` §3 and §3.2

The handoff already fixes the screens, the seven meanings of four chain states, the copy and the way
the proof block behaves. This document records only what the build decides on top of it.

---

## 1. Decisions taken with Ancung (16 Sep 2026)

1. **Two rounds.** Round 1 is the page: the history, the seven meanings, the summary, pagination, and
   the empty, invalid, unreachable and loading screens. Round 2 is the block that proves a record
   belongs to a person. The page is reviewable by screenshot before the proof exists.
2. **Three ways in.** "My race record" in the connected wallet's menu, "See your race record" on the
   entry success page, and `/runner`, where anyone can paste an address. The handoff did not design
   the lookup; it reuses the not-an-address check from P10.
3. **The salt can come from this device.** When the entry that made a record is stored here
   (`lib/entry-store.ts`, STE-21), the proof block offers "Use the receipt saved on this device".
   It fills the field on a press, never on its own, and the salt still goes nowhere: it is hashed in
   the browser with the other three fields. Anywhere else the runner pastes it from the receipt.

## 2. Where the build goes past the handoff

**A transaction link, when the index has one.** Handoff §9 says there is no transaction to link,
because RPC keeps events for about seven days. That was true of RPC and is no longer true of this
system: the indexer now stores `tx_hash` for each state change it saw
(`GET /records/:tokenId` → `transitions[]`, `be/src/routes/directory.ts`). So a card links the
transaction of its latest change when the index has one, and shows only the ledger when it does not.
The chain stays the truth for every fact on the card; the index adds a link and nothing else, and the
page renders fully with the index down, as the handoff requires.

**The record is built as the frozen JSON document.** STE-24 asks that what the page shows is valid
against RaceRecord JSON Schema v1.0. `buildRaceRecordDocument` from `@sterunxyz/sdk` validates its own
output, so the page's model for a card is produced through it, and a record the schema rejects is a
failing test rather than a card that quietly says something different from the document.

## 3. The seven meanings, as one pure function

```ts
type Meaning =
  | { kind: "entered" } | { kind: "collected" }
  | { kind: "finished"; timeS: number } | { kind: "finished-untimed" }
  | { kind: "dnf" } | { kind: "dns" } | { kind: "cancelled" };

function meaningOf(record: SterunRecord, eventStatus: EventStatus): Meaning;
```

In order: an event that is `Cancelled` wins over an `Entered` record (nothing on chain marks the
record); `Finished` splits on `finishTimeS === null`; `Dnf` splits on `claimedAt === null`. A finish
time of `null` is never rendered as `0`. Each meaning has its chip word, its icon shape and the value
that sits in the finish-time slot, exactly as the handoff's copy deck says.

## 4. Data

| Fact | From | When it fails |
| --- | --- | --- |
| The list of records and every field on them | `recordsOfDetailed(address)`, RPC | P11, "Could not reach the network". Never drawn as "no races" |
| Race name, date, status, distances | `getEventSummary(eventId)`, once per distinct event | the card keeps its chain facts and names the race by id |
| City | the event's metadata document, hash-checked (`metadataQuery`) | the card omits the city |
| Ledger and transaction link | `GET /records/:tokenId` (index) | the card omits both |

Newest first by `enteredAt`, never by bib. Twenty cards a page, client side: `records_of` returns
every id in one view call, so the page size is a rendering decision.

The address is checked in the browser before anything is called (P10), with the Stellar SDK's own
`StrKey` check, so a mistyped character is caught by its checksum and not only by its length.

## 5. Testing

- `meaningOf`: all seven, including a cancelled race over an `Entered` record, `Finished` with a null
  time, and `Dnf` with and without `claimedAt`.
- The finish time format, and that a null never prints `0`.
- The document: every fixture record passes `buildRaceRecordDocument`.
- The page: history in order, the summary numbers, pagination at 20, and P9, P10, P11 and P12 each
  distinct, above all that an RPC failure never reads as an empty history.
- Round 2: the hash against every vector in `docs/specs/vectors/participant_hash.json`, including
  NFC, whitespace and the rejection vectors, then match, no match, fields cleared after a check, and
  the salt never in the URL.
