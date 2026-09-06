/**
 * STE-16 (C8) — every statement the indexer runs, in one place.
 *
 * Two properties are worth stating up front because the rest of the indexer
 * relies on them and neither is obvious from a single method:
 *
 *   **Everything here is idempotent.** The poller applies a page of events and
 *   only then saves the cursor, so a crash between the two replays that page on
 *   the next run. Every write below is therefore an upsert or an
 *   `ON CONFLICT DO NOTHING`, and re-applying a page a second time produces the
 *   same rows it produced the first time.
 *
 *   **A rebuild never beats an event.** Rows carry `source`: `'event'` (the
 *   poller watched it happen, with a ledger and a transaction hash) or
 *   `'state'` (a rebuild read it out of contract storage, which is just as true
 *   but carries no provenance). Where the two collide, the event-sourced row's
 *   provenance is kept.
 *
 * No method here calls the network. That is what lets the DB-backed tests drive
 * the whole thing from fixtures.
 */
import type { QueryResult, QueryResultRow } from "pg";
import type { ChainCategory, ChainEvent, ChainRecord, RecordState } from "../chain/decode.js";
import type { ChainEventEnvelope } from "../chain/events.js";

/** A pool or a client from it — writes that must be atomic take a client. */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

/** The single logical stream: both contracts, one getEvents filter. */
export const CONTRACT_STREAM = "contracts";

export type RowSource = "event" | "state";

export interface CursorState {
  stream: string;
  cursor: string | null;
  lastLedger: number;
  oldestLedger: number | null;
  updatedAt: Date;
}

export interface Provenance {
  source: RowSource;
  ledger: number;
  txHash?: string;
}

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

export async function getCursor(db: Queryable, stream = CONTRACT_STREAM): Promise<CursorState | null> {
  const { rows } = await db.query<{
    stream: string;
    cursor: string | null;
    last_ledger: number;
    oldest_ledger: number | null;
    updated_at: Date;
  }>("SELECT stream, cursor, last_ledger, oldest_ledger, updated_at FROM indexer_cursor WHERE stream = $1", [
    stream,
  ]);
  const r = rows[0];
  return r
    ? {
        stream: r.stream,
        cursor: r.cursor,
        lastLedger: r.last_ledger,
        oldestLedger: r.oldest_ledger,
        updatedAt: r.updated_at,
      }
    : null;
}

/**
 * Move the cursor forward.
 *
 * `last_ledger` only ever grows: a page that arrives out of order, or a rebuild
 * that ran while the poller was stopped, must not make the index look younger
 * than it is. `GREATEST` in SQL rather than a read-modify-write in TypeScript,
 * so two processes cannot interleave into a regression.
 */
export async function saveCursor(
  db: Queryable,
  update: { cursor: string | null; lastLedger: number; oldestLedger: number | null },
  stream = CONTRACT_STREAM,
): Promise<void> {
  await db.query(
    `INSERT INTO indexer_cursor (stream, cursor, last_ledger, oldest_ledger, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (stream) DO UPDATE
       SET cursor = EXCLUDED.cursor,
           last_ledger = GREATEST(indexer_cursor.last_ledger, EXCLUDED.last_ledger),
           oldest_ledger = EXCLUDED.oldest_ledger,
           updated_at = now()`,
    [stream, update.cursor, update.lastLedger, update.oldestLedger],
  );
}

// ---------------------------------------------------------------------------
// Raw ingestion log
// ---------------------------------------------------------------------------

/**
 * Record one decoded event. Returns `false` when it was already there.
 *
 * The RPC event id is the primary key, which is what makes replay free: the
 * second insert of a page conflicts and the caller knows to skip the work.
 *
 * bigints are stringified into the payload deliberately — a price in stroops
 * does not survive `JSON.stringify` as a number.
 */
export async function insertChainEvent(db: Queryable, e: ChainEventEnvelope): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO chain_events (id, contract_id, name, ledger, ledger_closed_at, tx_hash, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [
      e.id,
      e.contractId,
      e.event.name,
      e.ledger,
      e.ledgerClosedAt.toISOString(),
      e.txHash,
      JSON.stringify(e.event, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    ],
  );
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Materialised rows
// ---------------------------------------------------------------------------

export async function upsertEvent(db: Queryable, ev: ChainEvent, at: Provenance): Promise<void> {
  await db.query(
    `INSERT INTO events (event_id, organiser, name, metadata_hash, uri, starts_at, status,
                         source, last_ledger, updated_at)
     VALUES ($1, $2, $3, decode($4, 'hex'), $5, $6, $7, $8, $9, now())
     ON CONFLICT (event_id) DO UPDATE
       SET organiser = EXCLUDED.organiser,
           name = EXCLUDED.name,
           metadata_hash = EXCLUDED.metadata_hash,
           uri = EXCLUDED.uri,
           starts_at = EXCLUDED.starts_at,
           status = EXCLUDED.status,
           source = EXCLUDED.source,
           last_ledger = GREATEST(events.last_ledger, EXCLUDED.last_ledger),
           updated_at = now()`,
    [
      ev.eventId,
      ev.organiser,
      ev.name,
      ev.metadataHash,
      ev.uri,
      ev.startsAt.toString(),
      ev.status,
      at.source,
      at.ledger,
    ],
  );
}

/**
 * Status-only update, for `event_status_changed`.
 *
 * Separate from {@link upsertEvent} because the event carries the status and
 * nothing else: rewriting name and uri from a stale hydration would be a
 * regression dressed as an update. No-op when the event is not indexed yet —
 * the poller hydrates on `event_created`, and a status change for an event we
 * have never seen means the index starts after that event's creation, which a
 * rebuild fixes and an invented row does not.
 */
export async function setEventStatus(
  db: Queryable,
  eventId: number,
  status: ChainEvent["status"],
  at: Provenance,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE events
        SET status = $2, source = $3, last_ledger = GREATEST(last_ledger, $4), updated_at = now()
      WHERE event_id = $1`,
    [eventId, status, at.source, at.ledger],
  );
  return (rowCount ?? 0) > 0;
}

export async function upsertCategory(
  db: Queryable,
  cat: ChainCategory,
  at: Provenance,
): Promise<void> {
  await db.query(
    `INSERT INTO categories (event_id, category_id, code, distance_m, quota, price_stroops,
                             entered_count, source, last_ledger, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (event_id, category_id) DO UPDATE
       SET code = EXCLUDED.code,
           distance_m = EXCLUDED.distance_m,
           quota = EXCLUDED.quota,
           price_stroops = EXCLUDED.price_stroops,
           -- Never goes backwards: a hydration that raced a fresh slot_reserved
           -- would otherwise hand a bib number out twice.
           entered_count = GREATEST(categories.entered_count, EXCLUDED.entered_count),
           source = EXCLUDED.source,
           last_ledger = GREATEST(categories.last_ledger, EXCLUDED.last_ledger),
           updated_at = now()`,
    [
      cat.eventId,
      cat.categoryId,
      cat.code,
      cat.distanceM,
      cat.quota,
      cat.priceStroops.toString(),
      cat.enteredCount,
      at.source,
      at.ledger,
    ],
  );
}

/**
 * Apply a `slot_reserved`: the seq it handed out is the count *before* the
 * increment, so the category has now entered `seq + 1` runners.
 *
 * `GREATEST` again — replaying an old page must not lower a counter.
 */
export async function applySlotReserved(
  db: Queryable,
  eventId: number,
  categoryId: number,
  seq: number,
  at: Provenance,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE categories
        SET entered_count = GREATEST(entered_count, $3),
            last_ledger = GREATEST(last_ledger, $4),
            updated_at = now()
      WHERE event_id = $1 AND category_id = $2`,
    [eventId, categoryId, seq + 1, at.ledger],
  );
  return (rowCount ?? 0) > 0;
}

export interface RecordUpsert extends ChainRecord {
  runnerAddress: string;
}

export async function upsertRecord(
  db: Queryable,
  rec: RecordUpsert,
  at: Provenance,
): Promise<void> {
  await db.query(
    `INSERT INTO records (token_id, event_id, category_id, bib_no, runner_address,
                          participant_hash, state, entered_at, claimed_at, finish_time_s,
                          result_at, source, last_ledger, updated_at)
     VALUES ($1, $2, $3, $4, $5, decode($6, 'hex'), $7, $8, $9, $10, $11, $12, $13, now())
     ON CONFLICT (token_id) DO UPDATE
       SET event_id = EXCLUDED.event_id,
           category_id = EXCLUDED.category_id,
           bib_no = EXCLUDED.bib_no,
           runner_address = EXCLUDED.runner_address,
           participant_hash = EXCLUDED.participant_hash,
           state = EXCLUDED.state,
           entered_at = EXCLUDED.entered_at,
           claimed_at = EXCLUDED.claimed_at,
           finish_time_s = EXCLUDED.finish_time_s,
           result_at = EXCLUDED.result_at,
           source = EXCLUDED.source,
           last_ledger = GREATEST(records.last_ledger, EXCLUDED.last_ledger),
           updated_at = now()`,
    [
      rec.tokenId,
      rec.eventId,
      rec.categoryId,
      rec.bibNo,
      rec.runnerAddress,
      rec.participantHash,
      rec.state,
      rec.enteredAt.toString(),
      rec.claimedAt?.toString() ?? null,
      rec.finishTimeS,
      rec.resultAt?.toString() ?? null,
      at.source,
      at.ledger,
    ],
  );
}

/**
 * Advance one record's lifecycle from an event.
 *
 * Only the columns a transition actually writes are touched, so a
 * `record_finished` cannot silently clear `claimed_at`. `COALESCE` keeps
 * whatever is already there when the new value is absent, which is what makes
 * an out-of-order replay converge instead of oscillating.
 */
export async function applyRecordTransition(
  db: Queryable,
  tokenId: number,
  next: {
    state: RecordState;
    claimedAt?: bigint | null;
    finishTimeS?: number | null;
    resultAt?: bigint | null;
  },
  at: Provenance,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE records
        SET state = $2,
            claimed_at = COALESCE($3, claimed_at),
            finish_time_s = COALESCE($4, finish_time_s),
            result_at = COALESCE($5, result_at),
            source = $6,
            last_ledger = GREATEST(last_ledger, $7),
            updated_at = now()
      WHERE token_id = $1`,
    [
      tokenId,
      next.state,
      next.claimedAt?.toString() ?? null,
      next.finishTimeS ?? null,
      next.resultAt?.toString() ?? null,
      at.source,
      at.ledger,
    ],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Note that a record reached a state.
 *
 * `UNIQUE (token_id, to_state)` does the deduplication, and the conflict rule
 * encodes "a rebuild never beats an event": an event-sourced row overwrites
 * whatever is there, a state-sourced one only fills a gap.
 */
export async function insertTransition(
  db: Queryable,
  t: {
    tokenId: number;
    fromState: RecordState | null;
    toState: RecordState;
    occurredAt: bigint;
    ledger: number | null;
    txHash: string | null;
    source: RowSource;
  },
): Promise<void> {
  const conflict =
    t.source === "event"
      ? `DO UPDATE SET from_state = EXCLUDED.from_state,
                       occurred_at = EXCLUDED.occurred_at,
                       ledger = EXCLUDED.ledger,
                       tx_hash = EXCLUDED.tx_hash,
                       source = EXCLUDED.source,
                       recorded_at = now()`
      : "DO NOTHING";
  await db.query(
    `INSERT INTO record_transitions
       (token_id, from_state, to_state, occurred_at, ledger, tx_hash, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (token_id, to_state) ${conflict}`,
    [t.tokenId, t.fromState, t.toState, t.occurredAt.toString(), t.ledger, t.txHash, t.source],
  );
}

export async function addScanner(
  db: Queryable,
  eventId: number,
  scanner: string,
  ledger: number,
): Promise<void> {
  await db.query(
    `INSERT INTO event_scanners (event_id, scanner_address, added_ledger, removed_ledger, updated_at)
     VALUES ($1, $2, $3, NULL, now())
     ON CONFLICT (event_id, scanner_address) DO UPDATE
       SET added_ledger = EXCLUDED.added_ledger, removed_ledger = NULL, updated_at = now()`,
    [eventId, scanner, ledger],
  );
}

export async function removeScanner(
  db: Queryable,
  eventId: number,
  scanner: string,
  ledger: number,
): Promise<void> {
  await db.query(
    `UPDATE event_scanners
        SET removed_ledger = $3, updated_at = now()
      WHERE event_id = $1 AND scanner_address = $2`,
    [eventId, scanner, ledger],
  );
}

/**
 * Empty every materialised table, keeping the raw ingestion log.
 *
 * This is the first half of `pnpm indexer rebuild`. The raw log survives on
 * purpose: it is the only local evidence of what the chain said at the time,
 * and testnet RPC will not hand it back once the retention window has passed
 * (SYSTEM_DESIGN.md §11 point 10).
 *
 * `records` is truncated with CASCADE, which takes `record_transitions` with
 * it; `events` takes `categories` and `event_scanners`.
 */
export async function clearMaterialisedTables(db: Queryable): Promise<void> {
  await db.query("TRUNCATE records, events RESTART IDENTITY CASCADE");
}

/** Row counts, for the rebuild report and `indexer doctor`. */
export async function counts(db: Queryable): Promise<Record<string, number>> {
  const { rows } = await db.query<{ table_name: string; n: string }>(
    `SELECT 'events' AS table_name, count(*)::text AS n FROM events
     UNION ALL SELECT 'categories', count(*)::text FROM categories
     UNION ALL SELECT 'records', count(*)::text FROM records
     UNION ALL SELECT 'record_transitions', count(*)::text FROM record_transitions
     UNION ALL SELECT 'event_scanners', count(*)::text FROM event_scanners
     UNION ALL SELECT 'chain_events', count(*)::text FROM chain_events`,
  );
  return Object.fromEntries(rows.map((r) => [r.table_name, Number(r.n)]));
}

// ---------------------------------------------------------------------------
// Reads — the fast path the web app uses instead of N round trips to RPC
// ---------------------------------------------------------------------------

export interface EventRow {
  eventId: number;
  organiser: string;
  name: string;
  metadataHash: string;
  uri: string;
  startsAt: bigint;
  status: string;
  source: RowSource;
  lastLedger: number;
}

export interface CategoryRow {
  eventId: number;
  categoryId: number;
  code: string;
  distanceM: number;
  quota: number;
  priceStroops: bigint;
  enteredCount: number;
}

export interface RecordRow {
  tokenId: number;
  eventId: number;
  categoryId: number;
  bibNo: number;
  runnerAddress: string;
  participantHash: string;
  state: RecordState;
  enteredAt: bigint;
  claimedAt: bigint | null;
  finishTimeS: number | null;
  resultAt: bigint | null;
  source: RowSource;
  lastLedger: number;
}

interface RawEventRow {
  event_id: number;
  organiser: string;
  name: string;
  metadata_hash: Buffer;
  uri: string;
  starts_at: string;
  status: string;
  source: RowSource;
  last_ledger: number;
}

interface RawRecordRow {
  token_id: number;
  event_id: number;
  category_id: number;
  bib_no: number;
  runner_address: string;
  participant_hash: Buffer;
  state: RecordState;
  entered_at: string;
  claimed_at: string | null;
  finish_time_s: number | null;
  result_at: string | null;
  source: RowSource;
  last_ledger: number;
}

const EVENT_COLUMNS =
  "event_id, organiser, name, metadata_hash, uri, starts_at, status, source, last_ledger";
const RECORD_COLUMNS =
  "token_id, event_id, category_id, bib_no, runner_address, participant_hash, state, " +
  "entered_at, claimed_at, finish_time_s, result_at, source, last_ledger";

/**
 * `bigint` columns come back from `pg` as strings, which is correct and easy to
 * forget: a u64 unix timestamp is inside Number's safe range today, but the
 * driver does not know that and neither should this code.
 */
const toEventRow = (r: RawEventRow): EventRow => ({
  eventId: r.event_id,
  organiser: r.organiser,
  name: r.name,
  metadataHash: r.metadata_hash.toString("hex"),
  uri: r.uri,
  startsAt: BigInt(r.starts_at),
  status: r.status,
  source: r.source,
  lastLedger: r.last_ledger,
});

const toRecordRow = (r: RawRecordRow): RecordRow => ({
  tokenId: r.token_id,
  eventId: r.event_id,
  categoryId: r.category_id,
  bibNo: r.bib_no,
  runnerAddress: r.runner_address,
  participantHash: r.participant_hash.toString("hex"),
  state: r.state,
  enteredAt: BigInt(r.entered_at),
  claimedAt: r.claimed_at === null ? null : BigInt(r.claimed_at),
  finishTimeS: r.finish_time_s,
  resultAt: r.result_at === null ? null : BigInt(r.result_at),
  source: r.source,
  lastLedger: r.last_ledger,
});

export async function listEvents(
  db: Queryable,
  opts: { status?: string; limit: number; offset: number },
): Promise<EventRow[]> {
  const { rows } = await db.query<RawEventRow>(
    `SELECT ${EVENT_COLUMNS} FROM events
      WHERE ($1::text IS NULL OR status = $1)
      ORDER BY starts_at DESC, event_id DESC
      LIMIT $2 OFFSET $3`,
    [opts.status ?? null, opts.limit, opts.offset],
  );
  return rows.map(toEventRow);
}

export async function getEvent(db: Queryable, eventId: number): Promise<EventRow | null> {
  const { rows } = await db.query<RawEventRow>(
    `SELECT ${EVENT_COLUMNS} FROM events WHERE event_id = $1`,
    [eventId],
  );
  const r = rows[0];
  return r ? toEventRow(r) : null;
}

export async function listCategories(db: Queryable, eventId: number): Promise<CategoryRow[]> {
  const { rows } = await db.query<{
    event_id: number;
    category_id: number;
    code: string;
    distance_m: number;
    quota: number;
    price_stroops: string;
    entered_count: number;
  }>(
    `SELECT event_id, category_id, code, distance_m, quota, price_stroops, entered_count
       FROM categories WHERE event_id = $1 ORDER BY category_id`,
    [eventId],
  );
  return rows.map((r) => ({
    eventId: r.event_id,
    categoryId: r.category_id,
    code: r.code,
    distanceM: r.distance_m,
    quota: r.quota,
    priceStroops: BigInt(r.price_stroops),
    enteredCount: r.entered_count,
  }));
}

export async function getRecord(db: Queryable, tokenId: number): Promise<RecordRow | null> {
  const { rows } = await db.query<RawRecordRow>(
    `SELECT ${RECORD_COLUMNS} FROM records WHERE token_id = $1`,
    [tokenId],
  );
  const r = rows[0];
  return r ? toRecordRow(r) : null;
}

export async function listRecordsByRunner(db: Queryable, runner: string): Promise<RecordRow[]> {
  const { rows } = await db.query<RawRecordRow>(
    `SELECT ${RECORD_COLUMNS} FROM records WHERE runner_address = $1 ORDER BY token_id`,
    [runner],
  );
  return rows.map(toRecordRow);
}

export async function listRecordsByEvent(
  db: Queryable,
  eventId: number,
  opts: { limit: number; offset: number },
): Promise<RecordRow[]> {
  const { rows } = await db.query<RawRecordRow>(
    `SELECT ${RECORD_COLUMNS} FROM records WHERE event_id = $1
      ORDER BY bib_no, token_id LIMIT $2 OFFSET $3`,
    [eventId, opts.limit, opts.offset],
  );
  return rows.map(toRecordRow);
}

export interface TransitionRow {
  tokenId: number;
  fromState: RecordState | null;
  toState: RecordState;
  occurredAt: bigint;
  ledger: number | null;
  txHash: string | null;
  source: RowSource;
}

export async function listTransitions(db: Queryable, tokenId: number): Promise<TransitionRow[]> {
  const { rows } = await db.query<{
    token_id: number;
    from_state: RecordState | null;
    to_state: RecordState;
    occurred_at: string;
    ledger: number | null;
    tx_hash: string | null;
    source: RowSource;
  }>(
    `SELECT token_id, from_state, to_state, occurred_at, ledger, tx_hash, source
       FROM record_transitions WHERE token_id = $1 ORDER BY occurred_at, id`,
    [tokenId],
  );
  return rows.map((r) => ({
    tokenId: r.token_id,
    fromState: r.from_state,
    toState: r.to_state,
    occurredAt: BigInt(r.occurred_at),
    ledger: r.ledger,
    txHash: r.tx_hash,
    source: r.source,
  }));
}

/** Every token id the index holds, ascending — the TTL keeper's work list. */
export async function allTokenIds(db: Queryable): Promise<number[]> {
  const { rows } = await db.query<{ token_id: number }>(
    "SELECT token_id FROM records ORDER BY token_id",
  );
  return rows.map((r) => r.token_id);
}

/**
 * Every distinct owner. The keeper needs these separately from the token ids
 * because `records_of` reads the per-owner enumeration entries, which no
 * single-record read touches.
 */
export async function distinctRunners(db: Queryable): Promise<string[]> {
  const { rows } = await db.query<{ runner_address: string }>(
    "SELECT DISTINCT runner_address FROM records ORDER BY runner_address",
  );
  return rows.map((r) => r.runner_address);
}
