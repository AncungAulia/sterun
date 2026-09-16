/**
 * STE-40 — signed event announcements, published and served.
 *
 *   POST /events/:eventId/announcements   the organiser publishes one
 *   GET  /events/:eventId/announcements   anyone reads them, newest first
 *
 * The event document stays frozen (STE-34); a change is announced beside it
 * (`docs/WEB_APP_IA.md` §6.1). Four rules, each enforced here:
 *
 * 1. **Signed by the organiser, checked against the chain.** The signature is
 *    over the announcement itself (`src/announcements.ts`), not over a login
 *    nonce, so it stays checkable forever. Who counts as the organiser is read
 *    from `get_organiser` on every publish, never from the index.
 * 2. **Append-only.** No edit route, no delete route, and the table refuses
 *    UPDATE, DELETE and TRUNCATE itself (migration 013). A correction is a new
 *    announcement.
 * 3. **Re-verifiable without us.** Every response carries the exact signed
 *    `message`, the signature, the signer and the scheme.
 * 4. **Dated honestly.** `published_at` is signed, and must be within ten
 *    minutes of this server's clock when it arrives, so an organiser cannot
 *    publish today an announcement dated last month.
 *
 * No login nonce is required: the signature already proves control of the
 * organiser's key and binds the content, which a nonce could not. A replay of
 * the same signed announcement is the same announcement (idempotent, 200).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  PUBLISHED_AT_PATTERN,
  announcementMessage,
  bodySha256,
  verifyAnnouncementSignature,
  type SignatureScheme,
} from "../announcements.js";
import { AuthError } from "../auth.js";
import type { ChainReader } from "../chain/reader.js";
import { ApiError } from "../http/errors.js";
import { RATE_LIMITS } from "../http/hardening.js";

export const MAX_ANNOUNCEMENT_CHARS = 2000;
/** How far a signed `published_at` may be from this server's clock. */
export const PUBLISH_WINDOW_MS = 10 * 60 * 1000;
/** A page an event page can render at once; announcements are rare. */
const MAX_LISTED = 500;

const STELLAR_ADDRESS = "^G[A-Z2-7]{55}$";

const announcementSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "event_id",
    "published_at",
    "received_at",
    "body",
    "signer",
    "signature",
    "scheme",
    "network_passphrase",
    "event_registry",
    "message",
  ],
  properties: {
    /** bigserial, so a string like every other value that may outgrow a double. */
    id: { type: "string", pattern: "^[0-9]+$" },
    event_id: { type: "integer" },
    /** Signed. What a page shows as the announcement's date. */
    published_at: { type: "string" },
    /** When this service accepted it. Not signed. */
    received_at: { type: "string" },
    body: { type: "string" },
    signer: { type: "string", pattern: STELLAR_ADDRESS },
    /** base64 of the 64-byte signature. */
    signature: { type: "string" },
    scheme: { type: "string", enum: ["ed25519", "sep53"] },
    network_passphrase: { type: "string" },
    event_registry: { type: "string" },
    /** The exact text that was signed, rebuilt from the fields above. */
    message: { type: "string" },
  },
} as const;

const publishResponse = { 200: announcementSchema, 201: announcementSchema } as const;

const listResponse = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["event_id", "announcements", "count"],
    properties: {
      event_id: { type: "integer" },
      announcements: { type: "array", items: announcementSchema },
      count: { type: "integer" },
    },
  },
} as const;

export const RESPONSE_SCHEMAS = { publishResponse, listResponse };

export interface AnnouncementDeps {
  pool: Pool;
  reader: ChainReader;
  /** The network and registry every new announcement is signed for. */
  networkPassphrase: string;
  eventRegistry: string;
  /** Injectable for tests. */
  now?: () => number;
}

interface AnnouncementRow {
  id: string;
  event_id: number;
  published_at: Date;
  received_at: Date;
  body: string;
  signer: string;
  signature: Buffer;
  scheme: SignatureScheme;
  network_passphrase: string;
  event_registry: string;
}

const COLUMNS = `id::text AS id, event_id, published_at, received_at, body, signer, signature, scheme,
                 network_passphrase, event_registry`;

function toJson(row: AnnouncementRow) {
  const publishedAt = row.published_at.toISOString();
  return {
    id: row.id,
    event_id: row.event_id,
    published_at: publishedAt,
    received_at: row.received_at.toISOString(),
    body: row.body,
    signer: row.signer,
    signature: row.signature.toString("base64"),
    scheme: row.scheme,
    network_passphrase: row.network_passphrase,
    event_registry: row.event_registry,
    // Rebuilt from the stored row rather than stored, so it cannot drift from
    // the fields a verifier will recompute it from.
    message: announcementMessage({
      networkPassphrase: row.network_passphrase,
      eventRegistry: row.event_registry,
      eventId: row.event_id,
      publishedAt,
      body: row.body,
    }),
  };
}

/**
 * Anything but printable text, line breaks and tabs: C0 controls other than
 * TAB and LF, and DEL. Code points rather than a regex, so no control
 * character has to appear in the source.
 */
function hasControlCharacter(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if ((cp < 0x20 && cp !== 0x09 && cp !== 0x0a) || cp === 0x7f) return true;
  }
  return false;
}

export async function announcementRoutes(
  app: FastifyInstance,
  { pool, reader, networkPassphrase, eventRegistry, now = Date.now }: AnnouncementDeps,
): Promise<void> {
  app.post(
    "/events/:eventId/announcements",
    {
      config: { rateLimit: { max: RATE_LIMITS.announcements, timeWindow: "1 minute" } },
      schema: {
        params: {
          type: "object",
          required: ["eventId"],
          properties: { eventId: { type: "integer", minimum: 0 } },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["published_at", "body", "signer", "signature"],
          properties: {
            published_at: { type: "string", pattern: PUBLISHED_AT_PATTERN },
            body: { type: "string", minLength: 1, maxLength: MAX_ANNOUNCEMENT_CHARS },
            signer: { type: "string", pattern: STELLAR_ADDRESS },
            signature: { type: "string", minLength: 1, maxLength: 128 },
          },
        },
        response: publishResponse,
      },
    },
    async (
      request: FastifyRequest<{
        Params: { eventId: number };
        Body: { published_at: string; body: string; signer: string; signature: string };
      }>,
      reply: FastifyReply,
    ) => {
      const eventId = request.params.eventId;
      const { published_at: publishedAt, body, signer, signature: signatureB64 } = request.body;

      if (body.trim().length === 0) {
        throw new ApiError(400, "invalid-announcement", "the announcement has no text");
      }
      if (hasControlCharacter(body)) {
        throw new ApiError(
          400,
          "invalid-announcement",
          "the announcement contains control characters; send plain text, line breaks and tabs only",
        );
      }

      // The pattern admits 2026-02-30; a real time must round-trip exactly,
      // because this string is what was signed.
      const publishedMs = Date.parse(publishedAt);
      if (Number.isNaN(publishedMs) || new Date(publishedMs).toISOString() !== publishedAt) {
        throw new ApiError(
          400,
          "invalid-published-at",
          `published_at ${publishedAt} is not a real time; use new Date().toISOString()`,
        );
      }
      if (Math.abs(now() - publishedMs) > PUBLISH_WINDOW_MS) {
        throw new ApiError(
          400,
          "stale-announcement",
          "published_at must be within 10 minutes of now, so an announcement cannot be dated in the " +
            "past or the future; sign it again with the current time",
        );
      }

      const signature = Buffer.from(signatureB64, "base64");
      if (signature.length !== 64) {
        throw new AuthError(
          "malformed-signature",
          `signature must be base64 of 64 raw bytes, got ${signature.length}`,
        );
      }
      const message = announcementMessage({ networkPassphrase, eventRegistry, eventId, publishedAt, body });
      const scheme = verifyAnnouncementSignature(message, signer, signature);
      if (!scheme) {
        throw new AuthError(
          "bad-signature",
          "the signature is not this signer's signature of this announcement for this event, network " +
            "and registry; sign the exact announcement message",
        );
      }

      // From the chain on every publish: the index is a cache, and who may speak
      // for an event is an authorization decision. An unknown event reverts
      // EventNotFound, which the error handler answers as 404.
      const organiser = await reader.getOrganiser(eventId);
      if (organiser !== signer) {
        return reply.code(403).send({
          error: "forbidden",
          message: "only the organiser of this event on-chain may publish its announcements",
        });
      }

      const inserted = await pool.query<AnnouncementRow>(
        `INSERT INTO event_announcements
           (event_id, published_at, body, body_sha256, signer, signature, scheme,
            network_passphrase, event_registry)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (signature) DO NOTHING
         RETURNING ${COLUMNS}`,
        [
          eventId,
          publishedAt,
          body,
          bodySha256(body),
          signer,
          signature,
          scheme,
          networkPassphrase,
          eventRegistry,
        ],
      );
      const created = inserted.rows[0];
      if (created) {
        request.log.info({ eventId, announcementId: created.id }, "announcement published");
        return reply.code(201).send(toJson(created));
      }

      // The same signed announcement again: the signature covers every field,
      // so this is the row already stored, not a second one.
      const { rows } = await pool.query<AnnouncementRow>(
        `SELECT ${COLUMNS} FROM event_announcements WHERE signature = $1`,
        [signature],
      );
      return reply.code(200).send(toJson(rows[0] as AnnouncementRow));
    },
  );

  app.get(
    "/events/:eventId/announcements",
    {
      schema: {
        params: {
          type: "object",
          required: ["eventId"],
          properties: { eventId: { type: "integer", minimum: 0 } },
        },
        response: listResponse,
      },
    },
    async (request: FastifyRequest<{ Params: { eventId: number } }>) => {
      const eventId = request.params.eventId;
      const { rows } = await pool.query<AnnouncementRow>(
        `SELECT ${COLUMNS} FROM event_announcements
          WHERE event_id = $1
          ORDER BY published_at DESC, id DESC
          LIMIT ${MAX_LISTED}`,
        [eventId],
      );
      return { event_id: eventId, announcements: rows.map(toJson), count: rows.length };
    },
  );
}
