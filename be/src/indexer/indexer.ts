/**
 * STE-16 (C8) — the indexer.
 *
 * ## The one rule
 *
 * **The chain is the source of truth and this is a cache.** Nothing in Postgres
 * is allowed to be the only copy of anything, which is what makes
 * {@link Indexer.rebuild} possible: drop every materialised table, walk contract
 * *state*, and the index is whole again. That path exists because testnet RPC
 * keeps a limited `getEvents` window (SYSTEM_DESIGN.md §11 point 10) — replaying
 * events is not always an option, and a design that needed it would be one bad
 * week away from an index that can never be repaired.
 *
 * ## Two ways in, and they are not the same
 *
 *   {@link Indexer.pollOnce} follows `getEvents`. It knows *when* things
 *   happened — ledger, transaction hash, the order of a lifecycle — and writes
 *   rows with `source = 'event'`.
 *
 *   {@link Indexer.rebuild} reads contract state. It knows *what is true now*,
 *   which is everything except provenance, and writes `source = 'state'`. The
 *   transition history it reconstructs comes from the timestamps inside
 *   `RecordData` (`entered_at`, `claimed_at`, `result_at`), which are real
 *   contract clock values, so the history is honest — it just cannot say which
 *   transaction produced each step.
 *
 * ## Why an event is never trusted on its own
 *
 * `EventCreated` carries only `event_id` and `organiser`; `CategoryAdded`
 * carries no distance; `RecordEntered` carries no category. The missing fields
 * are read back from the contract ("hydration") before anything is written, and
 * the fields the event *does* carry are cross-checked against what came back.
 * A mismatch throws rather than picking a winner: the two disagreeing is either
 * spec drift or an event we should never have accepted, and both are worse than
 * an indexer that stops.
 *
 * Hydration happens **before** the transaction opens. A page's worth of RPC
 * round trips inside `BEGIN` would hold row locks across the network.
 */
import type { Pool, PoolClient } from "pg";
import type { ChainCategory, ChainEvent, ChainRecord, RecordState } from "../chain/decode.js";
import { decodeChainEvent, type ChainEventEnvelope, type KnownContracts } from "../chain/events.js";
import type { ChainReader } from "../chain/reader.js";
import type { EventSource } from "./source.js";
import * as store from "./store.js";

/**
 * RPC caps `getEvents` well above this; the limit that matters is how much work
 * one transaction should hold, and how much is lost when a page fails and is
 * retried from the start.
 */
export const DEFAULT_PAGE_LIMIT = 200;

export interface IndexerOptions {
  pageLimit?: number;
  /**
   * Where to start when there is no cursor at all. Defaults to the RPC's oldest
   * retained ledger — everything it can still tell us. Clamped to that floor in
   * any case, because asking for an older ledger is an error, not an empty page.
   */
  startLedger?: number;
  /** Somewhere to report skips and oddities. Silent by default. */
  log?: (level: "info" | "warn", message: string, detail?: Record<string, unknown>) => void;
}

export interface PollResult {
  /** Events RPC returned, including ones that are not ours. */
  fetched: number;
  /** Sterun events decoded and applied for the first time. */
  applied: number;
  /** Already-ingested events (a replayed page) — recognised and skipped. */
  duplicates: number;
  /** Events from other contracts, unknown names, or failed invocations. */
  ignored: number;
  /**
   * Lifecycle events for a record this index has never seen. Counted rather
   * than fatal: an index that started mid-race has a legitimate gap, and
   * `rebuild` is the fix.
   */
  orphans: number;
  cursor: string;
  lastLedger: number;
  latestLedger: number;
  oldestLedger: number;
}

export interface RebuildResult {
  events: number;
  categories: number;
  records: number;
  transitions: number;
  /** The ledger the walk started from — where following resumes. */
  fromLedger: number;
  durationMs: number;
}

export interface DoctorFinding {
  kind:
    | "event-count-mismatch"
    | "record-count-mismatch"
    | "event-missing"
    | "event-differs"
    | "record-missing"
    | "record-differs";
  detail: string;
}

export interface DoctorReport {
  ok: boolean;
  chain: { events: number; records: number };
  index: { events: number; records: number };
  findings: DoctorFinding[];
}

/** Everything a page needs from the contracts, fetched before the write. */
interface Hydration {
  events: Map<number, ChainEvent>;
  categories: Map<string, ChainCategory>;
  records: Map<number, ChainRecord>;
}

const categoryKey = (eventId: number, categoryId: number): string => `${eventId}:${categoryId}`;

/** Ledger close time in unix seconds — the same clock `env.ledger().timestamp()` reads. */
const closedAtSeconds = (e: ChainEventEnvelope): bigint =>
  BigInt(Math.floor(e.ledgerClosedAt.getTime() / 1000));

export class IndexerConsistencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndexerConsistencyError";
  }
}

export class Indexer {
  private readonly pageLimit: number;
  private readonly log: NonNullable<IndexerOptions["log"]>;

  constructor(
    private readonly pool: Pool,
    private readonly reader: ChainReader,
    private readonly source: EventSource,
    private readonly contracts: KnownContracts,
    private readonly options: IndexerOptions = {},
  ) {
    this.pageLimit = options.pageLimit ?? DEFAULT_PAGE_LIMIT;
    this.log = options.log ?? (() => {});
  }

  // -- follow ---------------------------------------------------------------

  /**
   * Fetch one page and apply it.
   *
   * The cursor is saved **after** the page has been applied and committed, so a
   * crash anywhere in between replays the page rather than skipping it. Replay
   * is free: `chain_events` has the RPC event id as its primary key, so the
   * second pass recognises every row and does no work.
   */
  async pollOnce(): Promise<PollResult> {
    const health = await this.source.health();
    const saved = await store.getCursor(this.pool);
    const page = await this.source.getEvents(this.requestFor(saved, health.oldestLedger));

    const envelopes: ChainEventEnvelope[] = [];
    let ignored = 0;
    for (const raw of page.events) {
      const decoded = decodeChainEvent(raw, this.contracts);
      if (decoded === null) {
        ignored += 1;
        continue;
      }
      envelopes.push(decoded);
    }

    const hydration = await this.hydrate(envelopes);

    const client = await this.pool.connect();
    let applied = 0;
    let duplicates = 0;
    let orphans = 0;
    try {
      await client.query("BEGIN");
      for (const envelope of envelopes) {
        if (!(await store.insertChainEvent(client, envelope))) {
          duplicates += 1;
          continue;
        }
        orphans += await this.apply(client, envelope, hydration);
        applied += 1;
      }
      // An empty page is not "no information": RPC serves events up to its
      // latest ledger, so nothing coming back means nothing happened through
      // that ledger, and the index really is caught up to it.
      const lastLedger = Math.max(
        saved?.lastLedger ?? 0,
        ...page.events.map((e) => e.ledger),
        page.events.length === 0 ? page.latestLedger : 0,
      );
      await store.saveCursor(client, {
        cursor: page.cursor,
        lastLedger,
        oldestLedger: page.oldestLedger,
      });
      await client.query("COMMIT");

      return {
        fetched: page.events.length,
        applied,
        duplicates,
        ignored,
        orphans,
        cursor: page.cursor,
        lastLedger,
        latestLedger: page.latestLedger,
        oldestLedger: page.oldestLedger,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  private requestFor(
    saved: store.CursorState | null,
    oldestLedger: number,
  ): { cursor: string; limit: number } | { startLedger: number; limit: number } {
    if (saved?.cursor) return { cursor: saved.cursor, limit: this.pageLimit };
    // No cursor: either the first ever poll, or the first poll after a rebuild
    // (which sets last_ledger and clears the cursor). Both mean "start from
    // this ledger" — clamped to what RPC still retains, because asking for
    // anything older is an error rather than an empty page.
    const wanted = saved?.lastLedger
      ? saved.lastLedger + 1
      : (this.options.startLedger ?? oldestLedger);
    return { startLedger: Math.max(wanted, oldestLedger), limit: this.pageLimit };
  }

  /**
   * Read back everything the events do not carry.
   *
   * Deduplicated by id, so a page with fifty entries into one event asks the
   * contract for that event once.
   */
  private async hydrate(envelopes: ChainEventEnvelope[]): Promise<Hydration> {
    const wantEvents = new Set<number>();
    const wantCategories = new Map<string, [number, number]>();
    const wantRecords = new Set<number>();

    for (const { event } of envelopes) {
      if (event.name === "event_created") wantEvents.add(event.eventId);
      if (event.name === "category_added") {
        wantCategories.set(categoryKey(event.eventId, event.categoryId), [
          event.eventId,
          event.categoryId,
        ]);
      }
      if (event.name === "record_entered") wantRecords.add(event.tokenId);
    }

    const events = new Map<number, ChainEvent>();
    for (const id of wantEvents) events.set(id, await this.reader.getEvent(id));

    const categories = new Map<string, ChainCategory>();
    for (const [key, [eventId, categoryId]] of wantCategories) {
      categories.set(key, await this.reader.getCategory(eventId, categoryId));
    }

    const records = new Map<number, ChainRecord>();
    for (const id of wantRecords) records.set(id, await this.reader.recordOf(id));

    return { events, categories, records };
  }

  /** Apply one event. Returns 1 when it was an orphan (nothing to update). */
  private async apply(
    db: PoolClient,
    envelope: ChainEventEnvelope,
    hydration: Hydration,
  ): Promise<number> {
    const { event } = envelope;
    const at = { source: "event" as const, ledger: envelope.ledger, txHash: envelope.txHash };
    const occurredAt = closedAtSeconds(envelope);

    switch (event.name) {
      case "event_created": {
        const hydrated = this.require(
          hydration.events.get(event.eventId),
          `get_event(${event.eventId}) for ${envelope.id}`,
        );
        if (hydrated.organiser !== event.organiser) {
          throw new IndexerConsistencyError(
            `event ${event.eventId}: the event names organiser ${event.organiser} but ` +
              `get_event returned ${hydrated.organiser}`,
          );
        }
        // `create_event` always writes Draft (event_registry/src/lib.rs), so the
        // status is known from the event's meaning. Taking it from hydration
        // instead would write today's status onto a row whose later
        // event_status_changed is still ahead of us in the stream.
        await store.upsertEvent(db, { ...hydrated, status: "Draft" }, at);
        return 0;
      }

      case "category_added": {
        // `categories` has a foreign key to `events`, and an index that started
        // after this event was created legitimately has no row to hang it on.
        // Without this check that page would fail its FK forever and the poller
        // would never move again — a gap turned into an outage.
        if (!(await this.eventIsIndexed(db, event.eventId, envelope))) return 1;
        const hydrated = this.require(
          hydration.categories.get(categoryKey(event.eventId, event.categoryId)),
          `get_category(${event.eventId}, ${event.categoryId}) for ${envelope.id}`,
        );
        if (hydrated.quota !== event.quota || hydrated.priceStroops !== event.priceStroops) {
          throw new IndexerConsistencyError(
            `category ${event.eventId}/${event.categoryId}: event says quota=${event.quota} ` +
              `price=${event.priceStroops}, get_category says quota=${hydrated.quota} ` +
              `price=${hydrated.priceStroops}`,
          );
        }
        // Same reasoning as Draft above: `add_category` always starts at zero,
        // and the slot_reserved events that raise it are still ahead of us.
        await store.upsertCategory(db, { ...hydrated, enteredCount: 0 }, at);
        return 0;
      }

      case "event_status_changed": {
        const updated = await store.setEventStatus(db, event.eventId, event.status, at);
        if (!updated) {
          this.log("warn", "status change for an event that is not indexed", {
            eventId: event.eventId,
            eventRef: envelope.id,
          });
          return 1;
        }
        return 0;
      }

      case "scanner_added":
        if (!(await this.eventIsIndexed(db, event.eventId, envelope))) return 1;
        await store.addScanner(db, event.eventId, event.scanner, envelope.ledger);
        return 0;

      case "scanner_removed":
        if (!(await this.eventIsIndexed(db, event.eventId, envelope))) return 1;
        await store.removeScanner(db, event.eventId, event.scanner, envelope.ledger);
        return 0;

      case "slot_reserved": {
        const updated = await store.applySlotReserved(
          db,
          event.eventId,
          event.categoryId,
          event.seq,
          at,
        );
        return updated ? 0 : 1;
      }

      // `mint` is redundant with `record_entered` — same token, same owner, one
      // ledger apart at most (INTERFACE.md §2.3 fixes the order). It is kept in
      // chain_events for the audit trail and materialises nothing.
      case "mint":
        return 0;

      case "record_entered": {
        const hydrated = this.require(
          hydration.records.get(event.tokenId),
          `record_of(${event.tokenId}) for ${envelope.id}`,
        );
        if (hydrated.eventId !== event.eventId || hydrated.bibNo !== event.bibNo) {
          throw new IndexerConsistencyError(
            `record ${event.tokenId}: event says event_id=${event.eventId} bib=${event.bibNo}, ` +
              `record_of says event_id=${hydrated.eventId} bib=${hydrated.bibNo}`,
          );
        }
        // The lifecycle columns come from the event's meaning, not from
        // hydration: `record_of` answers with the state the record is in *now*,
        // which may already be Finished while this page is still at the entry.
        await store.upsertRecord(
          db,
          {
            ...hydrated,
            state: "Entered",
            claimedAt: null,
            finishTimeS: null,
            resultAt: null,
            runnerAddress: event.runner,
          },
          at,
        );
        await store.insertTransition(db, {
          tokenId: event.tokenId,
          fromState: null,
          toState: "Entered",
          occurredAt: hydrated.enteredAt,
          ledger: envelope.ledger,
          txHash: envelope.txHash,
          source: "event",
        });
        return 0;
      }

      case "racepack_claimed":
        return this.advance(db, envelope, event.tokenId, "RacepackClaimed", {
          claimedAt: occurredAt,
        });

      case "record_finished":
        return this.advance(db, envelope, event.tokenId, "Finished", {
          finishTimeS: event.finishTimeS,
          resultAt: occurredAt,
        });

      case "record_dnf":
        return this.advance(db, envelope, event.tokenId, "Dnf", { resultAt: occurredAt });
    }
  }

  /**
   * Move a record to its next state and note the transition.
   *
   * The previous state is read first so `from_state` is real rather than
   * inferred from the lifecycle diagram — if the two ever disagree, the row
   * says so instead of hiding it.
   */
  private async advance(
    db: PoolClient,
    envelope: ChainEventEnvelope,
    tokenId: number,
    toState: RecordState,
    fields: { claimedAt?: bigint; finishTimeS?: number; resultAt?: bigint },
  ): Promise<number> {
    const existing = await store.getRecord(db, tokenId);
    if (!existing) {
      this.log("warn", "lifecycle event for a record that is not indexed", {
        tokenId,
        toState,
        eventRef: envelope.id,
      });
      return 1;
    }

    await store.applyRecordTransition(
      db,
      tokenId,
      { state: toState, ...fields },
      { source: "event", ledger: envelope.ledger, txHash: envelope.txHash },
    );
    await store.insertTransition(db, {
      tokenId,
      fromState: existing.state,
      toState,
      occurredAt: fields.claimedAt ?? fields.resultAt ?? closedAtSeconds(envelope),
      ledger: envelope.ledger,
      txHash: envelope.txHash,
      source: "event",
    });
    return 0;
  }

  /**
   * Is this event in the index? Anything that hangs off `events` by a foreign
   * key has to ask before writing, or a legitimate gap becomes a page that can
   * never be applied.
   */
  private async eventIsIndexed(
    db: PoolClient,
    eventId: number,
    envelope: ChainEventEnvelope,
  ): Promise<boolean> {
    if (await store.getEvent(db, eventId)) return true;
    this.log("warn", "event for an event_id that is not indexed", {
      eventId,
      event: envelope.event.name,
      eventRef: envelope.id,
      fix: "pnpm indexer rebuild",
    });
    return false;
  }

  private require<T>(value: T | undefined, what: string): T {
    if (value === undefined) {
      throw new IndexerConsistencyError(`hydration missing: ${what}`);
    }
    return value;
  }

  // -- rebuild --------------------------------------------------------------

  /**
   * Rebuild the whole index from contract state.
   *
   * The procedure the ticket asks for, and the answer to "the RPC event window
   * has passed". Three phases, in this order for a reason:
   *
   *   1. note the ledger we are starting from, **before** reading anything.
   *      Following resumes there, so a change that lands mid-walk is replayed
   *      rather than missed. Replaying is safe; missing is not.
   *   2. read all of it over RPC, into memory. No transaction is open, so a
   *      slow walk blocks nobody.
   *   3. truncate and re-insert in ONE transaction, so readers never see a
   *      half-empty index — they see the old one, then the new one.
   *
   * Token ids are `0 .. total_supply - 1` with no gaps: records are minted with
   * `Enumerable::sequential_mint` from zero, and RaceRecord exports no burn
   * (INTERFACE.md §4), so nothing can remove one.
   */
  async rebuild(): Promise<RebuildResult> {
    const startedAt = Date.now();
    const fromLedger = (await this.source.health()).latestLedger;

    const eventCount = await this.reader.eventCount();
    const events: ChainEvent[] = [];
    const categories: ChainCategory[] = [];
    for (let eventId = 0; eventId < eventCount; eventId += 1) {
      events.push(await this.reader.getEvent(eventId));
      const categoryCount = await this.reader.categoryCount(eventId);
      for (let categoryId = 0; categoryId < categoryCount; categoryId += 1) {
        categories.push(await this.reader.getCategory(eventId, categoryId));
      }
    }

    const totalSupply = await this.reader.totalSupply();
    const records: store.RecordUpsert[] = [];
    for (let tokenId = 0; tokenId < totalSupply; tokenId += 1) {
      const record = await this.reader.recordOf(tokenId);
      const owner = await this.reader.ownerOf(tokenId);
      records.push({ ...record, runnerAddress: owner });
    }

    const client = await this.pool.connect();
    let transitions = 0;
    try {
      await client.query("BEGIN");
      await store.clearMaterialisedTables(client);
      const at = { source: "state" as const, ledger: fromLedger };
      for (const event of events) await store.upsertEvent(client, event, at);
      for (const category of categories) await store.upsertCategory(client, category, at);
      for (const record of records) {
        await store.upsertRecord(client, record, at);
        for (const t of reconstructTransitions(record)) {
          await store.insertTransition(client, { ...t, ledger: null, txHash: null, source: "state" });
          transitions += 1;
        }
      }
      // The cursor is cleared and last_ledger pinned to where the walk started:
      // the next poll asks for `fromLedger + 1` onwards. Anything before that is
      // already in the state we just wrote.
      await store.saveCursor(client, {
        cursor: null,
        lastLedger: fromLedger,
        oldestLedger: null,
      });
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    return {
      events: events.length,
      categories: categories.length,
      records: records.length,
      transitions,
      fromLedger,
      durationMs: Date.now() - startedAt,
    };
  }

  // -- doctor ---------------------------------------------------------------

  /**
   * Compare the index against the chain, field by field, and report.
   *
   * This is what makes "the rebuild worked" a check rather than a feeling, and
   * it is the same comparison after a `drop -> rebuild` as after a week of
   * polling. It reads only; fixing is `rebuild`'s job.
   */
  async doctor(): Promise<DoctorReport> {
    const findings: DoctorFinding[] = [];
    const eventCount = await this.reader.eventCount();
    const totalSupply = await this.reader.totalSupply();

    const indexed = await store.counts(this.pool);
    const indexedEvents = indexed.events ?? 0;
    const indexedRecords = indexed.records ?? 0;

    if (indexedEvents !== eventCount) {
      findings.push({
        kind: "event-count-mismatch",
        detail: `chain has ${eventCount} events, index has ${indexedEvents}`,
      });
    }
    if (indexedRecords !== totalSupply) {
      findings.push({
        kind: "record-count-mismatch",
        detail: `chain has ${totalSupply} records, index has ${indexedRecords}`,
      });
    }

    for (let eventId = 0; eventId < eventCount; eventId += 1) {
      const onChain = await this.reader.getEvent(eventId);
      const row = await store.getEvent(this.pool, eventId);
      if (!row) {
        findings.push({ kind: "event-missing", detail: `event ${eventId} is not indexed` });
        continue;
      }
      const differences = [
        row.organiser !== onChain.organiser ? `organiser ${row.organiser} != ${onChain.organiser}` : "",
        row.status !== onChain.status ? `status ${row.status} != ${onChain.status}` : "",
        row.name !== onChain.name ? `name ${JSON.stringify(row.name)} != ${JSON.stringify(onChain.name)}` : "",
        row.startsAt !== onChain.startsAt ? `starts_at ${row.startsAt} != ${onChain.startsAt}` : "",
      ].filter(Boolean);
      if (differences.length > 0) {
        findings.push({ kind: "event-differs", detail: `event ${eventId}: ${differences.join("; ")}` });
      }
    }

    for (let tokenId = 0; tokenId < totalSupply; tokenId += 1) {
      const onChain = await this.reader.recordOf(tokenId);
      const row = await store.getRecord(this.pool, tokenId);
      if (!row) {
        findings.push({ kind: "record-missing", detail: `record ${tokenId} is not indexed` });
        continue;
      }
      const differences = [
        row.state !== onChain.state ? `state ${row.state} != ${onChain.state}` : "",
        row.bibNo !== onChain.bibNo ? `bib_no ${row.bibNo} != ${onChain.bibNo}` : "",
        row.eventId !== onChain.eventId ? `event_id ${row.eventId} != ${onChain.eventId}` : "",
        row.participantHash !== onChain.participantHash
          ? `participant_hash ${row.participantHash} != ${onChain.participantHash}`
          : "",
        row.finishTimeS !== onChain.finishTimeS
          ? `finish_time_s ${row.finishTimeS} != ${onChain.finishTimeS}`
          : "",
      ].filter(Boolean);
      if (differences.length > 0) {
        findings.push({ kind: "record-differs", detail: `record ${tokenId}: ${differences.join("; ")}` });
      }
    }

    return {
      ok: findings.length === 0,
      chain: { events: eventCount, records: totalSupply },
      index: { events: indexedEvents, records: indexedRecords },
      findings,
    };
  }
}

/**
 * The transition history implied by one `RecordData`.
 *
 * `entered_at`, `claimed_at` and `result_at` are written by the contract at the
 * moment of each transition, so this is a real history and not a guess — the
 * only thing missing is which ledger and transaction each step happened in,
 * which is why these rows are `source = 'state'`.
 *
 * A `Dnf` from `Entered` (a no-show) has no `claimed_at`, so it correctly
 * yields two rows rather than three.
 */
export function reconstructTransitions(record: ChainRecord): Array<{
  tokenId: number;
  fromState: RecordState | null;
  toState: RecordState;
  occurredAt: bigint;
}> {
  const out: Array<{
    tokenId: number;
    fromState: RecordState | null;
    toState: RecordState;
    occurredAt: bigint;
  }> = [{ tokenId: record.tokenId, fromState: null, toState: "Entered", occurredAt: record.enteredAt }];

  if (record.claimedAt !== null) {
    out.push({
      tokenId: record.tokenId,
      fromState: "Entered",
      toState: "RacepackClaimed",
      occurredAt: record.claimedAt,
    });
  }
  if (record.resultAt !== null && (record.state === "Finished" || record.state === "Dnf")) {
    out.push({
      tokenId: record.tokenId,
      fromState: record.claimedAt === null ? "Entered" : "RacepackClaimed",
      toState: record.state,
      occurredAt: record.resultAt,
    });
  }
  return out;
}
