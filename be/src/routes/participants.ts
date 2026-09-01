/**
 * STE-11 — the vault's HTTP surface.
 *
 * Every response is declared with an explicit Fastify JSON schema, and that is
 * a security control rather than documentation. Fastify serialises strictly
 * from the schema: a field the schema does not name cannot reach the client,
 * even if a future change starts putting it on the object. So "PII never leaves
 * the vault" becomes a property of these schemas, and a test can assert it by
 * reading them — which is check (4) in the ticket, done mechanically instead of
 * by grepping and hoping.
 *
 * There is deliberately no endpoint that returns a name, a national id or a
 * contact number, with or without authentication.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AuthError, type ChallengeStore } from "../auth.js";
import { NormalizationError } from "../spec/normalize.js";
import {
  AlreadyConfirmedError,
  ParticipantExistsError,
  ParticipantNotFoundError,
  type Vault,
} from "../vault.js";

const STELLAR_ADDRESS = "^G[A-Z2-7]{55}$";
const HEX_64 = "^[0-9a-f]{64}$";
const UUID = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

/**
 * The one response that carries secrets, and the only time they are ever sent.
 *
 * salt and totp_secret are shown exactly once: the salt so a runner can prove
 * their own record later without depending on this service existing, the secret
 * because their pass computes check-in codes offline. Both remain server-side
 * as well — the roster bundle (STE-16) needs the secret at race time.
 */
const submitResponse = {
  201: {
    type: "object",
    additionalProperties: false,
    required: ["participant_id", "participant_hash", "salt", "totp_secret", "shown_once"],
    properties: {
      participant_id: { type: "string" },
      participant_hash: { type: "string", pattern: HEX_64 },
      salt: { type: "string", pattern: HEX_64 },
      totp_secret: { type: "string", pattern: HEX_64 },
      shown_once: { type: "boolean" },
    },
  },
} as const;

const summaryResponse = {
  type: "object",
  additionalProperties: false,
  required: ["participant_id", "participant_hash", "event_id", "category_id", "runner_address"],
  properties: {
    participant_id: { type: "string" },
    participant_hash: { type: "string", pattern: HEX_64 },
    event_id: { type: "integer" },
    category_id: { type: "integer" },
    runner_address: { type: "string", pattern: STELLAR_ADDRESS },
    token_id: { type: ["integer", "null"] },
    confirmed_at: { type: ["string", "null"] },
    created_at: { type: "string" },
  },
} as const;

export interface VaultRouteDeps {
  vault: Vault;
  challenges: ChallengeStore;
}

export async function participantRoutes(
  app: FastifyInstance,
  { vault, challenges }: VaultRouteDeps,
): Promise<void> {
  /** Prove control of a Stellar account before touching the vault. */
  const authenticate = (request: FastifyRequest): string =>
    challenges.verify(
      request.headers["x-sterun-address"] as string | undefined,
      request.headers["x-sterun-nonce"] as string | undefined,
      request.headers["x-sterun-signature"] as string | undefined,
    );

  app.post(
    "/auth/challenge",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["address"],
          properties: { address: { type: "string", pattern: STELLAR_ADDRESS } },
        },
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["nonce", "expires_at"],
            properties: { nonce: { type: "string" }, expires_at: { type: "string" } },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: { address: string } }>) => {
      const challenge = challenges.issue(request.body.address);
      return { nonce: challenge.nonce, expires_at: challenge.expiresAt.toISOString() };
    },
  );

  app.post(
    "/participants",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "national_id",
            "emergency_contact",
            "event_id",
            "category_id",
            "runner_address",
          ],
          properties: {
            // Generous upper bounds rather than tight ones: a name is not a
            // format we get to define, and rejecting a real person's real name
            // is a worse failure than storing a long string.
            name: { type: "string", minLength: 1, maxLength: 512 },
            national_id: { type: "string", minLength: 1, maxLength: 128 },
            emergency_contact: { type: "string", minLength: 1, maxLength: 128 },
            event_id: { type: "integer", minimum: 0 },
            category_id: { type: "integer", minimum: 0 },
            runner_address: { type: "string", pattern: STELLAR_ADDRESS },
          },
        },
        response: submitResponse,
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          national_id: string;
          emergency_contact: string;
          event_id: number;
          category_id: number;
          runner_address: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const caller = authenticate(request);
      const body = request.body;
      if (caller !== body.runner_address) {
        // Submitting someone else's identity documents under your own signature
        // is the whole reason this check exists.
        return reply.code(403).send({
          error: "forbidden",
          message: "the authenticated account must be the runner_address being submitted",
        });
      }

      const result = await vault.submit({
        name: body.name,
        nationalId: body.national_id,
        emergencyContact: body.emergency_contact,
        eventId: body.event_id,
        categoryId: body.category_id,
        runnerAddress: body.runner_address,
      });

      return reply.code(201).send({
        participant_id: result.participantId,
        participant_hash: result.participantHash,
        salt: result.saltHex,
        totp_secret: result.totpSecretHex,
        shown_once: true,
      });
    },
  );

  app.post(
    "/participants/:id/confirm",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", pattern: UUID } },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["token_id", "enter_tx_hash"],
          properties: {
            token_id: { type: "integer", minimum: 0 },
            enter_tx_hash: { type: "string", pattern: HEX_64 },
          },
        },
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["participant_id", "token_id", "enter_tx_hash"],
            properties: {
              participant_id: { type: "string" },
              token_id: { type: "integer" },
              enter_tx_hash: { type: "string", pattern: HEX_64 },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { token_id: number; enter_tx_hash: string };
      }>,
      reply: FastifyReply,
    ) => {
      const caller = authenticate(request);
      const summary = await vault.summary(request.params.id);
      if (!summary) return reply.code(404).send({ error: "not_found", message: "no such participant" });
      if (summary.runnerAddress !== caller) {
        // Deliberately 403 and not 404: the id is a UUID the caller already
        // had, so hiding existence buys nothing, and a clear answer beats a
        // confusing one during an entry flow.
        return reply
          .code(403)
          .send({ error: "forbidden", message: "this record belongs to another account" });
      }

      const result = await vault.confirm(
        request.params.id,
        request.body.token_id,
        request.body.enter_tx_hash,
      );
      return {
        participant_id: result.participantId,
        token_id: result.tokenId,
        enter_tx_hash: result.enterTxHash,
      };
    },
  );

  /** Row metadata. No PII — see summaryResponse, which cannot express any. */
  app.get(
    "/participants/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", pattern: UUID } },
        },
        response: { 200: summaryResponse },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const caller = authenticate(request);
      const summary = await vault.summary(request.params.id);
      if (!summary) return reply.code(404).send({ error: "not_found", message: "no such participant" });
      if (summary.runnerAddress !== caller) {
        return reply
          .code(403)
          .send({ error: "forbidden", message: "this record belongs to another account" });
      }
      return {
        participant_id: summary.participantId,
        participant_hash: summary.participantHash,
        event_id: summary.eventId,
        category_id: summary.categoryId,
        runner_address: summary.runnerAddress,
        token_id: summary.tokenId,
        confirmed_at: summary.confirmedAt?.toISOString() ?? null,
        created_at: summary.createdAt.toISOString(),
      };
    },
  );

  /** Every failure mode of this router, mapped once. */
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError) {
      return reply.code(401).send({ error: error.reason, message: error.message });
    }
    if (error instanceof NormalizationError) {
      // The spec refused to hash this input. 400 with the frozen field/code so
      // the client can point at the right form field.
      return reply
        .code(400)
        .send({ error: error.code, field: error.field, message: error.message });
    }
    if (error instanceof ParticipantNotFoundError) {
      return reply.code(404).send({ error: "not_found", message: error.message });
    }
    if (error instanceof AlreadyConfirmedError || error instanceof ParticipantExistsError) {
      return reply.code(409).send({ error: "conflict", message: error.message });
    }
    // Fastify's schema validation failures arrive as an error carrying
    // `validation`; narrowed rather than cast because the handler's parameter
    // is `unknown` under this tsconfig.
    if (typeof error === "object" && error !== null && "validation" in error) {
      const message = error instanceof Error ? error.message : "request failed schema validation";
      return reply.code(400).send({ error: "invalid_request", message });
    }
    // Anything unrecognised is logged in full and answered with nothing: an
    // unexpected error in this router may well have PII in its message.
    reply.log.error({ err: error }, "unhandled error in participant routes");
    return reply.code(500).send({ error: "internal_error" });
  });
}

/** Exported so a test can assert no schema can express a PII field. */
export const RESPONSE_SCHEMAS = { submitResponse, summaryResponse };
