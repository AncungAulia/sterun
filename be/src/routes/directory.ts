/**
 * STE-16 (C8) — the fast path.
 *
 * Everything here is public on-chain data served out of Postgres instead of out
 * of RPC. A runner's profile page needs `records_of` plus one `record_of` per
 * token plus one `get_event` per distinct event; against RPC that is a dozen
 * round trips for a page that should be one. These endpoints are that one.
 *
 * **They are a cache, and they say so.** Every response carries `last_ledger`,
 * so a client can see how fresh the answer is, and the design keeps the direct
 * RPC read as a fallback (SYSTEM_DESIGN.md §2). Nothing here is authoritative
 * and nothing here is allowed to be the only copy.
 *
 * One naming decision worth stating: the event's on-chain name is exposed as
 * `event_name`, not `name`. That keeps a single, checkable rule true across the
 * whole API — **no response schema anywhere names a field `name`** — so the
 * test that enforces "a response cannot express PII" does not need an
 * exceptions list, and an exceptions list is exactly how that kind of test
 * stops working.
 *
 * u64 and i128 values are strings on the wire. A JSON number is an IEEE double,
 * and `price_stroops` is money.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import * as store from "../indexer/store.js";

const STELLAR_ADDRESS = "^G[A-Z2-7]{55}$";
const HEX_64 = "^[0-9a-f]{64}$";
const DIGITS = "^[0-9]+$";

const MAX_PAGE = 200;
const DEFAULT_PAGE = 50;

const categorySchema = {
  type: "object",
  additionalProperties: false,
  required: ["category_id", "code", "distance_m", "quota", "price_stroops", "entered_count"],
  properties: {
    category_id: { type: "integer" },
    code: { type: "string" },
    distance_m: { type: "integer" },
    quota: { type: "integer" },
    price_stroops: { type: "string", pattern: DIGITS },
    entered_count: { type: "integer" },
  },
} as const;

const eventSchema = {
  type: "object",
  additionalProperties: false,
  required: ["event_id", "organiser", "event_name", "status", "starts_at", "last_ledger"],
  properties: {
    event_id: { type: "integer" },
    organiser: { type: "string", pattern: STELLAR_ADDRESS },
    event_name: { type: "string" },
    metadata_hash: { type: "string", pattern: HEX_64 },
    uri: { type: "string" },
    starts_at: { type: "string", pattern: DIGITS },
    status: { type: "string", enum: ["Draft", "Open", "Closed", "Completed"] },
    source: { type: "string", enum: ["event", "state"] },
    last_ledger: { type: "integer" },
  },
} as const;

const recordSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "token_id",
    "event_id",
    "category_id",
    "bib_no",
    "runner_address",
    "participant_hash",
    "state",
    "entered_at",
    "last_ledger",
  ],
  properties: {
    token_id: { type: "integer" },
    event_id: { type: "integer" },
    category_id: { type: "integer" },
    bib_no: { type: "integer" },
    runner_address: { type: "string", pattern: STELLAR_ADDRESS },
    // Public by design: a commitment identifies nobody without the salt and the
    // plaintext, and being able to recompute it is the whole verification story
    // (SYSTEM_DESIGN.md §6e).
    participant_hash: { type: "string", pattern: HEX_64 },
    state: { type: "string", enum: ["Entered", "RacepackClaimed", "Finished", "Dnf"] },
    entered_at: { type: "string", pattern: DIGITS },
    claimed_at: { type: ["string", "null"], pattern: DIGITS },
    finish_time_s: { type: ["integer", "null"] },
    result_at: { type: ["string", "null"], pattern: DIGITS },
    source: { type: "string", enum: ["event", "state"] },
    last_ledger: { type: "integer" },
  },
} as const;

const transitionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["to_state", "occurred_at", "source"],
  properties: {
    from_state: { type: ["string", "null"], enum: [null, "Entered", "RacepackClaimed", "Finished", "Dnf"] },
    to_state: { type: "string", enum: ["Entered", "RacepackClaimed", "Finished", "Dnf"] },
    occurred_at: { type: "string", pattern: DIGITS },
    ledger: { type: ["integer", "null"] },
    tx_hash: { type: ["string", "null"], pattern: HEX_64 },
    source: { type: "string", enum: ["event", "state"] },
  },
} as const;

const eventListResponse = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["events", "count"],
    properties: { events: { type: "array", items: eventSchema }, count: { type: "integer" } },
  },
} as const;

const eventDetailResponse = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["event", "categories"],
    properties: { event: eventSchema, categories: { type: "array", items: categorySchema } },
  },
} as const;

const recordListResponse = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["records", "count"],
    properties: { records: { type: "array", items: recordSchema }, count: { type: "integer" } },
  },
} as const;

const recordDetailResponse = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["record", "transitions"],
    properties: { record: recordSchema, transitions: { type: "array", items: transitionSchema } },
  },
} as const;

const indexerStatusResponse = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["stream", "last_ledger", "counts"],
    properties: {
      stream: { type: "string" },
      cursor: { type: ["string", "null"] },
      last_ledger: { type: "integer" },
      oldest_ledger: { type: ["integer", "null"] },
      updated_at: { type: ["string", "null"] },
      counts: {
        type: "object",
        additionalProperties: false,
        properties: {
          events: { type: "integer" },
          categories: { type: "integer" },
          records: { type: "integer" },
          record_transitions: { type: "integer" },
          event_scanners: { type: "integer" },
          chain_events: { type: "integer" },
        },
      },
    },
  },
} as const;

export const RESPONSE_SCHEMAS = {
  eventListResponse,
  eventDetailResponse,
  recordListResponse,
  recordDetailResponse,
  indexerStatusResponse,
};

const toEventJson = (e: store.EventRow) => ({
  event_id: e.eventId,
  organiser: e.organiser,
  event_name: e.name,
  metadata_hash: e.metadataHash,
  uri: e.uri,
  starts_at: e.startsAt.toString(),
  status: e.status,
  source: e.source,
  last_ledger: e.lastLedger,
});

const toRecordJson = (r: store.RecordRow) => ({
  token_id: r.tokenId,
  event_id: r.eventId,
  category_id: r.categoryId,
  bib_no: r.bibNo,
  runner_address: r.runnerAddress,
  participant_hash: r.participantHash,
  state: r.state,
  entered_at: r.enteredAt.toString(),
  claimed_at: r.claimedAt?.toString() ?? null,
  finish_time_s: r.finishTimeS,
  result_at: r.resultAt?.toString() ?? null,
  source: r.source,
  last_ledger: r.lastLedger,
});

const pageQuery = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: MAX_PAGE, default: DEFAULT_PAGE },
    offset: { type: "integer", minimum: 0, default: 0 },
  },
} as const;

interface PageQuery {
  limit?: number;
  offset?: number;
}

export async function directoryRoutes(app: FastifyInstance, pool: Pool): Promise<void> {
  app.get(
    "/events",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            ...pageQuery.properties,
            status: { type: "string", enum: ["Draft", "Open", "Closed", "Completed"] },
          },
        },
        response: eventListResponse,
      },
    },
    async (request: FastifyRequest<{ Querystring: PageQuery & { status?: string } }>) => {
      const events = await store.listEvents(pool, {
        ...(request.query.status !== undefined ? { status: request.query.status } : {}),
        limit: request.query.limit ?? DEFAULT_PAGE,
        offset: request.query.offset ?? 0,
      });
      return { events: events.map(toEventJson), count: events.length };
    },
  );

  app.get(
    "/events/:eventId",
    {
      schema: {
        params: {
          type: "object",
          required: ["eventId"],
          properties: { eventId: { type: "integer", minimum: 0 } },
        },
        response: eventDetailResponse,
      },
    },
    async (request: FastifyRequest<{ Params: { eventId: number } }>, reply: FastifyReply) => {
      const event = await store.getEvent(pool, request.params.eventId);
      if (!event) {
        // 404 from the INDEX, which is not the same as "no such event on the
        // chain" — the message says so rather than letting a client conclude
        // something the cache cannot know.
        return reply.code(404).send({
          error: "not_indexed",
          message: "no such event in the index; it may exist on-chain and not be indexed yet",
        });
      }
      const categories = await store.listCategories(pool, request.params.eventId);
      return {
        event: toEventJson(event),
        categories: categories.map((c) => ({
          category_id: c.categoryId,
          code: c.code,
          distance_m: c.distanceM,
          quota: c.quota,
          price_stroops: c.priceStroops.toString(),
          entered_count: c.enteredCount,
        })),
      };
    },
  );

  app.get(
    "/events/:eventId/records",
    {
      schema: {
        params: {
          type: "object",
          required: ["eventId"],
          properties: { eventId: { type: "integer", minimum: 0 } },
        },
        querystring: pageQuery,
        response: recordListResponse,
      },
    },
    async (request: FastifyRequest<{ Params: { eventId: number }; Querystring: PageQuery }>) => {
      const records = await store.listRecordsByEvent(pool, request.params.eventId, {
        limit: request.query.limit ?? DEFAULT_PAGE,
        offset: request.query.offset ?? 0,
      });
      return { records: records.map(toRecordJson), count: records.length };
    },
  );

  app.get(
    "/records/:tokenId",
    {
      schema: {
        params: {
          type: "object",
          required: ["tokenId"],
          properties: { tokenId: { type: "integer", minimum: 0 } },
        },
        response: recordDetailResponse,
      },
    },
    async (request: FastifyRequest<{ Params: { tokenId: number } }>, reply: FastifyReply) => {
      const record = await store.getRecord(pool, request.params.tokenId);
      if (!record) {
        return reply.code(404).send({
          error: "not_indexed",
          message: "no such record in the index; it may exist on-chain and not be indexed yet",
        });
      }
      const transitions = await store.listTransitions(pool, request.params.tokenId);
      return {
        record: toRecordJson(record),
        transitions: transitions.map((t) => ({
          from_state: t.fromState,
          to_state: t.toState,
          occurred_at: t.occurredAt.toString(),
          ledger: t.ledger,
          tx_hash: t.txHash,
          source: t.source,
        })),
      };
    },
  );

  /** A runner's verifiable history — SYSTEM_DESIGN.md §6e, in one request. */
  app.get(
    "/runners/:address/records",
    {
      schema: {
        params: {
          type: "object",
          required: ["address"],
          properties: { address: { type: "string", pattern: STELLAR_ADDRESS } },
        },
        response: recordListResponse,
      },
    },
    async (request: FastifyRequest<{ Params: { address: string } }>) => {
      const records = await store.listRecordsByRunner(pool, request.params.address);
      return { records: records.map(toRecordJson), count: records.length };
    },
  );

  /**
   * How far behind the index is.
   *
   * Deliberately does not call RPC to compute the lag itself: this endpoint is
   * polled by dashboards, and a status page that fails when someone else's
   * service is slow reports the wrong outage. `last_ledger` against a ledger
   * number the caller already has is the same answer without the coupling.
   */
  app.get("/indexer/status", { schema: { response: indexerStatusResponse } }, async () => {
    const cursor = await store.getCursor(pool);
    return {
      stream: cursor?.stream ?? store.CONTRACT_STREAM,
      cursor: cursor?.cursor ?? null,
      last_ledger: cursor?.lastLedger ?? 0,
      oldest_ledger: cursor?.oldestLedger ?? null,
      updated_at: cursor?.updatedAt.toISOString() ?? null,
      counts: await store.counts(pool),
    };
  });
}
