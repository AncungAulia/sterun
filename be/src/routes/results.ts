/**
 * STE-20 (C7) — the results upload, reviewed before anything is signed.
 *
 * Design flow 6d: the organiser uploads a CSV from manual timing, the backend
 * maps bib numbers to `token_id`s through the index and reports every doubtful
 * row, the organiser approves, and only then does the console publish through
 * the SDK. This is the middle step, and it is a *preview* — this service signs
 * nothing and submits nothing. That separation is deliberate: the account that
 * may publish results is the organiser's, and it should stay on the organiser's
 * device rather than becoming a key this server holds.
 *
 * ## Why a review step exists at all
 *
 * `record_finish` moves a record to `Finished`, which is terminal. A wrong time
 * published here cannot be corrected — not by us, not by the organiser, not by
 * a migration. Everything expensive about this endpoint is buying the chance to
 * notice before that happens.
 *
 * ## Tamper evidence
 *
 * The response carries `source_sha256` of the exact bytes uploaded. Recording
 * that hash in the event metadata is what lets anybody later check that the
 * published results came from the file the organiser said they did — the
 * mitigation named in SYSTEM_DESIGN §11 risk 4, where results are only as
 * honest as the organiser and the chain can make them tamper-*evident* rather
 * than correct at source.
 */
import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { AuthError, type ChallengeStore } from "../auth.js";
import type { ChainReader } from "../chain/reader.js";
import { ContractRevertError } from "../chain/errors.js";
import * as store from "../indexer/store.js";
import { CsvFormatError, parseResultsCsv } from "../results/csv.js";
import { reviewResults } from "../results/anomalies.js";

/** Enough for a very large marathon; beyond it, something else is going on. */
export const MAX_CSV_BYTES = 5 * 1024 * 1024;
/** Rows read per event from the index. The largest road races are ~50k. */
const MAX_RECORDS = 100_000;

const anomalySchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "reason", "severity"],
  properties: {
    kind: {
      type: "string",
      enum: [
        "malformed_row",
        "unknown_bib",
        "ambiguous_bib",
        "duplicate_bib",
        "not_claimed",
        "already_final",
        "impossible_time",
      ],
    },
    reason: { type: "string" },
    severity: { type: "string", enum: ["reverts", "wrong"] },
  },
} as const;

const rowSchema = {
  type: "object",
  additionalProperties: false,
  required: ["line", "bib_no", "category_id", "finish_time_s", "token_id", "state", "anomalies"],
  properties: {
    line: { type: "integer" },
    bib_no: { type: ["integer", "null"] },
    category_id: { type: ["integer", "null"] },
    // u32 seconds — small enough for a JSON number, unlike the u64 timestamps.
    finish_time_s: { type: ["integer", "null"] },
    token_id: { type: ["integer", "null"] },
    state: {
      type: ["string", "null"],
      enum: ["Entered", "RacepackClaimed", "Finished", "Dnf", null],
    },
    anomalies: { type: "array", items: anomalySchema },
  },
} as const;

/**
 * The preview.
 *
 * No property here is called `name` — the whole-API guard in
 * `test/response-schemas.test.ts` forbids it without exception, which is what
 * makes the rule checkable. The event's name is `event_name`, as everywhere
 * else.
 */
const previewResponse = {
  200: {
    type: "object",
    additionalProperties: false,
    required: [
      "event_id",
      "event_name",
      "source_sha256",
      "source_bytes",
      "header",
      "row_count",
      "skipped_rows",
      "counts",
      "rows",
      "publishable",
    ],
    properties: {
      event_id: { type: "integer" },
      event_name: { type: "string" },
      /**
       * sha256 of the uploaded bytes, unmodified. This is the value that goes
       * into event metadata so the published results stay tamper-evident.
       */
      source_sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
      source_bytes: { type: "integer" },
      header: { type: "array", items: { type: "string" } },
      row_count: { type: "integer" },
      skipped_rows: { type: "integer" },
      counts: {
        type: "object",
        additionalProperties: false,
        required: [
          "total",
          "publishable",
          "malformed_row",
          "unknown_bib",
          "ambiguous_bib",
          "duplicate_bib",
          "not_claimed",
          "already_final",
          "impossible_time",
        ],
        properties: {
          total: { type: "integer" },
          publishable: { type: "integer" },
          malformed_row: { type: "integer" },
          unknown_bib: { type: "integer" },
          ambiguous_bib: { type: "integer" },
          duplicate_bib: { type: "integer" },
          not_claimed: { type: "integer" },
          already_final: { type: "integer" },
          impossible_time: { type: "integer" },
        },
      },
      rows: { type: "array", items: rowSchema },
      /**
       * The subset with no anomalies at all, as `record_finish` arguments.
       * Sent separately so the console never has to re-derive "which rows are
       * safe" — the one decision this endpoint exists to make.
       */
      publishable: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["token_id", "finish_time_s", "bib_no", "category_id"],
          properties: {
            token_id: { type: "integer" },
            finish_time_s: { type: "integer" },
            bib_no: { type: "integer" },
            category_id: { type: "integer" },
          },
        },
      },
    },
  },
} as const;

export const RESPONSE_SCHEMAS = { previewResponse };

export interface ResultsDeps {
  pool: Pool;
  reader: ChainReader;
  challenges: ChallengeStore;
}

export async function resultsRoutes(
  app: FastifyInstance,
  { pool, reader, challenges }: ResultsDeps,
): Promise<void> {
  /**
   * CSV arrives as a raw body rather than multipart.
   *
   * A results file is one document, not a form, and multipart would add a
   * dependency plus a parser to hold exactly one field. Raw `text/csv` is also
   * what `curl --data-binary` sends, which matters because the third-party
   * scenario in the ticket is somebody driving this from a shell.
   */
  app.addContentTypeParser(
    ["text/csv", "application/csv", "text/plain"],
    { parseAs: "buffer", bodyLimit: MAX_CSV_BYTES },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.post(
    "/events/:eventId/results/preview",
    {
      schema: {
        params: {
          type: "object",
          required: ["eventId"],
          properties: { eventId: { type: "integer", minimum: 0 } },
        },
        response: previewResponse,
      },
    },
    async (request: FastifyRequest<{ Params: { eventId: number } }>, reply: FastifyReply) => {
      const caller = challenges.verify(
        request.headers["x-sterun-address"] as string | undefined,
        request.headers["x-sterun-nonce"] as string | undefined,
        request.headers["x-sterun-signature"] as string | undefined,
      );
      const eventId = request.params.eventId;

      // Read the organiser from the CHAIN, not from the index. The index is a
      // cache and can lag; who may publish results is an authorization
      // decision and has to come from the authoritative copy.
      const organiser = await reader.getOrganiser(eventId);
      if (organiser !== caller) {
        return reply.code(403).send({
          error: "forbidden",
          message: "only the organiser of this event on-chain may upload its results",
        });
      }

      const body = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.code(400).send({
          error: "empty-body",
          message:
            "send the CSV as the request body with Content-Type: text/csv " +
            "(curl --data-binary @results.csv)",
        });
      }

      // Hash the bytes exactly as received, before any parsing or
      // normalisation. A hash of something we tidied up first would not
      // identify the organiser's file.
      const sourceSha256 = createHash("sha256").update(body).digest("hex");

      let parsed;
      try {
        parsed = parseResultsCsv(body.toString("utf8"));
      } catch (e) {
        if (e instanceof CsvFormatError) {
          return reply.code(400).send({ error: "malformed-csv", message: e.message });
        }
        throw e;
      }

      const event = await store.getEvent(pool, eventId);
      if (!event) {
        // The chain knows this event (getOrganiser answered) but the index does
        // not, which means the poller has not caught up. Saying so is far more
        // useful than a 404 the organiser would read as "wrong event id".
        return reply.code(409).send({
          error: "not-indexed",
          message:
            `event ${eventId} exists on-chain but is not in the index yet, so bib numbers ` +
            `cannot be resolved. Wait for the poller, or run \`pnpm indexer rebuild\`.`,
        });
      }

      const [records, categories] = await Promise.all([
        store.listRecordsByEvent(pool, eventId, { limit: MAX_RECORDS, offset: 0 }),
        store.listCategories(pool, eventId),
      ]);

      const review = reviewResults(
        parsed.rows,
        records.map((r) => ({
          tokenId: r.tokenId,
          categoryId: r.categoryId,
          bibNo: r.bibNo,
          state: r.state,
        })),
        categories.map((c) => ({ categoryId: c.categoryId, distanceM: c.distanceM })),
      );

      return {
        event_id: eventId,
        event_name: event.name,
        source_sha256: sourceSha256,
        source_bytes: body.length,
        header: parsed.header,
        row_count: review.rows.length,
        skipped_rows: parsed.skipped,
        counts: review.counts,
        rows: review.rows.map((row) => ({
          line: row.line,
          bib_no: row.bibNo,
          category_id: row.categoryId,
          finish_time_s: row.finishTimeS,
          token_id: row.tokenId,
          state: row.state,
          anomalies: row.anomalies,
        })),
        publishable: review.publishable.map((row) => ({
          // Non-null by construction: a row with no anomalies resolved to a
          // record and carried a usable time.
          token_id: row.tokenId as number,
          finish_time_s: row.finishTimeS as number,
          bib_no: row.bibNo as number,
          category_id: row.categoryId as number,
        })),
      };
    },
  );

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError) {
      return reply.code(401).send({ error: error.reason, message: error.message });
    }
    if (error instanceof ContractRevertError && error.isNotFound) {
      // Answered identically to everyone, so probing for events you are not the
      // organiser of tells you nothing you could not read off the chain anyway.
      return reply.code(404).send({ error: "not-found", message: "no such event" });
    }
    if ((error as { statusCode?: number }).statusCode === 413) {
      return reply.code(413).send({
        error: "payload-too-large",
        message: `the results file must be at most ${MAX_CSV_BYTES} bytes`,
      });
    }
    reply.send(error);
  });
}
