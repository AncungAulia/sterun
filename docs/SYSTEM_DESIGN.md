# STERUN - System Design

**Verified race records for running events on Stellar (Soroban).**
Design document v1.0 - diagrams and architecture only, no implementation code. Covers Instawards deliverables D1 (contracts), D2 (TypeScript SDK + schema), D3 (web app + race-day scanner PWA).

Team: **Ancung** (frontend), **Nabil** (frontend / landing / design), **James** (backend), **Axel** (smart contracts / AI).

---

## 1. Overview

Sterun is a race record protocol for running events, built on Stellar smart contracts (Soroban). Each race entry is issued as a non-transferable on-chain record bound to the runner who registered, so the organiser's participant list always matches the person actually on the course, which is what medical, emergency, and insurance handling depend on. The record moves through a fixed lifecycle (Entered, RacepackClaimed, Finished, or DNF), which makes a second race-pack collection impossible at the contract level and gives every runner a verifiable race history that is not locked inside one organiser's database. Personal data never touches the chain; only a salted hash links the record to the registered person.

---

## 2. System architecture

Three layers. On-chain holds the truth (entries, lifecycle, results, payment). Off-chain holds personal data and fast query indexes. Clients (web app, scanner PWA) talk to the chain through the typed SDK and to the backend for PII-adjacent flows.

```mermaid
graph TB
    subgraph ONCHAIN["Stellar Testnet - on-chain"]
        ER["EventRegistry contract<br/>events, categories, quotas, prices,<br/>organiser + scanner rights"]
        RR["RaceRecord contract<br/>OZ Stellar non-fungible base<br/>NON-transferable records + lifecycle"]
        SAC["USDC Stellar Asset Contract<br/>SEP-41 token interface"]
    end

    subgraph OFFCHAIN["Off-chain - Sterun backend (James)"]
        API["Backend API<br/>participant PII vault, salts,<br/>QR secrets, roster bundles"]
        IDX["Indexer<br/>polls RPC getEvents,<br/>materialises directory + history"]
        PG[("Postgres<br/>PII encrypted at rest")]
    end

    subgraph SDKL["D2 - @sterun/sdk (TypeScript)"]
        BIND["Generated contract bindings"]
        CLIENT["SterunClient<br/>createEvent · addCategory · enter ·<br/>claimRacepack · recordFinish ·<br/>verify · recordsOf"]
        SCHEMA["RaceRecord JSON Schema v1.0"]
    end

    subgraph CLIENTS["D3 - Clients"]
        WEB["Web app (Next.js)<br/>directory · entry + pay · QR/bib ·<br/>runner profile · organiser console"]
        SCAN["Scanner PWA<br/>volunteer check-in,<br/>offline roster + claim queue"]
    end

    subgraph EXT["External"]
        RPC["Stellar RPC<br/>simulate / send tx / getEvents"]
        WK["Stellar Wallets Kit<br/>Freighter, xBull, Albedo, WalletConnect…"]
    end

    RR -- "reserve_slot (cross-contract)" --> ER
    RR -- "transfer entry fee (cross-contract)" --> SAC

    CLIENT --> BIND
    BIND -- "JSON-RPC" --> RPC
    RPC --> ONCHAIN

    WEB --> CLIENT
    SCAN --> CLIENT
    WEB -- "sign tx" --> WK
    SCAN -- "sign tx" --> WK

    WEB -- "PII submit / QR secret / bib lookup" --> API
    SCAN -- "download roster bundle (pre-race)" --> API
    IDX -- "poll contract events" --> RPC
    IDX --> PG
    API --> PG
    WEB -- "fast directory + history queries" --> API
```

Data-flow rules:

- **Chain is authoritative** for: entry existence, ownership, lifecycle state, quota, payment, result values, timestamps. The indexer is a cache, never a source of truth; the web app can always fall back to direct RPC reads.
- **Backend is authoritative** for: participant PII (name, national ID, emergency contact), per-record salts, per-record QR secrets. None of this ever goes on-chain; the chain stores only `participant_hash`.
- **Clients never talk to contracts raw**: everything goes through `@sterun/sdk` so organisers can integrate without writing Rust (the D2 promise).

---

## 3. Smart contract design (D1 - Axel)

Both contracts are Soroban Rust (`#![no_std]`, `wasm32v1-none` target, 128KB wasm limit), scaffolded per the Stellar dev build skill (workspace via `stellar contract init`, `__constructor` for one-time init, `#[contracttype]` key enums, `#[contracterror]` typed errors, `#[contractevent]` events). OpenZeppelin crates (`stellar-tokens`, `stellar-access`, `stellar-contract-utils`, `stellar-macros`) pinned with exact `=` versions in `[workspace.dependencies]`.

References:
- Contract dev fundamentals: https://developers.stellar.org/docs/build/smart-contracts (skill: `stellar-dev.smart-contracts`)
- OZ Stellar contracts (audited modules incl. Non-Fungible Token + extensions): https://developers.stellar.org/docs/tools/openzeppelin-contracts and https://github.com/OpenZeppelin/stellar-contracts
- Tokens example contracts: https://developers.stellar.org/docs/build/smart-contracts/example-contracts/tokens
- Storage type choice: https://developers.stellar.org/docs/build/guides/storage/choosing-the-right-storage
- Storage strategies (enumeration indexes): https://developers.stellar.org/docs/build/guides/storage/storage-strategies
- Authorization framework: https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization

### 3.1 EventRegistry

Purpose: the organiser-facing registry. One instance serves all events. Stores each event, its distance categories with per-category quota and price, and who may act for the event (organiser, scanner devices).

**Storage model**

| Key (`DataKey` enum) | Storage type | Value | Why this type |
|---|---|---|---|
| `Admin` | instance | `Address` | Tiny, global, read on most calls |
| `RaceRecordAddr` | instance | `Address` | Trusted caller for `reserve_slot` |
| `EventCount` | instance | `u32` | Monotonic event id counter |
| `Event(event_id)` | persistent | `EventData { organiser, name, metadata_hash, uri, starts_at, status }` | Long-lived, must survive archival cycles |
| `Category(event_id, category_id)` | persistent | `CategoryData { code, distance_m, quota, price_usdc, entered_count }` | Long-lived; `entered_count` doubles as bib sequence |
| `CategoryCount(event_id)` | persistent | `u32` | Enumerate categories per event |
| `Scanner(event_id, addr)` | persistent | `bool` | Per-event volunteer device allowlist |

**Key functions (design-level signatures)**

```text
__constructor(admin: Address)
set_race_record(race_record: Address)                      // admin, once wiring is final
create_event(organiser: Address, name: String,
             metadata_hash: BytesN<32>, uri: String,
             starts_at: u64) -> u32                        // organiser.require_auth()
add_category(event_id: u32, code: Symbol, distance_m: u32,
             quota: u32, price_usdc: i128) -> u32          // organiser only
set_event_status(event_id: u32, status: EventStatus)       // organiser only (Draft|Open|Closed|Completed)
add_scanner(event_id: u32, scanner: Address)               // organiser only
remove_scanner(event_id: u32, scanner: Address)            // organiser only
reserve_slot(event_id: u32, category_id: u32) -> u32       // ONLY RaceRecord contract; atomic quota check,
                                                           // increments entered_count, returns bib sequence
get_event(event_id: u32) -> EventData                      // view
get_category(event_id: u32, category_id: u32) -> CategoryData
get_organiser(event_id: u32) -> Address
is_scanner(event_id: u32, addr: Address) -> bool
event_count() -> u32
```

`reserve_slot` reverts with `QuotaFull` when `entered_count == quota`, and with `EventNotOpen` unless status is `Open`. Because the check and increment happen in one contract invocation, two simultaneous entries can never both take the last slot.

**Emitted events** (`#[contractevent]`, indexed fields as topics): `EventCreated{event_id, organiser}`, `CategoryAdded{event_id, category_id, quota, price}`, `EventStatusChanged{event_id, status}`, `ScannerAdded{event_id, scanner}`, `ScannerRemoved{event_id, scanner}`, `SlotReserved{event_id, category_id, seq}`.

**Authorization model**

- Organiser rights use the standard Soroban pattern: the stored `EventData.organiser` address must `require_auth()` for every mutating call on its event. No global roles needed beyond `Admin` (deploy/wiring only).
- `reserve_slot` is gated by invoker-contract authorization: the stored `RaceRecordAddr` must authorize, which a contract does implicitly when it is the direct cross-contract caller. No EOA can mint a slot without going through `RaceRecord.enter`.
- Custom accounts (`__check_auth`, CAP account abstraction) are deliberately **not** required in v1: organisers are plain addresses. The design stays compatible with organiser multisig or policy accounts later, because `require_auth` works identically for contract accounts implementing `CustomAccountInterface`. Refs: https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization#contract-account and https://developers.stellar.org/docs/build/guides/auth/check-auth-tutorials

### 3.2 RaceRecord

Purpose: issues one non-transferable record per entry, bound to the runner's address, carrying the lifecycle and the result. Built on the OpenZeppelin Stellar **Non-Fungible Token base** (`stellar-tokens::non_fungible::Base`) plus the **Enumerable** extension (needed for `records_of(runner)` on-chain enumeration; OZ implements it with forward + reverse indexes per the storage-strategies guide).

**Why non-transferable means NO transfer function, not a blocked one**

A Soroban contract exposes exactly the functions in its `#[contractimpl]` export surface. There is no fallback dispatch, no `delegatecall`, and host-blocked reentrancy. The OZ NFT base splits *storage primitives* (`Base::mint`, `Base::owner_of`, `Base::balance`, `Base::token_uri`) from the public `NonFungibleToken` trait that would export `transfer` / `transfer_from` / `approve`. RaceRecord uses only the storage primitives and defines its own public surface, which simply does not contain any transfer or approval entry point. Ownership can therefore never change after mint: not because a guard says "revert if transfer", but because no exported code path writes to the owner mapping. A gate can be misconfigured or upgraded away; an absent function cannot be called. (Burn is also absent: a race history is append-only; see Risks for the privacy trade-off.)

**Storage model**

| Key | Storage type | Value | Notes |
|---|---|---|---|
| `Admin`, `RegistryAddr`, `UsdcAddr` | instance | `Address` | Wiring set in `__constructor` |
| OZ base: owner, balance, enumeration indexes | persistent | managed by `stellar-tokens` | Never mutated outside mint |
| `Record(token_id)` | persistent | `RecordData` (below) | The verifiable record itself |

```text
RecordData {
  event_id: u32, category_id: u32,
  bib_no: u32,                       // category seq from reserve_slot
  participant_hash: BytesN<32>,      // sha256(name || national_id || emergency_contact || salt)
  state: RecordState,                // Entered | RacepackClaimed | Finished | Dnf
  entered_at: u64, claimed_at: Option<u64>,
  finish_time_s: Option<u32>, result_at: Option<u64>
}
```

**Key functions (design-level signatures)**

```text
__constructor(admin: Address, registry: Address, usdc: Address,
              name: String, symbol: String, base_uri: String)

enter(runner: Address, event_id: u32, category_id: u32,
      participant_hash: BytesN<32>) -> u32
      // runner.require_auth(); registry.reserve_slot() cross-call;
      // usdc.transfer(runner, organiser, price) cross-call (SEP-41);
      // Base::mint(runner, token_id); store RecordData{state: Entered}

claim_racepack(token_id: u32, operator: Address)
      // operator.require_auth(); operator must be organiser or is_scanner();
      // GUARD: state == Entered, else Error::AlreadyClaimed (revert);
      // state -> RacepackClaimed, claimed_at = ledger time

record_finish(token_id: u32, finish_time_s: u32)
      // organiser only; GUARD: state == RacepackClaimed;
      // state -> Finished (terminal)

record_dnf(token_id: u32)
      // organiser only; from Entered or RacepackClaimed; terminal

extend_record_ttl(token_id: u32)                            // permissionless rent top-up
record_of(token_id: u32) -> RecordData                      // view
records_of(runner: Address) -> Vec<u32>                     // view (Enumerable)
verify(token_id: u32, participant_hash: BytesN<32>) -> bool // view: hash + owner match
owner_of(token_id) / balance(owner) / token_uri(token_id)   // OZ base views
```

The single USDC `enter` transaction is atomic: quota reservation, payment, and mint all succeed or all revert. The runner signs one auth tree that covers the nested SAC `transfer` sub-invocation (Soroban authorization framework).

**Emitted events**: `RecordEntered{runner*, event_id*, token_id, bib_no}`, `RacepackClaimed{token_id*, event_id*, operator}`, `RecordFinished{token_id*, event_id*, finish_time_s}`, `RecordDnf{token_id*, event_id*}` (`*` = topic, so the indexer and profile pages can filter by runner or event via RPC `getEvents`).

**Authorization model**: runner authorizes `enter` (and the fee transfer inside it); organiser authorizes results; organiser-allowlisted scanner addresses authorize `claim_racepack`. All via `Address::require_auth()`; no custom `__check_auth` in v1 (noted as a later path for kiosk/policy accounts).

### 3.3 Payments - USDC via the Stellar Asset Contract (SEP-41)

Entry fees are testnet USDC, a classic Stellar asset exposed to contracts through its **Stellar Asset Contract**, which implements the **SEP-41 token interface** (CAP-46-6). RaceRecord holds the SAC address and calls `transfer(runner, organiser, price)` cross-contract; runners need a USDC trustline (classic) funded from a testnet faucet/friendbot flow.

- Token interface (SEP-41): https://developers.stellar.org/docs/tokens/token-interface
- SAC overview: https://developers.stellar.org/docs/tokens/stellar-asset-contract
- Integrating SAC from contracts: https://developers.stellar.org/docs/build/guides/tokens/stellar-asset-contract
- Deploying a SAC for an asset (CLI): https://developers.stellar.org/docs/tools/cli/cookbook/deploy-stellar-asset-contract

Design choice: fees go **directly runner → organiser** in the entry transaction. No escrow contract in v1 (refund policy is an open question, Section 11). Prices are `i128` in the token's 7-decimal representation.

### 3.4 Storage TTL and state archival strategy

Soroban storage is rented: persistent entries have a TTL and get **archived** (not deleted) when it lapses; they must then be restored with `RestoreFootprintOp` before use. Race records are exactly the kind of long-lived state this threatens, so it is designed for explicitly:

1. All event/category/record entries are **persistent** (survive archival, restorable), never temporary.
2. Every mutating function extends the touched entries' TTL (threshold/extend-to pattern, e.g. extend to ~180 days when below ~120).
3. `extend_record_ttl` is public and permissionless so anyone (runner, organiser, Sterun cron) can pay rent on a record.
4. James's backend runs a **TTL keeper job**: weekly scan of tracked entries via RPC, batch `ExtendFootprintTTLOp` from the JS SDK, and a documented restore runbook if anything ever archives anyway.

Refs: https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival · https://developers.stellar.org/docs/build/guides/archival/extend-persistent-entry-js · https://developers.stellar.org/docs/build/guides/dapps/state-archival · https://developers.stellar.org/docs/build/guides/archival/test-ttl-extension

### 3.5 Testing (>80% target)

Per the stellar-dev skill testing guidance: unit tests per function with `testutils` (mock auths, ledger time control), integration tests wiring EventRegistry + RaceRecord + a test SAC token, lifecycle-guard tests (double claim reverts, finish before claim reverts, transfer absence asserted via the contract spec having no such export), quota race tests, TTL extension tests, and event-emission assertions. Coverage measured with `cargo llvm-cov`.

---

## 4. Data model

On-chain entities carry only identifiers, hashes, money, and lifecycle. Everything personally identifying lives off-chain in James's PII vault, linked by `token_id`.

```mermaid
erDiagram
    ORGANISER ||--o{ EVENT : "creates (on-chain)"
    EVENT ||--|{ CATEGORY : "has (on-chain)"
    CATEGORY ||--o{ RACE_RECORD : "fills quota (on-chain)"
    RUNNER ||--o{ RACE_RECORD : "owns, non-transferable (on-chain)"
    RACE_RECORD ||--|| PARTICIPANT_PROFILE : "participant_hash commits to (off-chain)"
    RACE_RECORD ||--|| QR_SECRET : "check-in codes (off-chain)"
    EVENT ||--o{ SCANNER_DEVICE : "allowlists (on-chain)"

    ORGANISER {
        address stellar_address "ON-CHAIN"
        string display_name "OFF-CHAIN backend"
        string contact_email "OFF-CHAIN backend"
    }
    EVENT {
        u32 event_id "ON-CHAIN key"
        address organiser "ON-CHAIN"
        string name "ON-CHAIN"
        bytes32 metadata_hash "ON-CHAIN commits to off-chain detail doc"
        string uri "ON-CHAIN pointer to metadata"
        u64 starts_at "ON-CHAIN"
        enum status "ON-CHAIN Draft-Open-Closed-Completed"
        json venue_route_waivers "OFF-CHAIN metadata doc"
    }
    CATEGORY {
        u32 category_id "ON-CHAIN key"
        symbol code "ON-CHAIN e.g. 10K"
        u32 distance_m "ON-CHAIN"
        u32 quota "ON-CHAIN"
        i128 price_usdc "ON-CHAIN 7dp"
        u32 entered_count "ON-CHAIN bib sequence"
    }
    RACE_RECORD {
        u32 token_id "ON-CHAIN key"
        address owner_runner "ON-CHAIN via OZ base"
        u32 bib_no "ON-CHAIN"
        bytes32 participant_hash "ON-CHAIN sha256 of PII plus salt"
        enum state "ON-CHAIN lifecycle"
        u64 entered_at "ON-CHAIN"
        u64 claimed_at "ON-CHAIN nullable"
        u32 finish_time_s "ON-CHAIN nullable"
    }
    RUNNER {
        address stellar_address "ON-CHAIN identity"
        string profile_handle "OFF-CHAIN optional public name"
    }
    PARTICIPANT_PROFILE {
        u32 token_id "OFF-CHAIN FK"
        string full_name "OFF-CHAIN encrypted"
        string national_id "OFF-CHAIN encrypted"
        string emergency_contact "OFF-CHAIN encrypted"
        bytes32 salt "OFF-CHAIN random 32B per record"
    }
    QR_SECRET {
        u32 token_id "OFF-CHAIN FK"
        bytes32 totp_secret "OFF-CHAIN shared runner-device and roster"
        timestamp issued_at "OFF-CHAIN"
    }
    SCANNER_DEVICE {
        address scanner_address "ON-CHAIN allowlist entry"
        string volunteer_label "OFF-CHAIN"
    }
```

`participant_hash = sha256(name || national_id || emergency_contact || salt)` is a **commitment**, not encryption: given the off-chain plaintext plus salt, anyone (insurer, medical desk, auditor) can recompute and match it against the chain; without the salt, the low-entropy national ID cannot be brute-forced out of the hash. The salt is 32 random bytes generated per record, held by the backend and shown once to the runner.

---

## 5. Record lifecycle

```mermaid
stateDiagram-v2
    [*] --> Entered : RaceRecord.enter()<br/>runner auth + quota reserve + USDC paid + mint
    Entered --> RacepackClaimed : claim_racepack()<br/>organiser or allowlisted scanner
    Entered --> DNF : record_dnf()<br/>organiser (no-show)
    RacepackClaimed --> Finished : record_finish(finish_time_s)<br/>organiser
    RacepackClaimed --> DNF : record_dnf()<br/>organiser (started, did not finish)
    Finished --> [*]
    DNF --> [*]

    note right of Entered
        GUARD - claim_racepack requires state == Entered.
        A second scan of the same record finds
        RacepackClaimed and REVERTS with AlreadyClaimed.
        The double-collection check is the contract,
        not the volunteer.
    end note

    note right of Finished
        Terminal states are immutable.
        No transfer, no burn, no re-open.
        record_finish requires RacepackClaimed -
        a runner who never collected a pack
        cannot receive a finish result.
    end note
```

| Transition | Function | Authorized by | Guard |
|---|---|---|---|
| mint → `Entered` | `enter` | runner | event `Open`, quota not full, USDC paid |
| `Entered` → `RacepackClaimed` | `claim_racepack` | organiser / scanner | `state == Entered` else revert |
| `RacepackClaimed` → `Finished` | `record_finish` | organiser | `state == RacepackClaimed` |
| `Entered`/`RacepackClaimed` → `DNF` | `record_dnf` | organiser | non-terminal state |

---

## 6. User flows

### 6a. Organiser creates an event with categories

```mermaid
sequenceDiagram
    actor O as Organiser
    participant W as Web app (organiser console)
    participant K as Wallets Kit
    participant S as @sterun/sdk
    participant R as Stellar RPC
    participant ER as EventRegistry

    O->>W: New event form (name, date, categories, quotas, prices)
    W->>W: Build metadata doc (venue, route, waiver) and hash it
    W->>S: createEvent(name, metadata_hash, uri, starts_at)
    S->>R: simulateTransaction
    S->>K: request signature
    K-->>O: wallet prompt
    O-->>K: approve
    S->>R: sendTransaction
    R->>ER: create_event (organiser.require_auth)
    ER-->>R: event_id, emits EventCreated
    loop each category
        W->>S: addCategory(event_id, code, distance, quota, price)
        S->>ER: add_category via sign and send
        ER-->>S: category_id, emits CategoryAdded
    end
    W->>S: setEventStatus(event_id, Open)
    Note over ER: Event is now live. The directory reads it from testnet, not from a database.
```

### 6b. Runner enters, pays USDC, receives bib + QR

```mermaid
sequenceDiagram
    actor RU as Runner
    participant W as Web app
    participant B as Backend (James)
    participant K as Wallets Kit
    participant S as @sterun/sdk
    participant RR as RaceRecord
    participant ER as EventRegistry
    participant U as USDC SAC

    RU->>W: Pick event + category
    RU->>W: Enter name, national ID, emergency contact
    W->>B: POST participant details (TLS, encrypted at rest)
    B->>B: Generate 32B salt, compute participant_hash, generate totp_secret
    B-->>W: participant_hash, totp_secret (delivered to runner device), salt receipt
    W->>S: enter(event_id, category_id, participant_hash)
    S->>K: sign one atomic tx (auth tree covers USDC sub-transfer)
    K-->>RU: approve entry + fee in wallet
    S->>RR: enter (runner.require_auth)
    RR->>ER: reserve_slot - quota check + bib seq (reverts if full)
    RR->>U: transfer(runner, organiser, price)
    RR->>RR: Base::mint(runner, token_id), state = Entered
    RR-->>S: token_id, emits RecordEntered
    W->>B: confirm token_id (link PII row to record)
    W-->>RU: Bib number + QR pass page (installable, works offline)
    Note over RU: totp_secret now lives on the runner's device. The QR regenerates every 30s locally.
```

### 6c. Race day: volunteer scans QR → claim_racepack (rotating code + offline fallback)

```mermaid
sequenceDiagram
    actor V as Volunteer
    participant P as Scanner PWA
    participant B as Backend (James)
    actor RU as Runner (device)
    participant S as @sterun/sdk
    participant RR as RaceRecord

    Note over P: BEFORE the venue (with connectivity)
    P->>B: Download event roster bundle
    B-->>P: token_id list + totp_secrets + bib map (scoped to event, scanner-authenticated)
    P->>S: Snapshot on-chain states for roster
    S-->>P: state per token_id (cached locally)

    Note over RU,P: AT the venue (assume zero connectivity)
    RU->>RU: Device computes code = TOTP(totp_secret, now/30s)
    RU-->>P: Shows QR {token_id, step, code} (or reads 6-digit code aloud)
    V->>P: Scan QR (or type manual code + bib number)
    P->>P: Recompute expected TOTP from roster secret, ±1 step tolerance
    alt code valid AND local state == Entered
        P-->>V: GREEN - hand over race pack
        P->>P: Mark claimed locally, queue claim_racepack tx
    else code stale or replayed screenshot
        P-->>V: RED - expired code, ask runner to show live screen
    else already claimed locally or on-chain
        P-->>V: RED - pack already collected
    end

    Note over P,RR: WHEN connectivity returns (or live if venue has signal)
    P->>S: claimRacepack(token_id) for each queued claim (scanner address signs)
    S->>RR: claim_racepack(token_id, scanner)
    alt state == Entered
        RR-->>S: ok, state -> RacepackClaimed, emits RacepackClaimed
    else state != Entered
        RR-->>S: REVERT AlreadyClaimed
        P-->>V: Flag for organiser review (two desks raced - chain picked the winner)
    end
```

### 6d. Organiser records finishes

```mermaid
sequenceDiagram
    actor O as Organiser
    participant W as Web app (organiser console)
    participant B as Backend
    participant S as @sterun/sdk
    participant RR as RaceRecord

    O->>W: Upload results CSV (bib_no, finish time) from manual timing
    W->>B: Parse + validate rows, map bib_no -> token_id
    B-->>W: Preview + anomalies (bib not claimed, duplicate bib, impossible time)
    O->>W: Approve batch
    loop batched per tx limits
        W->>S: recordFinish(token_id, finish_time_s) or recordDnf(token_id)
        S->>RR: record_finish (organiser.require_auth)
        alt state == RacepackClaimed
            RR-->>S: ok, state -> Finished, emits RecordFinished
        else
            RR-->>S: REVERT InvalidState (never claimed a pack = cannot finish)
        end
    end
    W-->>O: Publish summary + hash of the source results file in event metadata
```

### 6e. Anyone verifies a runner's history

```mermaid
sequenceDiagram
    actor A as Anyone (organiser, insurer, another race)
    participant W as Web app (public profile)
    participant S as @sterun/sdk
    participant RR as RaceRecord
    participant ER as EventRegistry

    A->>W: Open profile for runner address G...
    W->>S: recordsOf(runner)
    S->>RR: records_of + record_of per token (RPC reads, no wallet needed)
    RR-->>S: token_ids, states, times, event_ids
    S->>ER: get_event per event_id
    ER-->>S: event names, dates, organisers
    S-->>W: RaceRecord JSON (schema v1.0) per record
    W-->>A: Verified history - each row links to the testnet transaction
    opt identity check with runner consent
        A->>W: Runner supplies name + national ID + emergency contact + salt receipt
        W->>W: recompute sha256 locally, call verify(token_id, hash)
        W-->>A: hash matches on-chain commitment = record is this person
    end
```

---

## 7. Rotating QR / anti-fraud design

**Goal**: at a check-in desk with no connectivity, a volunteer must be able to tell (1) this phone belongs to the registered entry, and (2) this entry has not collected a pack yet, in under two seconds.

**Mechanism** (TOTP applied to race check-in):

1. At entry time the backend generates a per-record random secret (`totp_secret`, 32B). It is delivered once to the runner's device (stored in the QR pass PWA) and kept server-side for roster bundles. It is never on-chain.
2. The runner's device computes `code = HMAC-SHA256(totp_secret, floor(unix_time / 30))`, truncated to 6-8 digits, entirely offline. The QR payload is `{token_id, time_step, code}` plus the same code printed as digits for the manual fallback.
3. The scanner PWA pre-downloaded the event roster (token_id → secret, bib, name-fragment) while online. Verification is a local HMAC recompute with ±1 step clock tolerance. No venue connectivity needed on either side.
4. The scanner marks the record claimed locally at once, and queues the real `claim_racepack` transaction for submission when connectivity returns.

**Why a forwarded screenshot fails**: the screenshot freezes one 30-second code. By the time it is forwarded in a chat group and presented, the time step has moved and the HMAC no longer matches. An attacker would need the `totp_secret` itself, which never appears in the QR, only its per-step output does.

**Why double collection reverts on-chain**: the local roster check stops same-desk repeats instantly, but the contract is the arbiter. `claim_racepack` reads `Record(token_id).state` and reverts with `AlreadyClaimed` unless it is exactly `Entered`. Two desks scanning the same record while offline will both queue a claim; the chain accepts exactly one and the second desk gets a flagged revert to reconcile. The invariant "one pack per entry" is enforced by consensus, not by volunteer discipline.

**Layered defence summary**

| Layer | Stops | Enforced by |
|---|---|---|
| Non-transferable record | Bib resale changing who the record points to | No transfer export in RaceRecord |
| `participant_hash` | Impersonation of the registered person | sha256 commitment vs off-chain PII + salt |
| 30s TOTP QR | Forwarded screenshots, replay | HMAC on runner device + roster on scanner |
| `state == Entered` guard | Double race-pack collection | RaceRecord contract, reverts |
| Scanner allowlist | Rogue devices claiming records | EventRegistry `is_scanner` + `require_auth` |

Residual risk stated honestly: someone can still physically hand their phone plus their race pack to a friend. Sterun makes the *record* truthful (the chain still says who registered, and the organiser can spot-check identity against the hash); it does not put marshals on the course. See Section 11.

---

## 8. Tech stack

| Layer | Technology | Owner |
|---|---|---|
| Smart contracts | Rust + soroban-sdk, `wasm32v1-none`, Stellar CLI (init/build/deploy/invoke) | Axel |
| NFT base | OpenZeppelin `stellar-tokens` non_fungible Base + Enumerable, `stellar-macros` guards | Axel |
| Payments | USDC via Stellar Asset Contract, SEP-41 token interface, testnet | Axel (contract side), James (faucet/trustline helper) |
| Contract tests | soroban-sdk testutils, cargo llvm-cov (>80%) | Axel |
| SDK (D2) | TypeScript, `stellar contract bindings typescript` output + `SterunClient`, zod-validated RaceRecord JSON Schema v1.0, npm publish | James (client + schema), Axel (bindings + contract spec) |
| Backend | Node.js/TypeScript API, Postgres (PII encrypted at rest), RPC `getEvents` indexer, TTL keeper job, roster bundle service | James |
| Web app | Next.js + Tailwind, `@stellar/stellar-sdk`, Stellar Wallets Kit (Freighter, xBull, Albedo, WalletConnect, Ledger) | Ancung (flows), Nabil (design system, landing, directory UI) |
| QR pass | In-web installable pass page, local TOTP, works offline | Ancung |
| Scanner PWA | PWA (service worker, offline roster + tx queue), camera scan + manual code entry | Ancung |
| External infra | Stellar RPC (testnet), Friendbot, testnet USDC issuer | James |
| Design / brand | Landing page, design system, QR pass and scanner UX | Nabil |

Wallets Kit reference: https://developers.stellar.org/docs/tools/developer-tools/wallets#stellar-wallet-kit. Passkey smart accounts (secp256r1 since Protocol 21, `__check_auth` WebAuthn wallets) are noted as a future onboarding path for runners without extensions, but only Wallets Kit is in scope: https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets#passkeys

---

## 9. Component breakdown by owner

| # | Component | Deliverable | Owner | Depends on / hands off to |
|---|---|---|---|---|
| C1 | EventRegistry contract (storage, functions, events, tests) | D1 | Axel | → C3 bindings, → C8 indexer event shapes |
| C2 | RaceRecord contract (OZ NFT base, lifecycle, guards, tests) | D1 | Axel | C1 (`reserve_slot`), USDC SAC address ← James |
| C3 | Testnet deployment + addresses + generated TS bindings | D1/D2 | Axel | → James (SDK), → Ancung (apps) |
| C4 | `participant_hash` + TOTP code spec (hashing, salt, step, tolerance) | D1/D3 | Axel | → James (backend impl), → Ancung (pass + scanner impl) |
| C5 | `SterunClient` (createEvent, addCategory, enter, claimRacepack, recordFinish, verify, recordsOf) | D2 | James | C3 bindings; → Ancung/Nabil consume |
| C6 | RaceRecord JSON Schema v1.0 + npm packaging + SDK docs | D2 | James | reviewed by Axel |
| C7 | Backend API: PII vault, salts, QR secrets, roster bundles, results CSV mapping | D3 | James | C4 spec; → Ancung (API contract) |
| C8 | Indexer (RPC getEvents → Postgres) + TTL keeper job | D3 | James | C1/C2 event shapes from Axel |
| C9 | Event directory + public runner profile (live testnet reads) | D3 | Ancung (logic) + Nabil (UI) | C5 SDK, C7 API |
| C10 | Entry flow: category pick, PII form, Wallets Kit connect, USDC pay, bib + QR pass | D3 | Ancung | C5, C7; UX ← Nabil |
| C11 | Scanner PWA: roster sync, camera scan, TOTP verify, offline claim queue, manual fallback | D3 | Ancung | C4, C5, C7 roster format |
| C12 | Organiser console: create event, categories, scanners, results upload | D3 | Ancung | C5, C7 |
| C13 | Landing page, design system, QR pass + scanner visual design | D3 | Nabil | → Ancung |
| C14 | E2E rehearsal: scripted mock race on testnet (enter → scan → finish → verify) | all | Axel (script) + all | C1-C13 |

**Handoff contracts (freeze early, in this order):**

1. **Contract interface + event shapes** (Axel → James, Ancung): function signatures and `#[contractevent]` layouts frozen end of week 1; bindings regenerate on any change.
2. **Hash + TOTP spec** (Axel → James, Ancung): byte-exact definition of `participant_hash` and code derivation, week 1, so backend and both PWAs compute identical values.
3. **Backend API + roster bundle format** (James → Ancung): OpenAPI doc, week 2.
4. **Design system** (Nabil → Ancung): tokens + component kit, week 2.
5. **RaceRecord JSON Schema v1.0** (James ↔ Axel): the public verification format every profile page and third party consumes, week 3.

---

## 10. 30-day plan

Weeks map to deliverables: W1-W2 mostly D1, W2-W3 D2, W2-W4 D3, W4 integration + rehearsal. One section per owner as a swimlane.

```mermaid
gantt
    title Sterun 30-day build (D1 contracts, D2 SDK, D3 apps)
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d

    section Axel - contracts
    EventRegistry storage + functions        :a1, 2026-09-07, 4d
    RaceRecord on OZ NFT base + lifecycle    :a2, 2026-09-09, 5d
    Freeze interfaces + hash/TOTP spec       :milestone, a3, 2026-09-13, 0d
    USDC SAC integration + quota atomics     :a4, 2026-09-14, 3d
    Unit + integration tests to >80%         :a5, 2026-09-16, 5d
    Testnet deploy + TS bindings (D1 done)   :milestone, a6, 2026-09-21, 0d
    Rehearsal script + fixes support         :a7, 2026-09-28, 6d

    section James - backend + SDK
    USDC testnet setup, faucet, trustlines   :j1, 2026-09-07, 3d
    PII vault + salts + QR secret service    :j2, 2026-09-10, 5d
    SterunClient on bindings (D2 core)       :j3, 2026-09-21, 5d
    JSON Schema v1.0 + npm publish (D2 done) :milestone, j4, 2026-09-26, 0d
    Indexer + TTL keeper + roster bundles    :j5, 2026-09-16, 6d
    Results CSV mapping + API hardening      :j6, 2026-09-26, 5d

    section Ancung - frontend
    Wallets Kit connect + app scaffold       :f1, 2026-09-07, 4d
    Event directory + organiser console      :f2, 2026-09-11, 6d
    Entry flow + USDC pay + QR pass          :f3, 2026-09-17, 6d
    Scanner PWA roster + scan + offline queue :f4, 2026-09-23, 6d
    Public runner profile + verify           :f5, 2026-09-29, 4d

    section Nabil - design + landing
    Design system + brand tokens             :n1, 2026-09-07, 5d
    Landing page + event directory UI        :n2, 2026-09-12, 6d
    QR pass + scanner UX design              :n3, 2026-09-18, 5d
    Profile UI + polish pass on all flows    :n4, 2026-09-23, 8d

    section Team
    Interface freeze checkpoint              :milestone, t1, 2026-09-13, 0d
    Full E2E mock race on testnet            :t2, 2026-10-01, 3d
    D3 demo + Instawards report              :milestone, t3, 2026-10-04, 0d
```

---

## 11. Risks and open questions

1. **TTL / state archival of long-lived records.** A runner's history must outlive the event by years, but persistent entries archive when rent lapses. Mitigated by design (Section 3.4: extend-on-write, permissionless `extend_record_ttl`, keeper job, restore runbook), but the economics of who pays rent long-term (runner? organiser? protocol fee?) is unresolved.
2. **National ID hashing and privacy.** The hash is a commitment; safety depends entirely on the salt staying secret and random, because national IDs are low entropy. Backend compromise leaks PII (it is a normal Web2 database with normal Web2 obligations). Also unresolved: right-to-erasure vs an immutable on-chain hash (the hash alone identifies nobody, but the legal reading in our jurisdiction needs checking before mainnet).
3. **Backend holds QR secrets.** Check-in integrity partially trusts James's roster service: a leaked roster lets an attacker mint valid codes. Damage is capped by the on-chain guard (still only one pack per record, and only via allowlisted scanner addresses). A future version can replace shared secrets with wallet-signature-derived codes at the cost of check-in UX.
4. **Results are only as honest as the organiser.** No timing hardware in this phase; `record_finish` values come from manual timing uploads. The chain makes results tamper-evident after publication, not correct at the source. Mitigation: anomaly checks on upload and publishing the source-file hash. Timing-mat integration is explicitly out of scope.
5. **Fiat on-ramp out of scope.** Entry is testnet USDC only. Real events need SEP-24 anchor deposits or organiser-side fiat collection with on-chain issuance; deferred, and it changes the payment flow shape (someone else pays for the runner).
6. **Refunds and cancellations undefined.** Fees flow directly runner → organiser with no escrow, so a cancelled race depends on the organiser refunding off-protocol. An escrow variant of `enter` is a known v2 design.
7. **Wallet UX for non-crypto runners.** Requiring Freighter and a USDC trustline will lose casual runners. Passkey smart accounts (secp256r1 + `__check_auth`) are the documented path, deliberately out of scope now; Wallets Kit only.
8. **Offline claim queue conflicts.** Two offline desks can both approve the same runner; the chain resolves it later, meaning one pack may already be physically handed over before the revert is seen. Procedure mitigation: split roster ranges per desk; the flagged-revert list goes to the organiser same-day.
9. **Physical impersonation remains possible.** A runner can hand phone + pack to a friend. Sterun guarantees record integrity and gives organisers a hash to verify identity against; it cannot enforce who is physically running. State this honestly in organiser materials.
10. **RPC event retention.** Testnet RPC keeps a limited `getEvents` window, so the indexer (not RPC) is the long-horizon query layer; if the indexer is ever rebuilt, it must replay from history or contract state, which the design allows since state, not events, is authoritative.
11. **Clock skew at check-in.** TOTP tolerates ±1 step (90s window). A device with a badly wrong clock fails valid scans; the manual-code fallback plus a scanner-side "clock sanity" banner covers it.
12. **Contract upgradeability.** v1 deploys non-upgradeable for record immutability. If a bug forces redeploy on testnet, records migrate via a scripted re-issue. Whether mainnet v2 uses OZ `Upgradeable` (with what governance) is open.

---

*Grounded in: OpenZeppelin Stellar contracts (non-fungible base + extensions), SEP-41 / Stellar Asset Contract for USDC, Soroban storage + state archival, the Soroban authorization framework, Stellar Wallets Kit, and the stellar-dev smart-contracts build skill. Canonical URLs inline in Sections 3 and 8.*
