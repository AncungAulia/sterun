# `be/` — operational notes (STE-11 + STE-16)

This document is part of the ticket rather than an addition to it. **STE-11** explicitly asked who
holds the encryption keys, how they are rotated, and what a database leak would mean. **STE-16**
asked for the indexer rebuild procedure and a restore runbook for archived entries. If you operate
the Sterun backend, this is what you have to know before starting it.

| Section | Ticket |
| --- | --- |
| Encryption keys, rotation, what a database leak means | STE-11 |
| Indexer, rebuild procedure | STE-16 |
| TTL keeper, restore runbook for archived entries | STE-16 |
| Roster bundle format (handoff contract #3) | STE-16 -> STE-18 (Ancung) |

## What is stored, and what is not

| Data | Where | Form |
| --- | --- | --- |
| Name, national ID, emergency contact | Postgres, `participants` | **encrypted** AES-256-GCM (`bytea`) |
| `salt` (32 bytes) | Postgres | raw — not PII, but secret (it is what proves the hash) |
| `totp_secret` (32 bytes) | Postgres | raw — secret, used by the STE-16 roster bundle |
| `participant_hash` | Postgres **and on-chain** | 32 bytes, the only public one |
| `runner_address`, `token_id`, `enter_tx_hash` | Postgres | public (they are on chain) |

**The only thing that touches a chain is `participant_hash`.** No name, national ID or phone number
ever enters a transaction, an event or a `uri`. Something that has reached a chain cannot be removed
— that is why the rule is this rigid.

## Encryption keys

### Who holds them

| Environment | Holder | Where |
| --- | --- | --- |
| Local dev | each developer, their own keys | `be/.env` (gitignored) |
| Testnet (STE-31) | **Axel (PM)** | VPS secret manager / systemd unit environment, not a file in the repo |
| Mainnet | none yet — outside the Instawards scope | — |

Keys **never** enter the repository, a ticket, chat, or a log. `parseKeyring` deliberately never
includes a rejected entry in its error message, because that entry is a key.

### Their shape

```bash
PII_KEYS="1:<64 hex>,2:<64 hex>"   # every key that might still be needed
PII_ACTIVE_KEY_ID="2"              # the one new rows are encrypted with
```

Generating a new one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Rotation

Every ciphertext carries its **key id** in a 2-byte header, so rotation needs no downtime and no
simultaneous re-encryption:

1. Add the new key to `PII_KEYS` (do not remove the old one).
2. Point `PII_ACTIVE_KEY_ID` at the new id. Restart. **New** rows use the new key; old rows are still
   readable with the old one.
3. Run a gradual re-encrypt: read rows where `keyIdOf(blob) != activeKeyId`, decrypt, re-encrypt,
   write. (The job does not exist yet — write it the first time a rotation actually happens;
   `keyIdOf()` is already there precisely so that job can find its work without decrypting
   anything.)
4. Once zero rows use the old key, **then** remove the old id from `PII_KEYS`.

Removing a key before step 4 makes every row still using it **permanently unreadable**. `decrypt`
fails with `no key with id N in PII_KEYS`, and that is the only honest answer available.

When to rotate: a key is suspected leaked, somebody who held one leaves the team, or on a schedule
(suggested: every 90 days if this ever became real production).

## If the database leaks

**What an attacker gets:**

- The PII ciphertext — unreadable without the keys. AES-256-GCM with a random IV per encryption, so
  two rows holding the same name **cannot** be recognised as equal from the ciphertext alone.
- Raw `salt` and `totp_secret`. These are the ones with real consequences:
  - With a `salt` plus a guess at the PII, an attacker can **verify the guess** (`sha256(preimage)`
    against the on-chain `participant_hash`). So the salt is not protection against an attacker who
    has already guessed someone's data correctly — it is protection against **rainbow tables** and
    against correlating the same person across events.
  - With a `totp_secret`, an attacker can produce valid check-in codes for that record. That means
    claiming somebody else's race pack — **if** they can also be there physically and the record is
    unclaimed. The contract's `AlreadyClaimed` guard still limits the damage to one pack.
- `runner_address`, `event_id`, `token_id` — all already public on chain.

**What they do NOT get:** readable PII, as long as the keys did not leak with it. That is why the
keys must not live on the same machine as a database dump, and must not be included in a database
backup.

**If the keys leak too**, assume all of the PII ever stored has been read. Rotating keys does **not**
fix that — the old data has already been read. What has to happen: tell the affected participants,
and (if this were ever production) follow the applicable notification obligations. Rotate anyway, so
the next leak does not add victims.

**What nothing can fix:** `participant_hash` is permanently on chain. Anyone who knows a record's
real PII can prove that link forever. This is a consequence the design accepts knowingly
(`docs/SYSTEM_DESIGN.md` §11) and the reason what gets hashed is salted per record.

## Starting the backend

```bash
docker compose up -d postgres                        # from the repository root
cp be/.env.example be/.env                           # then fill in DATABASE_URL + PII_KEYS
pnpm dev
```

Migrations run automatically before the socket opens, so the service never gets the chance to accept
a registration against a schema that does not exist yet.

Three configuration states, and only two of them are allowed to run:

| `DATABASE_URL` | `PII_KEYS` | Result |
| --- | --- | --- |
| empty | empty | runs **without** the vault — `/health` + `/config` only. This is what a fresh clone gets. |
| set | set | runs with the vault |
| set | empty | **refuses to start.** A service that can reach the database but cannot encrypt would store identity documents in readable form. |

`/config` reports `vault.enabled` and the **ids** of the keys present (never the keys), so "why did
decryption start failing after the rotation" can be answered in one request.

## Indexer (STE-16)

Three processes, deliberately separate. The API **serves** the index; it does not fill it.

```bash
pnpm indexer follow     # the poller: getEvents -> Postgres, continuously
pnpm indexer poll       # one page, then exit (cron/CI)
pnpm indexer rebuild    # truncate + replay from contract STATE, then verify
pnpm indexer doctor     # compare the index against the chain, field by field
pnpm indexer status     # cursor + row counts, without touching the network
pnpm dev                # the API — /events, /records, /runners/..., /events/:id/roster
```

The relevant environment variables (all have defaults, see `be/.env.example`):
`INDEXER_POLL_INTERVAL_MS` (7000), `INDEXER_PAGE_LIMIT` (200), `INDEXER_START_LEDGER`,
`INDEXER_SOURCE_ACCOUNT`.

### Two sources, and the difference matters

Every row carries a `source` column:

| `source` | Where from | What it knows |
| --- | --- | --- |
| `event` | `getEvents` (the poller) | **when** — ledger, tx hash, lifecycle ordering |
| `state` | view calls to the contract (rebuild) | **what is true now** — everything except provenance |

A rebuild still produces a transition history, reconstructed from `entered_at` / `claimed_at` /
`result_at` in `RecordData` — the contract's own clock, so the history is honest. What is missing is
the ledger and the tx hash, and the row says so (`ledger IS NULL`) rather than inventing a number.

### What makes the poller safe to kill at any moment

- **The cursor is stored after its page commits.** Dying mid-page means that page is repeated, not
  skipped. Repeating is free: `chain_events` is keyed by the RPC's event id, so a second pass
  recognises everything and does no work.
- **An empty page does not mean caught up.** The RPC scans a bounded ledger window per request
  (10,000 on testnet) and answers with an empty page plus a cursor when that window held nothing.
  `last_ledger` is read from the cursor, not from `latestLedger`. This is not theoretical: the first
  version used `latestLedger`, and `/indexer/status` reported being caught up while it was twelve
  requests behind. Found by running it against real testnet.
- **An event for something not yet indexed counts as an `orphan`, not an error.** An index that
  started mid-race has legitimate holes; holding the poller hostage to one helps nobody. What fixes
  a hole is `rebuild`.

### Rebuild: the procedure that has to exist

**Why it exists.** Testnet RPC only retains a bounded `getEvents` window (~120,960 ledgers at the
time of writing, about seven days). Past that, "replay the events" is no longer available. Contract
state is always available. So Sterun's recovery path runs from **state**, not from events —
`docs/SYSTEM_DESIGN.md` §11, point 10.

```bash
pnpm indexer rebuild
```

Three phases, in a deliberate order:

1. **Record the starting ledger before reading anything.** The poller resumes from there, so a change
   landing mid-walk is **repeated** rather than missed. Repeating is idempotent; missing is not.
2. **Read everything over RPC into memory.** No transaction is open, so a slow walk locks nobody out.
3. **Truncate + insert in ONE transaction.** Readers never see a half-empty index — they see the old
   index, then the new one.

`rebuild` then runs `doctor` automatically. A rebuild that was not checked is a rebuild that cannot
be trusted.

`chain_events` is **not** truncated: it is the only local evidence of what the chain said at the
time, and the RPC will not return it once its retention window has passed.

When to run it: after a gap events cannot close (the poller was down longer than the retention
window), after `doctor` reports a mismatch, after restoring an archived entry, or after a schema
migration that changes how a column is filled.

---

## TTL keeper (STE-16)

```bash
pnpm keeper scan        # report what is due; sends nothing (needs no key)
pnpm keeper run         # extend everything below the threshold
pnpm keeper report      # run history from the ttl_keeper_runs table
pnpm keeper restore     # recover entries the RPC no longer serves
```

Intended as a **weekly cron** (`docs/SYSTEM_DESIGN.md` §3.4, point 4). Running it more often breaks
nothing: `ExtendFootprintTTLOp` is a floor and never shortens anything, and entries still above the
threshold are skipped without a transaction.

`run` and `restore` need `TTL_KEEPER_SECRET`: an account holding XLM and **nothing else**. Extending
a TTL needs nobody's authorisation — which is exactly why rent may be paid by a stranger — so this
key owns no record and can spend nothing beyond its own fees.

### Why the keeper does not call `extend_record_ttl`

`RaceRecord::extend_record_ttl(token_id)` extends two things: the contract instance and
`DataKey::Record(token_id)`. It does **not** touch OpenZeppelin's `NFTStorageKey::Owner(token_id)`
nor the per-owner `Enumerable` index, because both live under keys owned by another crate and that
function was never written to touch them. A record whose `Record` entry is alive but whose `Owner`
entry is archived still breaks `verify` and `records_of` — and that is most of what a race record is
for.

So the keeper works at the **ledger key** level and uses `ExtendFootprintTTLOp`. The keys come from
**simulating** `record_of`, `owner_of` and `records_of` and taking the footprint the host computed —
not from reassembling OZ's key layout by hand. A keeper extending the wrong keys would report success
every week while the records stayed archived, and that failure would be silent for months.

### The numbers

The threshold matches the constant in the contract
(`sc/contracts/race_record/src/lib.rs`) exactly: extend when under **~120 days** remain (2,073,600
ledgers, one ledger about 5 seconds). A different number would make "when does this expire" depend on
who touched the entry last.

The extension target is **3,110,399**, one ledger **below** `max_entry_ttl` — and that `-1` is not a
typo. `ExtendFootprintTTLOp` validates `extendTo` as strictly below the maximum and rejects the
boundary value with `EXTEND_FOOTPRINT_TTL_MALFORMED`, which on the surface only shows up as
`txFailed`. `BUMP_TO` in the contract is still the full 180 days and that is correct there: the
`extend_ttl` host function **clamps** to the maximum rather than rejecting. Two validators, one
intent, one ledger apart. Raising this number to "match" the contract would break every keeper run.

Overrides: `TTL_THRESHOLD_LEDGERS`, `TTL_EXTEND_TO_LEDGERS`.

> A consequence worth learning once: a freshly written persistent entry **starts** at around 120
> days, so the first run finds nearly everything due. That is normal. After one successful run
> everything sits at 180 days and the keeper goes quiet for about 60.

### Reading the results

```sql
SELECT id, started_at, status, scanned_keys, below_threshold, extended_keys, missing_keys
  FROM ttl_keeper_runs ORDER BY started_at DESC LIMIT 5;
```

The row is written **before** the work starts, with status `running`. A keeper that dies mid-run
leaves evidence that it ran and did not finish — which is precisely the case that needs to be
visible. Only `SUCCESS` transactions count towards `extended_keys`: a job reporting rent that was
never paid is worse than a job reporting nothing.

`missing_keys > 0` means some entries are **not served by the RPC** — archived, or never written.
Extension cannot help them (`ExtendFootprintTTLOp` skips what it cannot see). Continue to the runbook
below.

### Restoring an archived entry

The symptom is one of these:

- `pnpm keeper scan` reports `missing_keys > 0`;
- the indexer fails with `a ledger entry this call reads has been ARCHIVED`;
- `record_of` / `verify` return an error to a client instead of a value.

The procedure:

1. **First establish that this is archival and not a misbehaving RPC.** Run `pnpm keeper scan` again,
   and check `pnpm indexer status` — if the RPC was recently restarted, its `oldest_ledger` moved
   too.
2. **Collect the keys again; do not reuse an old list.** `pnpm keeper restore` deliberately rescans:
   the set that needs restoring is whatever the RPC does not serve **now**, and a list copied from
   yesterday's run would restore the wrong entries.
3. **Run `pnpm keeper restore`.** It sends `RestoreFootprintOp` with the keys in the **read-write**
   footprint (the opposite of extend, which uses read-only). This is far more expensive than
   extending — which is why `run` never calls it by itself; a human decides.
4. **Extend immediately afterwards.** A restore returns entries with the minimum TTL. `pnpm keeper
   run`.
5. **Rebuild the index.** `pnpm indexer rebuild`. While it was archived, the poller may have counted
   related events as `orphans`.
6. **Record it in `docs/deployments.md`**: what was archived, when, and the restore transaction hash.

The prevention is not this runbook; it is a weekly cron that never gets skipped.

---

## The scanner list (added in STE-17, Ancung)

`GET /events/:eventId/scanners` — consumed by the organiser console.

**Why this endpoint exists, and why it lives here:** the contract cannot answer the question.
EventRegistry has `is_scanner(event_id, addr)` and **no** way to enumerate — deliberately, because a
view returning an unbounded vector gets more expensive as an event grows. So the only place that can
assemble the list is the index, which has been recording `scanner_added` / `scanner_removed` into
`event_scanners` all along. The data has existed since STE-16; what was missing was the way out.

No auth: what comes back is addresses that are already public on chain (`scanner_added` is readable
by anyone), so opening it leaks nothing.

```jsonc
{
  "scanners": [{ "address": "GA…", "added_ledger": 4469750 }],
  "last_ledger": 4469811   // how far the index has caught up, NOT how far this event has
}
```

`last_ledger` deliberately comes from the ingestion cursor rather than from the event rows: an empty
list is a claim about what is **not** there, and the only honest freshness measure for a claim like
that is how far the index has read.

**This is a fast path, not an authority.** The console uses it to learn which addresses to ask about,
then confirms each one against the chain with `is_scanner`. Who may scan is an authorisation
decision, and authorisation decisions are read from the authoritative copy — the same rule the
results route follows when it reads the organiser.

---

## Roster bundle (handoff contract #3)

`GET /events/:eventId/roster` — consumed by the scanner PWA (STE-18, Ancung).

**Auth:** a Stellar wallet signature, the same as the vault routes (`POST /auth/challenge`, sign the
nonce, send `x-sterun-address` / `x-sterun-nonce` / `x-sterun-signature`). Nonces are single-use and
expire after 2 minutes. The signature may be over the nonce bytes directly (a script holding a
keypair) **or** SEP-53 (what browser wallets use through Stellar Wallets Kit); the server tries both.

**Who may:** that event's organiser, or an address the **chain** calls a scanner
(`is_scanner(event_id, addr)`). Re-read from the chain on **every request** — a scanner revoked
on-chain loses access immediately, with no cache to invalidate.

```jsonc
{
  "event_id": 0,
  "snapshot_ledger": 4469811,          // how fresh the state inside is
  "generated_at": "2026-09-02T18:10:47.702Z",
  "totp": { "digits": 6, "step_seconds": 30, "tolerance_steps": 1 },
  "entries": [
    {
      "token_id": 0,
      "bib_no": 1,
      "category_id": 0,
      "state": "Entered",              // Entered | RacepackClaimed | Finished | Dnf
      "name_fragment": "Budi S.",      // given name + initials; null for pre-migration-003 rows
      "totp_secret": "…64 hex…"        // 32 bytes, used for a local HMAC in the scanner
    }
  ],
  "count": 1,
  "missing_from_index": 0              // vault rows whose token_id is not indexed yet
}
```

Notes for whoever consumes it:

- **`totp` is sent; do not hardcode it.** The parameters are frozen in `docs/specs/HASH_AND_TOTP.md`;
  a scanner that copies the numbers will silently disagree if they ever change.
- **`snapshot_ledger` is not decoration.** A bundle far behind holds stale `state`, and a stale
  `Entered` is exactly what hands out a second race pack. Re-fetch before the start.
- **`missing_from_index` > 0 means the bundle is incomplete** — someone has entered but the indexer
  has not caught up. Run `pnpm indexer poll` and fetch again.
- **`name_fragment` is not a name.** Full given name, initials for the rest, computed once at submit
  and stored **in that form** (encrypted, like every other PII column). No code path can turn it back
  into a full name, because the information genuinely is not there any more. It is for a marshal's
  sanity check, not identity verification — what verifies identity is
  `verify(token_id, participant_hash)`.
- **"One pack per entry" is still enforced by the contract.** The local roster check is a UX
  optimisation; `claim_racepack` reverts with `AlreadyClaimed` if the state is not `Entered`.

**The risk is acknowledged openly** in `docs/SYSTEM_DESIGN.md` §11, point 3: anyone holding a roster
can produce valid check-in codes for every participant in it. What bounds the damage: the on-chain
guards, the scanner allowlist, and one event's scope per request.

---

## Deploying to the VPS (STE-31)

Five containers: Postgres, the API, the poller, the TTL keeper, and Caddy in front handling TLS. The
three Node services are the **same image with different commands** — that is genuinely what they are,
and one image means one build, one version, and no way for the poller to be running code the API
does not have.

Deployment is **manual and documented**, not CD. That is the ticket's decision ("a documented manual
deploy is enough for v1"), and every piece of automated pipeline adds a component with a runbook of
its own.

### Before you start

| Requirement | Why |
| --- | --- |
| A VPS, Docker + the compose plugin | somewhere for it to run |
| A domain whose **DNS already points at the VPS** | Caddy gets its certificate over the ACME HTTP challenge; without correct DNS the challenge fails and Caddy retries with backoff |
| Ports 80 and 443 open | 80 is used by ACME, not just for a redirect |
| A **fresh** testnet keeper account | do not copy the account from the STE-16 evidence; that was a throwaway laptop account |

### The steps

```bash
git clone https://github.com/AncungAulia/sterun.git && cd sterun

cp be/.env.production.example be/.env.production
$EDITOR be/.env.production      # STERUN_DOMAIN, POSTGRES_PASSWORD, PII_KEYS, TTL_KEEPER_SECRET

# compose reads STERUN_DOMAIN and POSTGRES_PASSWORD from .env at the root
ln -s be/.env.production .env

docker compose -f compose.prod.yml up -d --build
docker compose -f compose.prod.yml ps
```

Migrations run themselves when the API starts, **before** its socket opens — so the service never
gets the chance to accept a registration against a schema that does not exist yet. The `indexer` and
`keeper` containers wait for the API to start for exactly that reason.

### The real deployment: jameserver (pve02 / ct-sterun)

This is the deployment that actually runs, and its shape **differs** from the generic steps above
because of one fact that only surfaced after getting into the server.

| Item | Value |
| --- | --- |
| Proxmox node | `pve02` (cluster `homelab`, 2 nodes) |
| Container | LXC **203**, hostname `ct-sterun`, Debian 13 |
| Resources | 2 cores, 2 GiB RAM, 512 MiB swap, 20 GiB rootfs (`local-lvm`) |
| LAN IP | `192.168.18.42/24`, gw `192.168.18.1` |
| LXC features | `unprivileged=1`, `nesting=1,keyctl=1` (Docker needs nesting), `onboot=1` |
| Repository path | `/opt/sterun` |

Conventions followed from the containers already on this cluster: vmid `2xx` for pve02, hostname
prefix `ct-`, IP `192.168.18.4x`, bridge `vmbr0`, nameserver `1.1.1.1`.

#### Why the ingress here is NOT Caddy

This homelab router does **not** forward ports 80/443. That was tested rather than assumed: a
temporary listener was put on port 80 of pve01, and its WAN IP (`182.253.126.14` — a genuine public
IP, not CGNAT) was probed from the internet through an external proxy. The result was a timeout
(522). Which means:

- **ACME HTTP-01 is impossible.** The Caddy inside `compose.prod.yml` would never get a certificate,
  and letting it keep trying would only burn Let's Encrypt rate limits.
- The ingress has to come from **outside** the container.

#### Ingress: Cloudflare Tunnel (what is used now)

`jameshub.fun` has its DNS on Cloudflare. A tunnel solves all three at once — no port forwarding, TLS
handled by Cloudflare, and the DNS record created by the tunnel itself.

**Locally-managed, not token-managed.** The routing rules live in `deploy/cloudflared-config.yml`
inside the repository rather than in the dashboard. The reason: rules that live in a UI cannot be
reviewed in a PR, do not roll back with anything, and `git log` cannot answer questions about them.

The procedure (once per deployment):

```bash
# 1. on pve01 — one browser login, pick the jameshub.fun zone
cloudflared tunnel login

# 2. create the tunnel and its DNS record
cloudflared tunnel create sterun-api
cloudflared tunnel route dns sterun-api api-sterun.jameshub.fun

# 3. move the credentials to the deployment host WITHOUT going through a clipboard or chat
ssh root@100.111.186.114 "cat ~/.cloudflared/<TUNNEL_ID>.json" \
  | ssh root@192.168.18.42 "mkdir -p /opt/sterun/secrets \
      && cat > /opt/sterun/secrets/cloudflared-credentials.json \
      && chmod 600 /opt/sterun/secrets/cloudflared-credentials.json"

# 4. the cloudflared image runs as uid 65532, not root. A 600 file owned by root
#    is NOT readable by it — the symptom is `permission denied` repeating every
#    second. The fix is chown, NOT chmod 644: the secret stays 600.
ssh root@192.168.18.42 "chown 65532:65532 /opt/sterun/secrets/cloudflared-credentials.json"

# 5. bring it up
ssh root@192.168.18.42 "cd /opt/sterun && \
  docker compose -f compose.prod.yml -f compose.homelab.yml --profile tunnel up -d cloudflared"
```

Healthy means the log shows **four** `Registered tunnel connection` lines (Cloudflare connects to two
regions, two connections each).

#### Why `api-sterun` and NOT `api.sterun`

The name the ticket originally asked for was `api.sterun.jameshub.fun`. That **cannot be served** on
the current Cloudflare plan, and the reason is not configuration:

**Universal SSL only issues certificates one level deep** — `jameshub.fun` and `*.jameshub.fun`. A
two-level name needs `*.sterun.jameshub.fun`, which only exists with **Advanced Certificate Manager**
(paid) or Total TLS.

Demonstrated rather than guessed:

| Hostname | Result |
| --- | --- |
| `api.sterun.jameshub.fun` | `SSL alert number 40` — the handshake is refused at the edge |
| `api-sterun.jameshub.fun` | **14/14 passing** |

What makes this misleading: the request **never reaches** the tunnel, so the cloudflared log is clean
and all four connections are healthy. The symptom looks exactly like a dead tunnel while Cloudflare
is refusing before it forwards. If this symptom ever appears again for a new name, count the
sub-domain levels before taking the tunnel apart.

> The `api.sterun.jameshub.fun` CNAME has been **removed** from the zone (through the dashboard —
> `cloudflared` has no command to delete a DNS route), and its ingress rule was removed from
> `deploy/cloudflared-config.yml`. Both, deliberately: a rule without DNS is dead code implying a URL
> that is really NXDOMAIN, and DNS without a rule is a URL that fails confusingly. If ACM or Total
> TLS is ever enabled, restore both in one change — never just one of them.

### `indexer rebuild` and the scanner list

`rebuild` reconstructs the whole index from contract state. One table cannot be reconstructed that
way: **`event_scanners`**. EventRegistry only has `is_scanner(event_id, address)` — ask about one
address, get yes or no — and there is no function that enumerates.

So `rebuild` treats that table specially:

1. gather candidates from `event_scanners` **and** from replaying `scanner_added`/`scanner_removed`
   out of `chain_events` (that raw log is deliberately carried through a rebuild),
2. verify each address against the chain with `is_scanner`,
3. write back the ones the chain still recognises.

The effect: `pnpm indexer rebuild` — including after the table has been `TRUNCATE`d by hand —
restores the scanner list, and a scanner revoked while the index was down disappears, thanks to step
2.

**What still cannot be recovered**: a scanner added **before** this index ever polled. There is no
row, no event in the log, and the chain cannot be asked "who are they". `/events/:eventId/scanners`
will under-report without any way to know that it is under-reporting.

When in doubt about whether the list is complete, do not guess — confirm each address against the
chain:

```bash
# the organiser console already does this per address before trusting one
stellar contract invoke --id $EVENT_REGISTRY --network testnet \
  -- is_scanner --event_id 0 --address G...
```

And remember the division of labour: **authorisation never goes through this table.** The roster
bundle reads the allowlist from the chain (`reader.isScanner`) on every request, so an under-reporting
index can never grant access to the wrong person — at worst it makes the console fail to show
somebody who is genuinely entitled.

### Moving to the v2 contracts — done, and this is how

Done on 2026-09-09. James's decision: move now, because the longer it waits the more data has to be
thrown away. At the time it held 3 participants (**all with a NULL `token_id`** — no PII was linked
to an on-chain record), 7 events and 14 records.

**Why this could never be "change an env var and restart":** no column distinguishes one contract
from another.

| Table | Primary key | Can it tell v1 from v2? |
| --- | --- | --- |
| `events` | `event_id` | no |
| `categories` | `(event_id, category_id)` | no |
| `records` | `token_id` | no |
| `participants` | `id` uuid, but stores `event_id`/`token_id` | no |
| `chain_events` | has `contract_id` | **yes** — but it is only the raw log |

v2 numbers events from 0 again, so v2 event 0 **overwrites** v1's event 0 row. The index can be
rebuilt from state; `participants` cannot — it links identity documents to those same `token_id`s,
and the roster maps `token_id` → `totp_secret`, so a scanner would validate the wrong person.

**How the addresses moved:** not an environment variable. `docs/deployments.md` now uses the
**unqualified** name for the v2 pair (`| **EventRegistry** (C1) |`) and labels the old one `v1`. The
parser in `src/deployments.ts` matches the unqualified name, so the document remains the single
source of addresses — and a test fails if the parser resolves the v1 pair.

#### The procedure (the order matters)

```bash
# 1. BACK UP FIRST. There is no scheduled backup; this is the only copy.
mkdir -p /opt/sterun/backups
docker exec sterun-postgres-1 pg_dump -U sterun -d sterun \
  | gzip > /opt/sterun/backups/pre-v2-$(date -u +%Y%m%dT%H%M%SZ).sql.gz

# 2. Stop the writers. A poller running during the truncate would refill the
#    tables from the OLD contract halfway through.
docker compose -f compose.prod.yml -f compose.homelab.yml --profile tunnel stop indexer keeper api

# 3. New code (the addresses travel in the image, via docs/deployments.md).
git pull --ff-only origin main
docker compose -f compose.prod.yml -f compose.homelab.yml --profile tunnel up -d --build api

# 4. Empty the index AND the vault. `indexer rebuild` does NOT touch participants —
#    that is the table that cannot be rebuilt from the chain, so it has to be manual.
docker exec sterun-postgres-1 psql -U sterun -d sterun -c \
  'TRUNCATE participants, records, events RESTART IDENTITY CASCADE'

# 5. Rebuild from v2 contract state.
docker compose -f compose.prod.yml -f compose.homelab.yml run --rm indexer \
  node dist/cli/indexer.js rebuild

# 6. Bring everything back up.
docker compose -f compose.prod.yml -f compose.homelab.yml --profile tunnel up -d
```

`chain_events` is deliberately **not** truncated: it has a `contract_id`, so the raw v1 log stays as
readable evidence without contaminating the materialised tables.

#### If it has to go back to v1

Flip the labels in `docs/deployments.md`, redeploy, then `psql -f` the backup from step 1 into an
empty database. Do **not** restore that backup on top of v2 data — the result is exactly the mixture
this whole procedure avoids.

### R2: object storage for metadata files

Event file bytes live in **Cloudflare R2** when all four of these variables are present; when they
are all empty it falls back to local disk.

```bash
STERUN_R2_ACCOUNT_ID=<32 hex, from the Cloudflare dashboard>
STERUN_R2_BUCKET=sterun-files
STERUN_R2_ACCESS_KEY_ID=<R2 API token: Access Key ID>
STERUN_R2_SECRET_ACCESS_KEY=<R2 API token: Secret Access Key>
```

**All four or none.** Three of four means the process starts normally and then fails its first upload
with a 403 that looks like a wrong secret. Startup refuses a half-configuration.

The S3 endpoint is built from the account id (`https://<id>.r2.cloudflarestorage.com`) and the SigV4
region is always **`auto`** — not `us-east-1`, even though that is aliased.

> `R2_TOKEN_VALUE` in `.env` is a **Cloudflare API token**, not an S3 credential. The application
> does not use it; it is for managing buckets through `api.cloudflare.com` (creating them, listing
> them). The Access Key ID + Secret Access Key above are what read and write objects.

**The public URL does not change.** Files are still served by this API at `/files/:sha256`. Do not
switch on a public bucket or an R2 custom domain and move the URLs there: those URLs are committed
on-chain permanently, and the security headers (the `sandbox` CSP, `nosniff`) disappear the moment a
bucket is doing the serving.

Checking what a bucket holds without SSH-ing to the box:

```bash
# needs R2_TOKEN_VALUE (the API token, not the S3 credential)
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACC/r2/buckets" \
  -H "Authorization: Bearer $R2_TOKEN_VALUE" | jq '.result'
```

**Moving from disk to R2 (or back) is not automatic.** Objects already on the volume do not travel,
and their URLs 404 the moment the store changes. The procedure: re-upload every file from the volume
into the bucket under the key `files/<sha256>` with the correct content type, **before** changing the
configuration. Because the files are content-addressed, re-uploading the same file never produces a
different URL — so this migration is safe to repeat.

### Event metadata files

Each event's poster and JSON document are stored **content-addressed**: the filename is the sha256 of
the contents, and that is also the number that goes into `create_event` as `metadata_hash`.

```bash
# What a public box must have in be/.env.production:
STERUN_PUBLIC_BASE_URL=https://api-sterun.jameshub.fun
```

When that variable is empty the API builds the URL from the request's `Host` header. That header is
controlled by the caller, and the URL this endpoint returns is the one an organiser commits
**permanently** to the ledger. So on a box reachable from the internet, this is not optional.

**The `sterun-files` volume is not a cache — never delete it to "clean up".**

This differs from `sterun-caddy-data` or an image, both of which can be rebuilt. A file's hash is
already on the ledger and cannot be withdrawn; if the bytes are gone, that event's `uri` points at a
404 forever and the event page refuses to display it. Back it up alongside Postgres rather than
separately: an event row and its poster are one fact.

```bash
# What it holds and how big it is
docker exec sterun-api-1 du -sh /app/data/files
docker exec sterun-api-1 find /app/data/files -type f | wc -l

# Backup (together with the database dump, in one window)
docker run --rm -v sterun_sterun-files:/data -v "$PWD:/out" alpine \
  tar czf /out/sterun-files-$(date -u +%Y%m%d).tar.gz -C /data .
```

**The store ceiling.** `STERUN_FILES_MAX_BYTES` (512 MiB by default) is the only thing bounding
growth: anyone holding a Stellar keypair may upload, and keypairs are free to make, so a per-address
rule holds nothing back. When it is full the endpoint answers **507** with a message naming this
variable — raise it, or (later, once the sweeper exists) clear out orphaned files. What **not** to
do: delete files at random, because there is no way to tell a poster already referenced on-chain from
one that is not without reading every event's `uri` in the index.

**If an upload fails with `EACCES`.** It means the volume was created before the image had
`/app/data/files` owned by uid 1000 — Docker creates an empty volume owned by root when the path is
absent from the image. Fix it once:

```bash
docker run --rm -v sterun_sterun-files:/data alpine chown -R 1000:1000 /data
docker compose -f compose.prod.yml -f compose.homelab.yml up -d api
```

#### Tailscale Funnel: the fallback, currently off

Before the tunnel existed, the ingress was Tailscale Funnel on pve01. It has been turned off
(`tailscale funnel --https=443 off`) so there are not two public doors with only one being looked
after. If the tunnel misbehaves and a quick way back is needed:

```bash
ssh root@100.111.186.114 "tailscale funnel --bg http://192.168.18.42:3001"
```

That gives a public TLS URL at `pve01.<tailnet>.ts.net` within seconds, without Cloudflare.

#### The keeper: its cadence belongs to compose, not to the CLI

`keeper run` is **one-shot** — its own header says "intended as a weekly cron" — so it exits 0 as
soon as it finishes. Running it bare under `restart: unless-stopped` means Docker starts it again
immediately, forever. That genuinely happened on this box: **37 restarts, run #1766**, scanning 42
keys every few seconds, all of it against the **public** testnet RPC.

The loop now lives in the keeper service's `command:`, and the interval is
`TTL_KEEPER_INTERVAL_SECONDS` (604800 by default, a week). The first run is still immediate, so a
deploy proves the keeper works — rather than proving it seven days later.

How to confirm it is healthy: `docker inspect sterun-keeper-1 --format "{{.RestartCount}}"` must be
**0**, and its log should end at `keeper sleeping 604800s until the next run`. If that number keeps
climbing, it is back in a restart storm.

#### Day-to-day operations

```bash
ssh root@192.168.18.42
cd /opt/sterun
docker compose -f compose.prod.yml -f compose.homelab.yml ps
docker compose -f compose.prod.yml -f compose.homelab.yml logs -f api
```

`compose.homelab.yml` adds exactly one thing: it publishes the API port **to the LAN IP only**
(`192.168.18.42:3001`), not `0.0.0.0`. That is needed because the ingress lives on another host
(pve01); Postgres still has no `ports:` at all.

#### What differs from a laptop's `be/.env`

- The production `PII_KEYS` are **different** from the laptop's. New deployment, empty vault, nothing
  that needs decrypting with an old key — and one key in two places means a leaked laptop is a leaked
  production.
- `TTL_KEEPER_SECRET` is a **new** account created specifically for this VPS
  ([`GD3MSYCLECUOUQNFFXJLGB7ZKCUANIRNYM7QGKS2YUVRDLWY4IDAABL4`](https://stellar.expert/explorer/testnet/account/GD3MSYCLECUOUQNFFXJLGB7ZKCUANIRNYM7QGKS2YUVRDLWY4IDAABL4)),
  not the account from the STE-16 evidence. It only needs XLM: extending a TTL needs nobody's
  authorisation.
- `SUSD_DISTRIBUTOR_SECRET` is deliberately **left empty**. The API never uses it — the faucet is a
  CLI, not an endpoint — and a key that can move the entire test supply has no reason to sit on a
  public host.

### Verification — from outside, without SSH

```bash
./deploy/verify-deployment.sh https://api-sterun.jameshub.fun
```

Eighteen checks at present (the script counts what passes rather than asserting a fixed total, so the
number grows as endpoints are added). What matters is not only `/health`:

- **TLS** genuinely terminates, and `--proto '=https'` refuses a redirect from plaintext — a URL that
  quietly drops to HTTP would pass every other check while sending wallet signatures in the clear.
- **`/ready`** proves the database is readable. `/health` deliberately touches **nothing**: a liveness
  probe that calls a dependency reports someone else's outage as ours, and gets the container
  restarted for it. Caddy watches `/ready`; Docker watches `/health`.
- **The sensitive endpoints still answer 401** without a signature. A deployment that gets this wrong
  would serve identity-adjacent data to the internet — and look perfectly healthy in every other
  check.
- **SVG is absent from the accepted upload types.** SVG is XML that can carry `<script>`, served from
  the same origin as the PII vault; the check exists so adding it can never pass unnoticed.

Save the output (it carries a UTC timestamp) into `docs/deployments.md` as evidence, per working
agreement point 8.

### What makes it survive a reboot

`restart: unless-stopped` on every service. Not `always`: a container an operator **deliberately**
stopped must stay stopped after a reboot, otherwise stopping something for maintenance gets undone by
the next power cut.

### Postgres has no `ports:`

Deliberate, and it is the one line that stops a firewall mistake from putting the PII database on the
public internet. Postgres is reachable only from the compose network. For `psql` from the VPS:

```bash
docker compose -f compose.prod.yml exec postgres psql -U sterun sterun
```

### After a deploy

```bash
# The index is empty until the poller catches up. That is normal, not a bug.
docker compose -f compose.prod.yml logs -f indexer

# If the RPC has already moved past its getEvents window, rebuild from contract state:
docker compose -f compose.prod.yml run --rm indexer node dist/cli/indexer.js rebuild
```

### Nonces now live in Postgres

Since STE-31, auth nonces live in the `auth_nonces` table rather than in process memory. That is what
makes **a second instance possible**: a nonce issued by instance A and spent against instance B used
to fail with `unknown-nonce` — a lie that only appears under load, only sometimes, and sends people
to inspect their signing code.

Single use is held by `DELETE … RETURNING`, one atomic statement. Two instances presenting the same
nonce at the same moment produce **one** row between them.

Adding an API replica is now a configuration change rather than a rewrite — but it still has not been
done, and has not been tested under real load.

### Rollback

```bash
git checkout <the previous commit>
docker compose -f compose.prod.yml up -d --build
```

Migrations are **forward-only** — there is no `down`. Rolling back to a commit with an older schema
works as long as the newer migrations were additive (so far they all have been). A migration that
drops a column would break this, and that has to be discussed before it is written, not afterwards.

## Not there yet (do not assume otherwise)

- **No scheduled backups.** This is the next infrastructure step, and it blocks the two below it: a
  replica is availability, a backup is recovery, and a replica copies a mistyped `DROP TABLE`
  faithfully. When backups do exist: the database backup and the keys must **not** live in the same
  place.
- **The rate limiter's state is in memory.** The limits themselves exist and are per-endpoint since
  STE-20, but two instances would mean twice the effective limit. Redis before a second replica.
- **No re-encryption job** for rotation (step 3 above).
- **No data erasure** (right to erasure). A vault row can be deleted; `participant_hash` on chain
  cannot.
- **No automatic alert** when the keeper stops or `missing_keys > 0`. For now the way to know is to
  read `ttl_keeper_runs` (`pnpm keeper report`). STE-31 runs the keeper as a self-restarting
  container; **being notified when it stops still does not exist**.
- **No orphan-file sweeper.** A file no event's `uri` references stays stored. What bounds growth is
  the store ceiling, not deletion.
- **The keeper scans per record.** It costs `2 x records + runners` simulations per run. Enough at MVP
  scale (one event, hundreds of entries, weekly) and not enough for tens of thousands. The honest
  improvement when that arrives is extending **per category**, and that needs a contract change — not
  merely a larger batch size.
- **Backfilling `name_fragment` is impossible** for rows created before migration 003: the fragment
  can only be derived from the plaintext at submit time. The roster reports `null`.
- ~~**The indexer is not deployed as a service.**~~ STE-31: an `indexer` container in
  `compose.prod.yml`, `restart: unless-stopped`.
- **The keeper account is still a throwaway testnet account.** The one in the evidence
  (`GCYM7TQB…XV26`) was made through friendbot from a laptop. For the VPS, STE-31 created its own and
  put the secret in a secret manager — rather than copying this one.
