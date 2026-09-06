/**
 * STE-20 — the challenge endpoint, extracted so it is not the vault's property.
 *
 * `POST /auth/challenge` is the first half of every authenticated request in
 * this API: ask for a nonce, sign it with the account's key, send the signature
 * on the real request. It used to live inside the participants router, which
 * meant it was mounted only when a PII vault was configured.
 *
 * That was fine while the vault was the only thing behind authentication. It
 * stopped being fine with the results upload (STE-20), which needs the index
 * and the chain but has no business requiring a vault: a deployment configured
 * with Postgres and RPC but no `PII_KEYS` would mount an authenticated endpoint
 * and no way to obtain the credential for it. The failure would have looked
 * like a broken client rather than a missing route.
 *
 * So it is mounted once, by the server, whenever anything authenticated is.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ChallengeStore } from "../auth.js";
import { RATE_LIMITS } from "../http/hardening.js";

const STELLAR_ADDRESS = "^G[A-Z2-7]{55}$";

const challengeResponse = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["nonce", "expires_at"],
    properties: { nonce: { type: "string" }, expires_at: { type: "string" } },
  },
} as const;

export const RESPONSE_SCHEMAS = { challengeResponse };

export async function authRoutes(
  app: FastifyInstance,
  challenges: ChallengeStore,
): Promise<void> {
  app.post(
    "/auth/challenge",
    {
      // Tighter than the global ceiling: issuing a nonce is cheap for us and
      // cheap for an attacker, which makes it the endpoint somebody hammers
      // while guessing at signatures.
      config: { rateLimit: { max: RATE_LIMITS.challenge, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["address"],
          properties: { address: { type: "string", pattern: STELLAR_ADDRESS } },
        },
        response: challengeResponse,
      },
    },
    async (request: FastifyRequest<{ Body: { address: string } }>) => {
      const challenge = await challenges.issue(request.body.address);
      return { nonce: challenge.nonce, expires_at: challenge.expiresAt.toISOString() };
    },
  );
}
