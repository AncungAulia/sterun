/**
 * STE-16 (C8) — the roster bundle. **Handoff contract #3 to Ancung (STE-18).**
 *
 * A scanner PWA downloads this once, while it still has connectivity, and then
 * works a check-in desk with none. It contains, per entry: the token id, the
 * bib, the on-chain state at snapshot time, and the `totp_secret` the runner's
 * device is computing codes from. With those, verification is a local HMAC and
 * needs no network on either side (SYSTEM_DESIGN.md §7).
 *
 * ## This is the most sensitive response in the system
 *
 * It hands out check-in secrets in bulk. `docs/SYSTEM_DESIGN.md` §11 point 3
 * states the consequence plainly: whoever holds a roster can mint valid codes
 * for every runner in it. Three things bound that, and all three are enforced
 * here rather than assumed:
 *
 *   1. **Wallet signature.** Same challenge/sign/spend as the vault routes: a
 *      single-use nonce, two-minute expiry, bound to one address.
 *   2. **The chain decides who is a scanner**, not this database. Every request
 *      re-reads `is_scanner(event_id, caller)` and `get_organiser(event_id)`
 *      from EventRegistry. A scanner removed on-chain loses access on the next
 *      request, with no cache to invalidate and no revocation list to forget.
 *   3. **Scoped to one event.** There is no endpoint that returns two events'
 *      secrets, and no wildcard.
 *
 * And the damage is capped beyond this service: a valid code still cannot
 * produce a second race pack, because `claim_racepack` reverts unless the
 * on-chain state is exactly `Entered`.
 *
 * ## What it does NOT contain
 *
 * No name, no national id, no emergency contact, no salt. `name_fragment` is a
 * given name plus initials, computed at submit time and stored instead of the
 * name — see `src/roster/name-fragment.ts`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { AuthError, type ChallengeStore } from "../auth.js";
import type { ChainReader } from "../chain/reader.js";
import { ContractRevertError } from "../chain/errors.js";
import * as store from "../indexer/store.js";
import { MAX_FRAGMENT_LENGTH } from "../roster/name-fragment.js";
import { DIGITS, TIME_STEP_SECONDS, TOLERANCE_STEPS } from "../spec/totp.js";
import type { Vault } from "../vault.js";

const HEX_64 = "^[0-9a-f]{64}$";

const rosterResponse = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["event_id", "snapshot_ledger", "generated_at", "totp", "entries", "count"],
    properties: {
      event_id: { type: "integer" },
      /**
       * The ledger the state snapshot is from. A scanner that finds this far
       * behind the race start should refetch — the states in here would be
       * stale, and a stale `Entered` is the one that hands out a second pack.
       */
      snapshot_ledger: { type: "integer" },
      generated_at: { type: "string" },
      /**
       * The TOTP parameters, sent rather than assumed. They are frozen in
       * docs/specs/HASH_AND_TOTP.md, and a scanner that hardcodes them is a
       * scanner that silently disagrees the day they change.
       */
      totp: {
        type: "object",
        additionalProperties: false,
        required: ["digits", "step_seconds", "tolerance_steps"],
        properties: {
          digits: { type: "integer" },
          step_seconds: { type: "integer" },
          tolerance_steps: { type: "integer" },
        },
      },
      entries: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["token_id", "bib_no", "category_id", "state", "totp_secret"],
          properties: {
            token_id: { type: "integer" },
            bib_no: { type: "integer" },
            category_id: { type: "integer" },
            state: {
              type: "string",
              enum: ["Entered", "RacepackClaimed", "Finished", "Dnf"],
            },
            // Bounded by the schema as well as by the producer: a bug that
            // skipped the reduction still could not put a long legal name on
            // the wire, because Fastify serialises from this schema.
            name_fragment: { type: ["string", "null"], maxLength: MAX_FRAGMENT_LENGTH },
            totp_secret: { type: "string", pattern: HEX_64 },
          },
        },
      },
      count: { type: "integer" },
      /**
       * Vault rows whose token id the index has not caught up to yet. Reported
       * rather than hidden: a bundle quietly missing runners is a desk turning
       * people away.
       */
      missing_from_index: { type: "integer" },
    },
  },
} as const;

export const RESPONSE_SCHEMAS = { rosterResponse };

export interface RosterDeps {
  pool: Pool;
  vault: Vault;
  reader: ChainReader;
  challenges: ChallengeStore;
}

export async function rosterRoutes(
  app: FastifyInstance,
  { pool, vault, reader, challenges }: RosterDeps,
): Promise<void> {
  app.get(
    "/events/:eventId/roster",
    {
      schema: {
        params: {
          type: "object",
          required: ["eventId"],
          properties: { eventId: { type: "integer", minimum: 0 } },
        },
        response: rosterResponse,
      },
    },
    async (request: FastifyRequest<{ Params: { eventId: number } }>, reply: FastifyReply) => {
      const caller = challenges.verify(
        request.headers["x-sterun-address"] as string | undefined,
        request.headers["x-sterun-nonce"] as string | undefined,
        request.headers["x-sterun-signature"] as string | undefined,
      );
      const eventId = request.params.eventId;

      if (!(await isAllowed(reader, eventId, caller))) {
        return reply.code(403).send({
          error: "forbidden",
          message:
            "the authenticated account is neither the organiser of this event nor an " +
            "allowlisted scanner for it on-chain",
        });
      }

      const secrets = await vault.rosterSecretsForEvent(eventId);
      const indexed = new Map(
        (await store.listRecordsByEvent(pool, eventId, { limit: 10_000, offset: 0 })).map((r) => [
          r.tokenId,
          r,
        ]),
      );

      const entries = [];
      let missing = 0;
      for (const secret of secrets) {
        const record = indexed.get(secret.tokenId);
        if (!record) {
          missing += 1;
          continue;
        }
        entries.push({
          token_id: secret.tokenId,
          bib_no: record.bibNo,
          category_id: record.categoryId,
          state: record.state,
          name_fragment: secret.nameFragment,
          totp_secret: secret.totpSecretHex,
        });
      }

      const cursor = await store.getCursor(pool);
      return {
        event_id: eventId,
        snapshot_ledger: cursor?.lastLedger ?? 0,
        generated_at: new Date().toISOString(),
        totp: {
          digits: DIGITS,
          step_seconds: Number(TIME_STEP_SECONDS),
          tolerance_steps: TOLERANCE_STEPS,
        },
        entries,
        count: entries.length,
        missing_from_index: missing,
      };
    },
  );

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError) {
      return reply.code(401).send({ error: error.reason, message: error.message });
    }
    // An unknown event reverts EventNotFound(2) from get_organiser. That is a
    // 404, not a 500 — and it is answered the same way to everyone, so probing
    // this endpoint tells an attacker nothing they could not read on-chain.
    if (error instanceof ContractRevertError && error.isNotFound) {
      return reply.code(404).send({ error: "not_found", message: "no such event on-chain" });
    }
    if (typeof error === "object" && error !== null && "validation" in error) {
      const message = error instanceof Error ? error.message : "request failed schema validation";
      return reply.code(400).send({ error: "invalid_request", message });
    }
    reply.log.error({ err: error }, "unhandled error in roster routes");
    return reply.code(500).send({ error: "internal_error" });
  });
}

/**
 * Organiser or allowlisted scanner, read from the chain on every request.
 *
 * `get_organiser` first because it also proves the event exists: `is_scanner`
 * never reverts and answers `false` for an event that was never created, which
 * would turn "no such event" into "you are not allowed" and send someone
 * looking for a permissions problem that does not exist.
 */
async function isAllowed(reader: ChainReader, eventId: number, caller: string): Promise<boolean> {
  const organiser = await reader.getOrganiser(eventId);
  if (organiser === caller) return true;
  return reader.isScanner(eventId, caller);
}
