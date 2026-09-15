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
import type { ChallengeStore } from "../auth.js";
import { ContractRevertError } from "../chain/errors.js";
import type { ChainRecord } from "../chain/decode.js";
import type { ChainReader } from "../chain/reader.js";
import { ApiError } from "../http/errors.js";
import type { Gender, IdType, Vault } from "../vault.js";

// STELLAR_ADDRESS is still used by the /participants body schema below.
const STELLAR_ADDRESS = "^G[A-Z2-7]{55}$";
const HEX_64 = "^[0-9a-f]{64}$";
const UUID = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

/**
 * E.164: a plus, a country code that does not start with 0, up to 15 digits.
 *
 * Required of `emergency_contact` because it is hashed, and norm_contact
 * (HASH_AND_TOTP.md §2.3) strips spaces and punctuation but does NOT add a
 * country code. `0812 3456 7890` and `+62 812 3456 7890` are the same phone and
 * different hashes, so a medic recomputing later would fail on correct data.
 * The form produces E.164; the server refuses anything else so no other client
 * can write a hash nobody can reproduce.
 */
export const E164 = "^\\+[1-9][0-9]{6,14}$";

/** A date of birth earlier than this is a typo, not a runner. */
const EARLIEST_DATE_OF_BIRTH = "1900-01-01";

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
  /**
   * What confirm checks the claimed token against. Without it confirm cannot
   * know whose record a token is, so it refuses (503) rather than linking blind.
   */
  reader?: ChainReader;
  /**
   * How long confirm waits between re-reads of a token the chain does not show
   * yet. The runner's wallet reports `enter` as landed from one RPC node and
   * this service may ask another, a ledger behind. Injectable for tests.
   */
  recordRetryDelaysMs?: readonly number[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function participantRoutes(
  app: FastifyInstance,
  { vault, challenges, reader, recordRetryDelaysMs = [1_000, 2_000] }: VaultRouteDeps,
): Promise<void> {
  /** Prove control of a Stellar account before touching the vault. */
  const authenticate = (request: FastifyRequest): Promise<string> =>
    challenges.verify(
      request.headers["x-sterun-address"] as string | undefined,
      request.headers["x-sterun-nonce"] as string | undefined,
      request.headers["x-sterun-signature"] as string | undefined,
    );

  app.post(
    "/participants",
    {
      schema: {
        security: [{ walletSignature: [] }],
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
            "id_type",
            "bib_name",
            "email",
            "phone",
            "gender",
            "date_of_birth",
            "emergency_contact_name",
          ],
          properties: {
            // Generous upper bounds rather than tight ones: a name is not a
            // format we get to define, and rejecting a real person's real name
            // is a worse failure than storing a long string.
            name: { type: "string", minLength: 1, maxLength: 512 },
            national_id: { type: "string", minLength: 1, maxLength: 128 },
            // Now the emergency phone number, in E.164 (STE-47). Still hashed.
            emergency_contact: { type: "string", pattern: E164 },
            // STE-47. None of these is part of participant_hash.
            id_type: {
              type: "string",
              enum: ["national_id_card", "passport", "driving_licence", "other"],
            },
            // Printed on the bib, so bounded by what fits on one.
            bib_name: { type: "string", minLength: 1, maxLength: 16 },
            email: { type: "string", format: "email", maxLength: 254 },
            phone: { type: "string", pattern: E164 },
            gender: { type: "string", enum: ["female", "male"] },
            // A real calendar date (format "date" refuses 2026-02-30), never an
            // age: a record is permanent and an age is not.
            date_of_birth: { type: "string", format: "date" },
            emergency_contact_name: { type: "string", minLength: 1, maxLength: 512 },
            event_id: { type: "integer", minimum: 0 },
            category_id: { type: "integer", minimum: 0 },
            runner_address: { type: "string", pattern: STELLAR_ADDRESS },
            /**
             * What the runner picked from the race pack, keyed by the item name
             * in the event document: `{"Event jersey": "L"}`.
             *
             * Optional, because a race that hands out nothing but a bib asks
             * for nothing. Not validated against the document: that file lives
             * off-chain at a url this service does not have, and fetching it
             * per submission to check a string would add a network dependency
             * to the write path in exchange for a check the console already
             * makes with the same data in front of it.
             *
             * Bounded rather than free: an unbounded object on an authenticated
             * write is a place to park data, and this column is not storage.
             */
            add_ons: {
              type: "array",
              maxItems: 20,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["item", "choice"],
                properties: {
                  item: { type: "string", minLength: 1, maxLength: 128 },
                  choice: { type: "string", minLength: 1, maxLength: 128 },
                },
              },
            },
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
          add_ons?: { item: string; choice: string }[];
          id_type: IdType;
          bib_name: string;
          email: string;
          phone: string;
          gender: Gender;
          date_of_birth: string;
          emergency_contact_name: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const caller = await authenticate(request);
      const body = request.body;
      if (caller !== body.runner_address) {
        // Submitting someone else's identity documents under your own signature
        // is the whole reason this check exists.
        return reply.code(403).send({
          error: "forbidden",
          message: "the authenticated account must be the runner_address being submitted",
        });
      }

      // The schema already proved this is a real calendar date. What it cannot
      // know is that a date of birth tomorrow, or in 1850, is not a runner.
      // Compared as strings: YYYY-MM-DD sorts in date order.
      const today = new Date().toISOString().slice(0, 10);
      if (body.date_of_birth > today || body.date_of_birth < EARLIEST_DATE_OF_BIRTH) {
        throw new ApiError(
          400,
          "invalid-date-of-birth",
          `date_of_birth ${body.date_of_birth} is not a plausible date of birth; ` +
            `send the runner's date of birth as YYYY-MM-DD, not today's date or an age`,
        );
      }

      const result = await vault.submit({
        name: body.name,
        nationalId: body.national_id,
        emergencyContact: body.emergency_contact,
        eventId: body.event_id,
        categoryId: body.category_id,
        runnerAddress: body.runner_address,
        // Spread rather than passed as possibly-undefined: the package sets
        // `exactOptionalPropertyTypes`, so an absent field and a field holding
        // undefined are not the same thing.
        ...(body.add_ons ? { addOns: body.add_ons } : {}),
        idType: body.id_type,
        bibName: body.bib_name,
        email: body.email,
        phone: body.phone,
        gender: body.gender,
        dateOfBirth: body.date_of_birth,
        emergencyContactName: body.emergency_contact_name,
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
        security: [{ walletSignature: [] }],
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
      const caller = await authenticate(request);
      const summary = await vault.summary(request.params.id);
      if (!summary) return reply.code(404).send({ error: "not-found", message: "no such participant" });
      if (summary.runnerAddress !== caller) {
        // Deliberately 403 and not 404: the id is a UUID the caller already
        // had, so hiding existence buys nothing, and a clear answer beats a
        // confusing one during an entry flow.
        return reply
          .code(403)
          .send({ error: "forbidden", message: "this record belongs to another account" });
      }

      const tokenId = request.body.token_id;
      // Already linked to a different token: say so without asking the chain
      // about a token this row will never be linked to.
      if (summary.tokenId !== null && summary.tokenId !== tokenId) {
        return reply.code(409).send({
          error: "conflict",
          message: `already confirmed as token_id ${summary.tokenId}`,
        });
      }

      // The token id comes from the client, so check it is THIS entry's record
      // before linking. Without this, a runner could point their own row at
      // someone else's token: the roster would then hand the desk the wrong
      // check-in secret for that runner, and whoever submitted the row could
      // check them in. The participant hash is the strong check (its salt is
      // this row's alone); event, category and owner make a mismatch explicit.
      if (!reader) {
        throw new ApiError(
          503,
          "chain-unavailable",
          "this deployment cannot read the chain, so it cannot check the record being confirmed",
        );
      }
      const record = await readRecordPatiently(reader, tokenId, recordRetryDelaysMs);
      if (!record) {
        throw new ApiError(
          404,
          "record-not-found",
          `token ${tokenId} is not on chain; if enter has just landed, retry in a few seconds`,
        );
      }
      const owner = await reader.ownerOf(tokenId);
      if (
        record.participantHash !== summary.participantHash ||
        record.eventId !== summary.eventId ||
        record.categoryId !== summary.categoryId ||
        owner !== caller
      ) {
        request.log.warn({ tokenId }, "confirm refused: the token is not this entry's record");
        throw new ApiError(
          409,
          "record-mismatch",
          `token ${tokenId} is not the record entered for this submission: confirm with the ` +
            "token_id your own enter transaction returned",
        );
      }

      const result = await vault.confirm(request.params.id, tokenId, request.body.enter_tx_hash);
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
        security: [{ walletSignature: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", pattern: UUID } },
        },
        response: { 200: summaryResponse },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const caller = await authenticate(request);
      const summary = await vault.summary(request.params.id);
      if (!summary) return reply.code(404).send({ error: "not-found", message: "no such participant" });
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
}

/**
 * `record_of`, re-read a few times when the token does not exist yet.
 *
 * Only "does not exist" is retried. Any other failure (RPC down, a decode
 * error) is thrown at once: waiting would not change it, and the caller should
 * see a 5xx rather than a misleading "not on chain".
 */
async function readRecordPatiently(
  reader: ChainReader,
  tokenId: number,
  delaysMs: readonly number[],
): Promise<ChainRecord | null> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await reader.recordOf(tokenId);
    } catch (error) {
      if (!(error instanceof ContractRevertError) || !error.isNotFound) throw error;
      const delay = delaysMs[attempt];
      if (delay === undefined) return null;
      await sleep(delay);
    }
  }
}

/** Exported so a test can assert no schema can express a PII field. */
export const RESPONSE_SCHEMAS = { submitResponse, summaryResponse };
