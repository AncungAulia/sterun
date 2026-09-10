# `be/` — Node/TS backend (CLAUDE.md)

API + Stellar helpers + **PII vault** + **indexer** + **TTL keeper** + **results review** + **event
metadata files**. Owner: **James**. Components **C7** (PII vault + API, STE-11; results CSV +
hardening, STE-20) and **C8** (indexer, TTL keeper, roster bundle, STE-16).

Three processes, one package. Which one runs is decided by the command you type, not by a flag:

| Process | Command | Its job |
| --- | --- | --- |
| API | `pnpm dev` | serves the vault, directory/history, roster bundle, results review |
| Poller | `pnpm indexer follow` | `getEvents` → Postgres |
| Keeper | `pnpm keeper run` | pays record rent so entries are not archived (a weekly cron) |

The API **serves** the index; it does not fill it. If `/events` is empty, the poller is what is not
running. Full operational detail (rebuild, restore runbook, roster format):
[`OPERATIONS.md`](OPERATIONS.md).

## Stack (already chosen; do not reopen without a reason)

| Part | Choice | Why |
| --- | --- | --- |
| Runtime | Node ≥ 22 (we use 24), ESM (`"type": "module"`) | Next.js and the bindings are ESM too |
| Framework | **Fastify 5** | light, TS-first, schema validation built in |
| Stellar | `@stellar/stellar-sdk` ^17 | latest major; `be/` talks straight to protocol 26 testnet |
| Database | **Postgres 17** + `pg`, no ORM | what this service does to the database is a handful of hand-written statements; an ORM adds a mapping layer and surprising SQL for nothing |
| Migrations | a ~60-line script in `src/db/migrate.ts` | ordered by filename, applied once, inside a transaction, sha256 recorded; a framework adds a DSL and failure modes for features we do not use |
| Tests | **Vitest** | fast, native ESM, Fastify `inject()` without opening a socket |
| Lint | ESLint 10 flat config + typescript-eslint | |
| Build | `tsc` to `dist/`, `tsx` for dev and the CLIs | |

`tsconfig.json` is deliberately strict: `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `verbatimModuleSyntax`. `pnpm typecheck` checks **src + test** (two
tsconfigs) — Vitest only transpiles tests, it does not typecheck them.

```bash
docker compose up -d postgres   # from the root — Postgres on :55432
cp be/.env.example be/.env      # fill in DATABASE_URL + PII_KEYS
pnpm --filter be dev            # or `pnpm dev` from the root
pnpm --filter be test           # database tests skip when DATABASE_URL is empty
pnpm --filter be lint
pnpm --filter be typecheck
pnpm faucet --new               # from the root
pnpm indexer follow             # the poller (STE-16); also `poll`, `rebuild`, `doctor`, `status`
pnpm keeper scan                # TTL keeper dry run; also `run`, `report`, `restore`
```

Tests that need a database **skip** locally when `DATABASE_URL` is empty (and say how to fix it),
but **fail hard** when `CI` is set. A suite that quietly skips its most important tests is worse
than no suite.

## The non-negotiable rules

**1. Stellar addresses are NEVER hardcoded.** All of them are read from
[`docs/deployments.md`](../docs/deployments.md) through `src/deployments.ts`, overridable by
environment variable. There is no third fallback: an unreadable document plus an empty environment
kills the process at startup rather than running while pointed at the wrong contract. The parser
also checks that document for consistency — the SAC address appears in three tables and all three
must agree.

**2. PII never touches the chain.** On-chain there is only `participant_hash`. Names, national ID
numbers and emergency contacts are encrypted at rest, off-chain, never in a `uri`, never in an
event. Anything that can identify a person and reaches a chain **cannot be removed**.

> The only derivative of a name that leaves the vault is **`name_fragment`** in the roster bundle
> (STE-16): the full given name plus initials for the rest, computed once at submit time and stored
> in that form, encrypted with the same per-row AAD. It is not an obscured name — the information is
> genuinely no longer there. Its reasoning, its limits and who may download it:
> [`OPERATIONS.md`](OPERATIONS.md), the roster bundle section.

**3. Money never travels through a float.** sUSD is `i128` stroops, 7 decimals. A float round trip
of 0.1 sUSD is off by one stroop, and one stroop off in an entry fee means `enter` fails with no
explanation. Use `BigInt`; `parseFloat` is blocked by eslint in this package.

**4. Secrets live only in `be/.env`.** `SUSD_DISTRIBUTOR_SECRET` can move the entire test supply;
`PII_KEYS` opens all of the PII. `.env` is gitignored and `.env.example` is what gets committed.
Never put an `S...` key or a PII key in another file, in a ticket, in chat, or in a log.

> **`maxLength` in a response schema is DOCUMENTATION, not enforcement.** Tested rather than
> assumed: `fast-json-stringify` ignores it during serialisation and emits the string it is given.
> What *is* enforced is the **property list** — a field the schema does not name genuinely cannot get
> through. Length has to be bounded on the value, before it reaches the response object (`bounded()`
> in `routes/roster.ts`). An older comment there claimed the opposite; a security control that is
> believed and absent is worse than one known to be missing, because nobody goes looking for the
> real one.

**5. No response may be able to carry PII.** Every response has an explicit JSON schema with
`additionalProperties: false`. Fastify serialises **only** the properties the schema names, so a
field the schema does not mention **cannot** reach a client even when it is present on the object.
This is a security control rather than documentation — and a test reads the schemas to prove that
not one of them can express `name`/`national_id`/`emergency_contact`.

`test/response-schemas.test.ts` runs that across the **whole** API at once, so a new router is
covered without adding a test. One consequence looks odd until you know why: the on-chain event name
is sent as **`event_name`**, not `name`. A rule with no exceptions can be checked; a rule with a list
of "this `name` is allowed" exceptions stops catching anything.

**5b. Values that do not fit in a JSON number are sent as strings.** `starts_at`, `entered_at`,
`price_stroops` and friends are u64/i128. A test reads the schemas and rejects `type: "integer"` for
those fields.

**6. `removeAdditional` is off.** Fastify's default silently **drops** a field the schema does not
know. For an API other people write clients against, that turns a typo'd field name into a
successful request that quietly discarded something the caller believed they sent. Now
`additionalProperties: false` means **400**.

## Contract error codes: pick the map from the band

`enter` cross-calls both EventRegistry **and** the SAC, and their reverts propagate as-is. An
`ScError` is only a `u32` with no contract identity, so the number decides:

| Band | The correct error map |
| --- | --- |
| `1..=99` | `Errors` from the `event-registry` package |
| `100..=199` | `Errors` from the `race-record` package |
| `200..=214` | `NonFungibleTokenError` from the `race-record` package |

`Error(Contract, #4)` out of `enter` is **not** a RaceRecord error — it is EventRegistry's
`EventNotOpen`.

## Calling the contracts

There are **two** paths, and which one applies is not a matter of taste:

| Path | Used by | Why |
| --- | --- | --- |
| `@stellar/stellar-sdk` ^17 directly (`src/chain/`) | faucet (STE-6), indexer + keeper (STE-16) | one SDK version inside a long-running process, and no extra build step in TS CI |
| the bindings in `sc/bindings/` | `SterunClient` (STE-15) | no retyping contract signatures for D2/D3 consumers |

Why the indexer does **not** use the bindings, written down so it is not re-argued: the bindings pin
`@stellar/stellar-sdk ^14.6.1` (two RPC clients in one process), their `dist/` is not committed so
they need `npm install && npm run build` in two more packages — a step `typescript.yml` does not have
and does not deserve just so the indexer can read a struct — and what the indexer needs is only the
**shape** of four return values, which `src/chain/decode.ts` checks more strictly than a generated
parser would.

Details plus the first three traps: [`sc/bindings/README.md`](../sc/bindings/README.md).

> **A seam worth remembering:** the bindings use `@stellar/stellar-sdk ^14.6.1` (generator output,
> never hand-edited) and `be/` uses ^17. That is safe because what crosses the boundary is an **XDR
> string**, not an SDK object — `signAndSend({ signTransaction })` takes a callback returning signed
> XDR. Never pass a `Transaction` or `Account` object across it.

## Why the faucet exists

sUSD is a **classic** asset: an account cannot hold it without a **trustline**. `RaceRecord.enter`
pays through the SAC's `transfer`, so a runner with no trustline fails there — and because `enter` is
atomic, the whole entry rolls back (no quota consumed, no mint). Technically correct, and a terrible
first experience. `pnpm faucet` removes it.

The resulting balance is read back through the **SAC**, not through Horizon. That is the only reading
that proves anything: `enter` calls `balance` on the SAC, so that is the number deciding whether a
runner can pay.

> Protocol 26 adds a `trust` function to the SAC that would let a contract open its own trustline.
> Using it means changing RaceRecord, whose interface is **frozen** — that is a spec-change PR
> (`docs/specs/CLAUDE.md`), not a backend decision. Recorded as a v2 simplification.

## The PII vault (STE-11)

The product rule: **PII goes in and never comes out.** No method on `Vault` returns a name, a
national ID or a contact — not because nobody got round to it, but because no part of the Sterun
design needs to read them. What downstream actually needs is the hash (on-chain), the `totp_secret`
(roster bundle, STE-16), and the link between a vault row and a `token_id`.

`decryptForAudit` is the single exception, and is deliberately named to be uncomfortable. It exists
so that "we encrypt it" is a testable claim, and so a legitimate data-access request has a defined
path. **It is wired to no route.**

Encryption: application-level AES-256-GCM, numbered keys (`PII_KEYS`), and an AAD of
`"<column>:<row uuid>"` binding each ciphertext to its own row — without it, anyone who can write to
the database could move person A's encrypted name onto person B's row and decryption would still
succeed.

**Key custody, the rotation procedure, and what a database leak would mean:
[`OPERATIONS.md`](OPERATIONS.md).** Read it before running this anywhere but your own laptop.

Auth is a Stellar wallet signature (challenge → sign → spend). Nonces are single-use, expire after
two minutes, and are bound to one address.

**Two signature encodings are accepted, and that is not leniency.** A script holding a keypair signs
the nonce bytes directly; a browser cannot, because the key lives in the wallet and wallets sign
through **SEP-53** — what gets signed is the sha256 of the message under the fixed
`Stellar Signed Message:` prefix, not the message. That indirection is the point of the standard: it
guarantees that what a user approves in a popup can never also be a valid transaction. So a dapp
cannot opt out of it, and accepting only the raw form would mean **no browser could ever
authenticate** — which is most of this product. `ChallengeStore.verify` tries `verify` and then
`verifyMessage`. Nothing weakens: the bytes still have to be this nonce, signed by this address's
key, and the nonce is already spent before the check.

**The nonce store can be either** (STE-31): `MemoryNonces` for one process, `PostgresNonces` for
more. The entry point picks based on whether a pool exists. Single-use across instances is held by
`DELETE … RETURNING` — one atomic statement; read-then-delete leaves a window, and behind a load
balancer those two statements are on different machines.

> A trap every client meets: `Keypair.sign()` returns a `Uint8Array`, and
> `Uint8Array.toString("base64")` **ignores its argument** — you get `"12,34,56,…"`. Wrap it:
> `Buffer.from(kp.sign(msg)).toString("base64")`. The server answers that with
> `malformed-signature`, which names the fix, rather than `bad-signature`, which would send people
> to suspect their key.

## Indexer, TTL keeper, roster (STE-16, C8)

One rule governs all of it: **the chain is the source of truth, this is a cache.** Nothing in
Postgres is the only copy of anything, and that is what makes `pnpm indexer rebuild` possible —
truncate every materialised table, walk contract **state** again, and the index is whole. That path
exists because testnet RPC only retains a limited `getEvents` window; a design that needed event
replay would be one bad week away from an index that could not be repaired.

Five things that confuse people when they are not spelled out:

1. **The `source` column on each row is not decoration.** `'event'` means the poller watched it
   happen (there is a ledger and a tx hash). `'state'` means a rebuild read it from storage: equally
   true, with no provenance.
2. **An event is never trusted on its own.** `EventCreated` does not carry the name, `CategoryAdded`
   does not carry the distance, `RecordEntered` does not carry the category. What is missing is read
   back from the contract, and what the event *does* carry is **cross-checked** against that reading.
   A mismatch is a `throw`, not a choice between the two.
3. **Filter by contract id, not by topic name** (`INTERFACE.md` §2.3). `getEvents` is a public feed;
   anyone can deploy a contract that emits a `record_entered` topic.
4. **The scanner list is the only table that CANNOT be rebuilt from state.** EventRegistry offers
   only `is_scanner(event_id, address)` — ask about one address, get yes or no. There is no function
   that enumerates. That is why `/events/:eventId/scanners` reads the index rather than the chain,
   and it is why `rebuild` must not simply drop `event_scanners`: candidates are gathered from the
   table **and** from replaying `scanner_added`/`scanner_removed` out of `chain_events` (that raw log
   is deliberately preserved through a rebuild), then every address is re-checked against the chain
   with `is_scanner` before being written back. What still **cannot** be recovered: a scanner added
   before this index ever polled — no row, no logged event, and the chain cannot be asked "who are
   they". The result is an under-report, which is the safe direction, but it is still an
   under-report. A test locks that boundary so the recovery is not read as total.
5. **The keeper extends ledger keys rather than calling `extend_record_ttl`.** That contract function
   does not touch OpenZeppelin's `Owner` entry, and a record whose `Owner` entry is archived still
   breaks `verify` and `records_of`. The keys come from a simulated footprint, not from being
   assembled by hand.

The TTL threshold **must match** `BUMP_THRESHOLD` in `sc/contracts/race_record/src/lib.rs` (120
days). But the extension target is **one ledger below** `BUMP_TO` (3,110,399, not 3,110,400):
`ExtendFootprintTTLOp` rejects the boundary value as malformed, while the `extend_ttl` host function
the contract uses clamps to it instead. That one-ledger difference is deliberate and has its own
comment in `src/keeper/ttl.ts` — do not "fix" it into agreement.

## `be/.env` is genuinely read now

`src/env.ts` loads `be/.env` at every entry point (the API and both CLIs). Before that nothing read
it at all, even though the documentation had said `cp .env.example .env` since STE-6 — the secret sat
in the file while the process ran without it, which looks exactly like a wrong key.

Two rules: **real environment variables always win** (CI and systemd decide, not a stale `.env` on
the same laptop — the opposite of `process.loadEnvFile()`), and **a missing file is not an error** (a
fresh clone must still start). It is not called from `config.ts`: that module stays pure so tests
inject an environment rather than inheriting the developer's `.env`.

## Tests

783 tests (`pnpm --filter be test`; some need Postgres), and most of them are negative cases —
that is where the damage lives.

No test makes a network call: `/health` deliberately does not touch Horizon (a health check that
calls someone else's service reports their outage as ours), and the live behaviour of the faucet,
indexer and keeper is proven by hand and written into `docs/deployments.md`.

Only the **network** is faked, never our own code: `test/helpers/fake-chain.ts` implements
`ContractCaller` and answers with real `xdr.ScVal` values in the shape `INTERFACE.md` froze, so the
decoder, reader, indexer and keeper all run unmodified on top of it.

Every test file gets **its own Postgres schema** (`freshDatabase()`). Vitest runs files in parallel
and these tests truncate tables; sharing `public` produces a suite that fails one run in five, and a
suite like that stops being read.

Every future ticket: **e2e + edge + positive + negative**, the same as on the contract side.

## Race pack choices (STE-17): the `add_ons` column

Migration **005**. The only per-runner column in `participants` that is **not encrypted**, and that
is deliberate:

- **It is not PII.** "Event jersey: L" identifies nobody. A dump of this column is a list of shirt
  sizes next to bib numbers.
- **The organiser HAS to read it.** The point of collecting a size is ordering the shirts. The vault
  is built the other way round on purpose (no route returns a name, and `decryptForAudit` is named to
  be uncomfortable), so putting a size in there would mean choosing between a new decrypt path out of
  the vault and an organiser who cannot count their own order. Both are worse than a plain column
  holding a non-secret.

The shape is an **array of pairs**, not an object:

```json
[{ "item": "Event jersey", "choice": "L" }]
```

Not a preference: every response schema in this service is closed (`additionalProperties: false`) and
a test fails if one is not. A map cannot be closed; an array of two-field objects can — and the same
shape in the column and on the wire means there is no translation to get wrong.

Item names refer to `add_ons` in the **event document** (`docs/WEB_APP_IA.md` §6), which is hashed
and frozen at `create_event`, so a name in it cannot change under a row that refers to it. That is
the property an id would normally buy, without inventing an id.

It is not validated against that document: the file lives off-chain at a URL this service does not
have, and fetching it on every submit just to match a string would add a network dependency to the
write path in exchange for a check the console already performs with the same data in front of it.
What bounds it instead: at most 20 items, 128 characters each.

It comes back out in the **roster bundle** (`GET /events/:eventId/roster`), because that is the one
place an authorised caller gets a whole event's entries in a single request, and both readers need
it: the organiser counts sizes, and a volunteer at the race pack desk needs to know which shirt goes
in the bag.

**What v1 cannot do: per-size stock.** Contract quota is counted per category and knows nothing
about M or L, so "M is sold out" cannot be enforced. The way an organiser sells that is separate
categories (`10K` vs `10K_JERSEY`), and the jersey category's quota is the number of shirts ordered.

## The v2 contracts (STE-35): migrated

`be/` and `fe/` both point at the v2 pair as of 2026-09-09.

Before the switch, the `Cancelled` status was accepted at **three** layers, each of which fails
differently:

| Layer | If it is missed |
| --- | --- |
| `EVENT_STATUSES` in `src/chain/decode.ts` | the decoder throws and the poller stops |
| the JSON schemas in `src/routes/directory.ts` | the field silently disappears from responses |
| **the `events_status_check` CHECK constraint** (migration 006) | Postgres rejects the INSERT |

The third is the one `INTERFACE.md` §8's checklist does **not** mention, and the only one a database
enforces. v1 cannot emit `Cancelled`, so widening the constraint changed nothing that could happen
that day — it only removed a way for the switch to fail.

The addresses moved through `docs/deployments.md` rather than an environment variable: the
unqualified row name now means v2, the old pair is labelled `v1`, and a test fails if the parser
resolves the v1 pair.

The production index and vault were **truncated** during the move, because nothing in the schema
distinguishes one contract from another: `events.event_id` and `records.token_id` are bare primary
keys, and v2 numbers events from zero again — so v2 event 0 would **overwrite** v1 event 0. The
dangerous part is not the index (that can be rebuilt) but `participants`, which links real identity
documents to those same `token_id`s; the roster maps `token_id` to `totp_secret`, so a scanner would
validate the wrong person. Procedure, ordering and rollback: [`OPERATIONS.md`](OPERATIONS.md),
"Moving to the v2 contracts".

## Results CSV (STE-20, C7)

`POST /events/:eventId/results/preview` — the organiser uploads a CSV and gets a preview with
per-row anomalies. This service **signs nothing**: the account allowed to publish results is the
organiser's, and that key must stay on the organiser's device rather than becoming a key this server
holds.

Why the review step exists at all: `record_finish` moves a record to `Finished`, which is
**terminal**. A wrong time that has been published cannot be corrected by anyone.

**Bib numbers are NOT unique within an event.** `reserve_slot` returns the **category's**
`entered_count`, so a 5K and a 10K in the same event both start at bib 0. A CSV of `(bib_no,
finish_time)` — exactly the shape the ticket described — is therefore ambiguous the moment an event
has two categories. Hence the optional `category_id` column: a bare bib is resolved only when
**exactly one** category claims it, and the rest become `ambiguous_bib` anomalies. Guessing here
means publishing another runner's time onto someone's record, permanently.

Seven anomalies, and their `severity` matters more than their count:

| severity | meaning |
| --- | --- |
| `reverts` | the chain rejects that row; the cost is one failed transaction (`unknown_bib`, `not_claimed`, `already_final`) |
| `wrong` | the chain **accepts it** and the result is a lie forever (`ambiguous_bib`, `impossible_time`, `duplicate_bib`, `malformed_row`) |

The parser is lenient about **shape** and strict about **meaning**: `52:41`, `1:02:41`, `3161` and
`3161.4` are all accepted, as are headers like `Bib No`/`chip_time` and `;` as a delimiter. Reading
`52:41` as 5241 seconds is a result 35 minutes wrong that cannot be withdrawn. Fractional seconds are
**truncated**, not rounded — rounding invents a time that was never recorded.

`source_sha256` in the response is the hash of **exactly** the bytes uploaded, computed before any
parsing. That is what gets recorded in the event metadata so published results stay tamper-evident
(SYSTEM_DESIGN §11, risk 4).

```bash
pnpm --filter be e2e:results   # needs DATABASE_URL + PII_KEYS + STERUN_ADMIN_SECRET
```

`STERUN_ADMIN_SECRET` since STE-36: both e2e scripts (`e2e:results`, `e2e:addons`) create a
throwaway organiser, and `create_event` is now gated by the admin's organiser allowlist. So the
scripts call `addOrganiser` with the admin key first. Without the secret they fail hard at that step
rather than somewhere in the middle of the flow.

## Event metadata files (for STE-17)

`POST /events/files` → `{ url, sha256, size, content_type, created }`, and `GET /files/:sha256`
serves it back. Asked for by Ancung for the organiser console: before this, organisers were told to
host the poster themselves and paste a URL, the single most annoying step in the wizard.

**This touches no frozen spec.** `create_event` already takes `metadata_hash: BytesN<32>` and
`uri: String` (`INTERFACE.md` §1.1), so the on-chain half existed; what was missing was somewhere to
put the bytes.

**Content-addressed, and that is the whole design.** The storage key **is** the sha256 of the bytes —
not a random id with a hash recorded beside it, but one number doing both jobs. What follows:

- A URL cannot come to hold different content. Different bytes mean a different URL, so the on-chain
  `metadata_hash` and the file served can never disagree.
- Upload is **idempotent**. The same file twice is one file, the same URL, and `created: false`.
- There is no overwrite path, so no way for one organiser to replace another's poster.
- `Cache-Control: immutable` becomes a statement of fact rather than a hope.

This is the property Ancung liked about IPFS ("the CID is itself the hash of the content") without a
pinning service and without a gateway that can be down.

**The type is decided by the BYTES, not by the `Content-Type` header.** The header is the uploader's
claim; checking an allow-list against it is theatre. `src/files/content-type.ts` sniffs the
signature.

Accepted: `application/json`, `application/pdf`, and five raster image types
(PNG/JPEG/GIF/WebP/AVIF).

**PDF is accepted for the liability waiver**, and for the same reason the feature exists: a waiver's
legal value rests on being able to show what people agreed to at the time. Content addressing gives
exactly that — the URL is the sha256 of the contents, so the document cannot be edited after people
have entered. An organiser pasting a link to their own Drive can swap it afterwards, and nobody can
prove it changed.

PDF **can** carry JavaScript, and that is a real difference from an image. It is accepted anyway on a
judgement worth writing down rather than assuming: responses already send `default-src 'none';
sandbox` and `nosniff`, which put the document in an opaque origin with no network of its own, and
modern browser PDF viewers are themselves sandboxed processes. `Content-Disposition` is deliberately
**`inline`**, not `attachment`: this is a document somebody is being asked to agree to, and forcing a
download first is hostile — the sandbox CSP is what makes `inline` defensible.

**Deliberately NOT done: scanning the bytes for `/JS` or `/JavaScript`.** PDF object streams are
compressible, so a string scan both misses obfuscated cases and fires on legitimate content. A check
that can be walked past is worse than no check, because it gets believed. The serving headers depend
on detecting nothing.

PDFs are also checked at **header AND trailer** (`%PDF-1.x`/`2.x` at the start, `%%EOF` within the
last 1024 bytes), not just magic bytes. Same reasoning as parsing the JSON: a truncated upload must
be caught now, not on race day when the waiver will not open.

> **SVG is not on the allow-list and must not be added.** SVG is an XML document that can carry
> `<script>`. Served from `api-sterun.jameshub.fun` — the same origin as the PII vault — that is
> stored XSS from a file any keypair holder can upload. The difference from PDF: SVG is script in the
> page's own origin, not a document rendered by a separate viewer. If vector posters are ever needed,
> the answer is rasterising on upload or a separate origin, not another branch here.

> **The content types Fastify parses are DERIVED from the allow-list**, not written out again.
> Fastify refuses a content type it has no parser for with its own 415 **before** the handler runs,
> so a type added to the allow-list and forgotten in the parser list fails with an error that
> mentions neither sniffing nor a fix. That happened once, when PDF was added. A test proves the
> derivation still holds.

**A SIGNED waiver does not belong at this endpoint.** `/files/:sha256` is public and unauthenticated
by design, because its URLs go on-chain. A signed document contains a name and a signature — that is
PII, and it belongs in the vault. It probably does not need storing at all: the runner already signs
the `enter` transaction with their wallet, so "this person agreed to exactly this document" is
provable from the chain once the waiver is covered by `metadata_hash`. Whether that satisfies
Indonesian law on electronic signatures is a legal question rather than a technical one, and it is
unanswered.

The second layer when serving: `Content-Security-Policy: default-src 'none'; sandbox`, `nosniff`, the
content type sent is the sniffed one, and `Content-Disposition` names the file by its hash — nothing
the uploader chose is echoed into a header.

**Who may upload: anyone with a valid wallet signature, deliberately.** The brief proposed
restricting it to addresses that had already created an event. That would lock out exactly the
first-time organiser the feature exists for, because the URL is needed **before** `create_event` is
called. What bounds abuse instead: 5 MB per file, a 12/minute rate limit, the sniffed allow-list, and
a **hard ceiling on the whole store** (`STERUN_FILES_MAX_BYTES`, 512 MiB by default) that answers
**507**. Stellar keypairs are free to generate, so per-address rules bound nothing; the ceiling does.

**`STERUN_PUBLIC_BASE_URL` must be set on any public box.** When it is empty the origin comes from
the `Host` header — which is attacker-controlled — and the URL this endpoint returns is one an
organiser commits **permanently** on-chain.

### Where the bytes live: R2, with disk as the fallback

`FileStore` has two implementations, and configuration decides which one runs — not a flag:

| Condition | Store | Used in |
| --- | --- | --- |
| all four `STERUN_R2_*` present | `R2FileStore` | production |
| all four empty | `LocalFileStore` (disk) | `pnpm dev`, tests |

**All four or none.** Three of four starts a process that runs normally, serves every other
endpoint, and then fails its first upload with a **403** from R2 — which looks exactly like a wrong
secret and sends whoever is debugging it to regenerate credentials that were fine. `loadR2Config`
refuses that at startup.

**What does NOT change: the public URL.** Files are still served by this API at `/files/:sha256`,
not from a public bucket or an R2 custom domain. This is the most consequential decision in the
feature:

- **The URL is committed on-chain, permanently.** `create_event` stores `uri` in contract storage. A
  URL pointing at a storage provider is a bet that we never change provider; a URL on our own domain
  survives the next migration, and there will be one.
- **The security headers are ours to set.** These bytes are uploaded by anyone holding a keypair and
  served from the origin that also serves the PII vault. The `sandbox` CSP, the sniffed type and the
  hash-derived filename all live in `routes/files.ts`. A bucket serving bytes directly answers with
  whatever it was configured to say, somewhere `git log` cannot explain.
- Cloudflare already caches the read path, so the API is not in the hot path for repeat reads.

So R2 replaces **where bytes live**, not **who serves them**.

**SigV4 is hand-written** (`src/files/sigv4.ts`) rather than pulled in with `@aws-sdk/client-s3`. The
reasoning matches the ~60-line migrator: this package has **six** runtime dependencies on purpose,
and that SDK brings dozens of transitive packages plus its own middleware stack to perform four
operations against one bucket. The risk is low because the failure mode is loud and immediate: a
signature off by one byte is `403 SignatureDoesNotMatch` on the first request, never a quiet
weakening. It is proven three ways, deliberately: an **independent second implementation** in the
test file (the same technique as `docs/specs/verify.sh`, where two reference implementations must
agree), structural rules, and R2 itself accepting the signature (recorded in `docs/deployments.md`;
it cannot run in CI).

One detail worth enjoying: SigV4 needs the sha256 of the body, and content addressing has already
computed exactly that number to use as the key. One hash, two uses.

**Transient R2 failures are retried, and that is not decoration.** A real upload once got a 500
because R2 answered `InternalError` with the body *"We encountered an internal error. Please try
again."* — an explicit instruction this code was ignoring, so a blip on Cloudflare's side became a
failed upload for an organiser. Now: three attempts, exponential backoff with jitter, honouring
`Retry-After`, and **only for 5xx and 429**. A 403 (wrong credentials) and a 404 (no such object) are
not retried — neither improves with time.

Retrying is safe here in a way it is not in most places, and not by luck: **every operation this
store performs is idempotent by construction.** A PUT writes bytes at the address of those same
bytes, so a duplicate write is the same write; GET, HEAD and LIST change nothing. There is no
operation whose repetition could double anything.

The request is **re-signed on each attempt** rather than reusing headers: the signature covers
`x-amz-date`, so a retry crossing into the next clock-skew window would fail authentication for a
reason unrelated to why it was retried.

When the retries are exhausted the route answers **503 + `Retry-After`** rather than 500 — "upstream
is unwell, try again" is the honest answer and it decides what the person on the other end does
next, and it is safe to advertise precisely because uploads are idempotent.

**The stored content type is re-checked on read** rather than trusted because we wrote it. The token
that reaches the bucket can write any object with any content type, and that bucket is not this
code's alone. One cheap comparison keeps a stray `text/html` object from being handed to a browser
from our own origin.

**The `sterun-files` volume is not a cache** (and is now only used when R2 is unconfigured). A lost
file is a permanently broken event, because its hash is on the ledger pointing at a 404. The
Dockerfile creates `/app/data/files` owned by uid 1000 first: an empty named volume inherits that
directory's ownership from the image, and when the path is absent from the image Docker creates one
owned by root, so the first upload fails `EACCES`. Same shape as the cloudflared permission bug in
STE-31, and it only appears on a real deployment.

**Not there yet: an orphan-file sweeper.** A file never referenced by any event's `uri` stays
stored. What bounds growth is the store ceiling, not deletion. A candidate for the next keeper
command: the index already holds each event's `uri`, so the difference can be computed without a new
table.

## Hardening (STE-20)

**One error shape for the whole API**, from a single root handler in `src/http/errors.ts`:

```json
{ "error": "<stable kebab code>", "message": "<a sentence>", "details": [...] }
```

`error` belongs to machines and never changes for the same condition; `message` belongs to humans and
may be rewritten. Per-router handlers have been **removed** — there used to be three shapes in
circulation, one of them Fastify's default `{"error": "Bad Request"}`, whose content is an HTTP
reason phrase, so a client branching on it was branching on a string that changes with the status
code.

Error codes are now **kebab-case everywhere**. `AuthError` already was (`unknown-nonce`) while the
routers were snake (`not_found`) — clients had to know two conventions.

**A 500 leaks nothing.** Exception text carries file paths, fragments of SQL and sometimes the value
that caused the failure — in a service holding identity documents, that is exactly what must not
reach a response body. The body is a fixed sentence plus `x-request-id` to quote; the real error goes
to the log.

**Rate limits** are per-endpoint, by cost: 240/minute globally, 30 for `/auth/challenge`, 10 for the
results upload, 12 for the metadata file upload. The key is the first `x-forwarded-for` hop — behind
a reverse proxy (STE-31) every request arrives from one socket, and without that one noisy client
would lock out a whole event. **Disabled when `NODE_ENV=test`**, so the suite does not fail on its
241st request for a reason unrelated to the assertion.

**Logs redact** `x-sterun-signature` and `x-sterun-nonce`, and drop the query string (which can carry
an address).

**OpenAPI at `/openapi.json`**, generated from the same schemas Fastify uses to validate and
serialise — so it cannot describe an endpoint that behaves differently.

> A Fastify trap that cost real time and now has its own comment in `src/server.ts`: a route
> registered **synchronously** mounts before a `register`ed plugin has installed its `onRoute` hook.
> The effect was that `/health` and `/config` were invisible to swagger. Every route now goes through
> `register`.

## Deployment (STE-31)

`compose.prod.yml` at the root: Postgres + API + poller + keeper + Caddy (automatic TLS over ACME,
with no renewal cron that can quietly stop working). The three Node services are the **same image
with different commands** — that is genuinely what they are.

Two things worth remembering:

- **`/health` vs `/ready`.** `/health` deliberately touches nothing (a liveness probe that calls a
  dependency reports someone else's outage as ours and gets the container restarted for it).
  `/ready` checks the database and answers 503 when it cannot. A proxy watches the second, Docker
  watches the first.
- **Postgres has no `ports:`.** One line that stops a firewall mistake from putting the PII database
  on the public internet.

`docs/deployments.md` **ships inside the image**: `src/deployments.ts` parses it for contract
addresses, so the "addresses are never hardcoded" rule still holds inside the container.

Verify from outside without SSH: `./deploy/verify-deployment.sh https://…` — 18 checks, including
that sensitive endpoints still answer 401 and that SVG is absent from the accepted upload types. Full
procedure: [`OPERATIONS.md`](OPERATIONS.md), "Deploying to the VPS".

## Not built yet (do not assume otherwise)

A re-encryption job for key rotation, an alert for when the keeper stops, an orphan-file sweeper, and
scheduled Postgres backups.

**The replica blocker is GONE.** `R2FileStore` removed it: bytes no longer live on one box's disk, so
the API is stateless. What is left before actually running a second replica:

1. **scheduled Postgres backups** — and this has to come first. A replica is availability, a backup
   is recovery; a replica copies a mistyped `DROP TABLE` faithfully.
2. **Redis for rate limiting** — the limiter exists and is already per-endpoint, but its state is
   in-memory, so two instances mean double the effective limit.

**The poller and the keeper stay singletons.** Two pollers fight over the same cursor; two keepers
pay rent twice. Only the API gets replicated.

The full list is at the end of [`OPERATIONS.md`](OPERATIONS.md). Update this file as soon as one of
them lands.
