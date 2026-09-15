/**
 * STE-52 — a record's check-in secret, returned to the wallet that owns it.
 *
 * `totp_secret` reaches a runner once, in the browser they entered from. A
 * runner who entered on a laptop needs the pass on their phone, and one who
 * changes phone needs it again. So: open `/pass/[tokenId]` on the phone,
 * connect the same wallet, sign, and get the secret back.
 *
 * ## The second place a secret leaves the vault
 *
 * The first is the scanner roster (routes/roster.ts), which hands a whole
 * event's secrets to its organiser and allowlisted scanners. This one hands ONE
 * secret to ONE wallet, and only to the wallet that already had it:
 *
 *   1. **Wallet signature.** The same single-use, two-minute nonce as every other
 *      authenticated route.
 *   2. **The chain decides ownership**, not this database: `owner_of(token_id)`
 *      is read on every request. Records are non-transferable, so the owner is
 *      the runner who signed `enter`, and there is no transfer that could move a
 *      pass to someone else.
 *   3. **The vault row must be that wallet's too.** `runner_address` on the row
 *      has to equal the owner. Confirm takes the token id from the client, so a
 *      row pointing at someone else's token is not something to hand out.
 *
 * What a leaked response costs is exactly what the runner's own pass costs: codes
 * for one record, still capped on chain because `claim_racepack` only accepts a
 * record in `Entered`. It carries no name, identity number or contact — the
 * response schema cannot express one (test/response-schemas.test.ts).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ChallengeStore } from "../auth.js";
import type { ChainReader } from "../chain/reader.js";
import { RATE_LIMITS } from "../http/hardening.js";
import type { Vault } from "../vault.js";

const HEX_64 = "^[0-9a-f]{64}$";

const passResponse = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["token_id", "totp_secret", "bib_name"],
    properties: {
      token_id: { type: "integer" },
      totp_secret: { type: "string", pattern: HEX_64 },
      /** Printed on the pass. `null` for an entry made before migration 009. */
      bib_name: { type: ["string", "null"] },
    },
  },
} as const;

export const RESPONSE_SCHEMAS = { passResponse };

export interface PassDeps {
  vault: Vault;
  reader: ChainReader;
  challenges: ChallengeStore;
}

export async function passRoutes(
  app: FastifyInstance,
  { vault, reader, challenges }: PassDeps,
): Promise<void> {
  app.get(
    "/records/:tokenId/pass",
    {
      config: { rateLimit: { max: RATE_LIMITS.pass, timeWindow: "1 minute" } },
      schema: {
        security: [{ walletSignature: [] }],
        params: {
          type: "object",
          required: ["tokenId"],
          properties: { tokenId: { type: "integer", minimum: 0 } },
        },
        response: passResponse,
      },
    },
    async (request: FastifyRequest<{ Params: { tokenId: number } }>, reply: FastifyReply) => {
      // Authenticated before anything is read, so an anonymous caller learns
      // nothing — not even whether the token exists.
      const caller = await challenges.verify(
        request.headers["x-sterun-address"] as string | undefined,
        request.headers["x-sterun-nonce"] as string | undefined,
        request.headers["x-sterun-signature"] as string | undefined,
      );
      const tokenId = request.params.tokenId;

      // The chain before the vault: a wallet that does not own the record never
      // causes a vault read at all. An unknown token reverts NonExistentToken,
      // which the error handler answers as 404.
      const owner = await reader.ownerOf(tokenId);
      if (owner !== caller) {
        return reply.code(403).send({
          error: "forbidden",
          message: "this record belongs to another account; connect the wallet that entered it",
        });
      }

      const pass = await vault.passForToken(tokenId);
      if (!pass || pass.runnerAddress !== caller) {
        if (pass) {
          // Owned on chain by the caller, linked in the vault to a row another
          // wallet submitted. Worth knowing about; not worth handing out.
          request.log.warn({ tokenId }, "vault row for this token was submitted by another wallet");
        }
        return reply.code(404).send({
          error: "no-pass",
          message:
            "this record has no confirmed entry details, so there is no pass to restore; " +
            "if you just entered, finish confirming the entry first",
        });
      }

      // The token id only. Never the secret, and the signature headers are
      // redacted by the logger (src/http/hardening.ts).
      request.log.info({ tokenId }, "pass returned to the record's owner");
      return { token_id: tokenId, totp_secret: pass.totpSecretHex, bib_name: pass.bibName };
    },
  );
}
