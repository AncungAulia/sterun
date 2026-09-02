-- STE-16 (C8) — the indexer, the TTL keeper's log, and nothing that identifies
-- a person.
--
-- One rule shapes this schema, and it is the opposite of 001's: **everything in
-- here is already public on-chain.** These tables are a cache of the ledger, so
-- a `SELECT *` may be pasted into a bug report. Nothing encrypted lives here,
-- and nothing here may ever join to `participants` in a way that puts a name in
-- a row — the only column that crosses is `token_id`.
--
-- The second rule is that the chain is authoritative and this is a cache. Every
-- materialised table can be dropped and rebuilt from contract state alone
-- (`pnpm indexer rebuild`), which is why nothing here has a value that exists
-- only in Postgres.

-- ---------------------------------------------------------------------------
-- Ingestion
-- ---------------------------------------------------------------------------

-- Where the poller is. One row per logical stream; today there is exactly one,
-- named 'contracts', covering both contract ids in a single getEvents filter.
CREATE TABLE indexer_cursor (
    stream          text PRIMARY KEY,

    -- The RPC pagination token from the last successfully APPLIED page. NULL
    -- before the first poll, and after a rebuild that did not read events.
    cursor          text,

    -- Highest ledger whose events are in this database. Also what /indexer/status
    -- reports as lag against the RPC's latest ledger.
    last_ledger     integer NOT NULL DEFAULT 0 CHECK (last_ledger >= 0),

    -- The RPC's retention floor at the last poll. Recorded because it is the
    -- number that decides whether a gap can still be closed by replaying events
    -- or needs a state rebuild (SYSTEM_DESIGN.md §11 point 10).
    oldest_ledger   integer CHECK (oldest_ledger >= 0),

    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Every Sterun event we have ever ingested, decoded but not interpreted.
--
-- Its primary key is the RPC's own event id, which is what makes the whole
-- poller idempotent: re-reading a page after a crash re-inserts the same ids
-- and changes nothing. It is also the audit trail — when a materialised row
-- looks wrong, this says which ledger and which transaction produced it.
CREATE TABLE chain_events (
    id                  text PRIMARY KEY,
    contract_id         text NOT NULL CHECK (contract_id ~ '^C[A-Z2-7]{55}$'),
    name                text NOT NULL,
    ledger              integer NOT NULL CHECK (ledger >= 0),
    ledger_closed_at    timestamptz NOT NULL,
    tx_hash             text NOT NULL CHECK (tx_hash ~ '^[0-9a-f]{64}$'),

    -- The decoded payload. jsonb rather than columns because the eleven event
    -- shapes have almost nothing in common, and this table exists to be read by
    -- a human during an incident, not joined against.
    --
    -- i128 and u64 values are STRINGS in here. JSON numbers are IEEE doubles and
    -- a price in stroops is not safe in one.
    payload             jsonb NOT NULL,

    ingested_at         timestamptz NOT NULL DEFAULT now()
);

-- The replay order: ledger first, then id, which is the order getEvents returns.
CREATE INDEX chain_events_ledger_idx ON chain_events (ledger, id);
CREATE INDEX chain_events_name_idx ON chain_events (name, ledger);

-- ---------------------------------------------------------------------------
-- Materialised chain state
-- ---------------------------------------------------------------------------

-- `source` appears on every materialised table and answers "where did this row
-- come from": 'event' means the poller saw it happen and knows the ledger and
-- transaction; 'state' means a rebuild read it out of contract storage, which
-- is equally true but carries no provenance. It is not decoration — the restore
-- and rebuild runbooks in be/OPERATIONS.md both key off it.
CREATE TYPE row_source AS ENUM ('event', 'state');

CREATE TABLE events (
    event_id        integer PRIMARY KEY CHECK (event_id >= 0),
    organiser       text NOT NULL CHECK (organiser ~ '^G[A-Z2-7]{55}$'),
    name            text NOT NULL,
    metadata_hash   bytea NOT NULL,
    uri             text NOT NULL,

    -- u64 unix seconds on-chain. bigint here; a Postgres integer would run out
    -- in 2038 and this is a table about dates.
    starts_at       bigint NOT NULL CHECK (starts_at >= 0),
    status          text NOT NULL CHECK (status IN ('Draft', 'Open', 'Closed', 'Completed')),

    source          row_source NOT NULL,
    last_ledger     integer NOT NULL CHECK (last_ledger >= 0),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
    event_id        integer NOT NULL REFERENCES events (event_id) ON DELETE CASCADE,
    category_id     integer NOT NULL CHECK (category_id >= 0),
    code            text NOT NULL,
    distance_m      integer NOT NULL CHECK (distance_m > 0),
    quota           integer NOT NULL CHECK (quota > 0),

    -- i128 in the token's 7-decimal representation. numeric(39,0) holds the
    -- whole i128 range; `pg` hands it back as a string, which BigInt() takes
    -- exactly. Never a float — one stroop of drift is a failed `enter`.
    price_stroops   numeric(39, 0) NOT NULL CHECK (price_stroops >= 0),

    -- Also the next bib sequence. Advanced by `slot_reserved`.
    entered_count   integer NOT NULL DEFAULT 0 CHECK (entered_count >= 0),

    source          row_source NOT NULL,
    last_ledger     integer NOT NULL CHECK (last_ledger >= 0),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (event_id, category_id)
);

CREATE TABLE records (
    token_id            integer PRIMARY KEY CHECK (token_id >= 0),
    event_id            integer NOT NULL CHECK (event_id >= 0),
    category_id         integer NOT NULL CHECK (category_id >= 0),
    bib_no              integer NOT NULL CHECK (bib_no >= 0),

    -- The record's owner. Non-transferable, so this never changes after mint —
    -- but it is written from chain state on every rebuild anyway, because a
    -- column that "can never change" is exactly the one nobody checks.
    runner_address      text NOT NULL CHECK (runner_address ~ '^G[A-Z2-7]{55}$'),

    -- The on-chain commitment. Public: it identifies nobody without the salt
    -- and the plaintext, both of which live in `participants` and never here.
    participant_hash    bytea NOT NULL,

    state               text NOT NULL
                        CHECK (state IN ('Entered', 'RacepackClaimed', 'Finished', 'Dnf')),
    entered_at          bigint NOT NULL CHECK (entered_at >= 0),
    claimed_at          bigint CHECK (claimed_at >= 0),
    finish_time_s       integer CHECK (finish_time_s > 0),
    result_at           bigint CHECK (result_at >= 0),

    source              row_source NOT NULL,
    last_ledger         integer NOT NULL CHECK (last_ledger >= 0),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    -- The contract's own guard, mirrored: `record_finish` rejects a record that
    -- never claimed a pack, so a Finished row without claimed_at means the
    -- indexer invented a state the chain cannot produce.
    CONSTRAINT finished_records_were_claimed CHECK (
        state <> 'Finished' OR (claimed_at IS NOT NULL AND finish_time_s IS NOT NULL)
    )
);

-- The two lookups every fast-path endpoint does.
CREATE INDEX records_event_idx ON records (event_id, bib_no);
CREATE INDEX records_runner_idx ON records (runner_address);

-- One row per lifecycle state a record has reached.
--
-- UNIQUE (token_id, to_state) is the lifecycle itself written down: the legal
-- transitions form a DAG with no repeats (Entered -> RacepackClaimed ->
-- Finished | Dnf, plus Entered -> Dnf), so a state is entered at most once.
-- That also makes replaying the same event twice a no-op.
CREATE TABLE record_transitions (
    id              bigserial PRIMARY KEY,
    token_id        integer NOT NULL REFERENCES records (token_id) ON DELETE CASCADE,
    from_state      text CHECK (from_state IN ('Entered', 'RacepackClaimed', 'Finished', 'Dnf')),
    to_state        text NOT NULL
                    CHECK (to_state IN ('Entered', 'RacepackClaimed', 'Finished', 'Dnf')),

    -- Unix seconds from the contract's own clock (`entered_at`, `claimed_at`,
    -- `result_at`), not from the indexer's.
    occurred_at     bigint NOT NULL CHECK (occurred_at >= 0),

    -- Provenance, and NULL is meaningful: a rebuild reconstructs the transition
    -- list from the timestamps in RecordData, which are true but say nothing
    -- about which ledger or transaction wrote them.
    ledger          integer CHECK (ledger >= 0),
    tx_hash         text CHECK (tx_hash ~ '^[0-9a-f]{64}$'),
    source          row_source NOT NULL,

    recorded_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT event_sourced_transitions_carry_provenance CHECK (
        source <> 'event' OR (ledger IS NOT NULL AND tx_hash IS NOT NULL)
    ),
    CONSTRAINT one_row_per_state_reached UNIQUE (token_id, to_state)
);

CREATE INDEX record_transitions_token_idx ON record_transitions (token_id, occurred_at);

-- The on-chain scanner allowlist, mirrored.
--
-- Mirrored for display only: `claim_racepack` is gated by the contract, and the
-- roster endpoint re-checks `is_scanner` against the chain on every request. A
-- stale row here can never authorise anything.
CREATE TABLE event_scanners (
    event_id        integer NOT NULL REFERENCES events (event_id) ON DELETE CASCADE,
    scanner_address text NOT NULL CHECK (scanner_address ~ '^G[A-Z2-7]{55}$'),
    added_ledger    integer NOT NULL CHECK (added_ledger >= 0),
    removed_ledger  integer CHECK (removed_ledger >= 0),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (event_id, scanner_address)
);

-- ---------------------------------------------------------------------------
-- TTL keeper
-- ---------------------------------------------------------------------------

-- One row per keeper run, so "did rent get paid?" is a query and not a scroll
-- through container logs. SYSTEM_DESIGN.md §3.4 point 4 asks for exactly this.
CREATE TABLE ttl_keeper_runs (
    id                  bigserial PRIMARY KEY,
    started_at          timestamptz NOT NULL DEFAULT now(),
    finished_at         timestamptz,

    -- The network's latest ledger when the scan read TTLs. Every liveUntil
    -- number below is only meaningful relative to this.
    at_ledger           integer CHECK (at_ledger >= 0),
    threshold_ledgers   integer NOT NULL CHECK (threshold_ledgers > 0),
    extend_to_ledgers   integer NOT NULL CHECK (extend_to_ledgers > 0),

    scanned_keys        integer NOT NULL DEFAULT 0 CHECK (scanned_keys >= 0),
    below_threshold     integer NOT NULL DEFAULT 0 CHECK (below_threshold >= 0),
    extended_keys       integer NOT NULL DEFAULT 0 CHECK (extended_keys >= 0),

    -- Entries RPC no longer serves: archived, or never written. Non-zero here
    -- means the restore runbook in be/OPERATIONS.md, not a retry.
    missing_keys        integer NOT NULL DEFAULT 0 CHECK (missing_keys >= 0),

    -- [{ "hash": "...", "keys": 12, "status": "SUCCESS" }, …]
    transactions        jsonb NOT NULL DEFAULT '[]'::jsonb,

    status              text NOT NULL
                        CHECK (status IN ('running', 'ok', 'failed', 'dry-run')),
    error               text
);

CREATE INDEX ttl_keeper_runs_started_idx ON ttl_keeper_runs (started_at DESC);
