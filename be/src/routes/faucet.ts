/**
 * STE-49 — "Get test sUSD" from the web app.
 *
 * A paid entry needs an sUSD trustline and a balance, and until now the only
 * way to get either was `pnpm faucet` or asking the team. The web app shows the
 * button in the wallet menu and at the pay step; the flow is:
 *
 *   1. the runner's wallet opens the sUSD trustline (the browser does this —
 *      a trustline is signed by the account that holds it, so this service
 *      cannot and must not);
 *   2. this route pays a fixed amount to the authenticated address;
 *   3. the browser reads the balance back through the SAC.
 *
 * ## The limits, and where each one lives
 *
 *   testnet only      checked here against the network passphrase, and reported
 *                     in /config, so a mainnet deployment can never hand out
 *                     anything even if a faucet key were configured by mistake.
 *   one per address   per rolling window, in Postgres (faucet_payouts).
 *   daily cap         total across all addresses, in Postgres — keypairs are
 *                     free, so the per-address rule alone bounds nothing.
 *   per client        the IP-level limiter, as defence in depth.
 *   the float         the faucet key is its own account with a small balance,
 *                     never the distributor, so a compromised box can give away
 *                     at most what that account holds.
 *
 * Trustline and float are checked BEFORE a claim is reserved, so neither of
 * those errors costs a runner their window.
 */
import { Networks } from "@stellar/stellar-sdk";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import type { ChallengeStore } from "../auth.js";
import type { Config } from "../config.js";
import { claimPayout, settlePayout, type FaucetPayer } from "../faucet.js";
import { RATE_LIMITS } from "../http/hardening.js";

export interface FaucetRouteDeps {
  pool: Pool;
  challenges: ChallengeStore;
  config: Config;
  /** Absent when no faucet key is configured on this deployment. */
  payer: FaucetPayer | undefined;
}

/** Whether the route can pay at all, and if not, why. Also served in /config. */
export function faucetAvailability(
  config: Config,
  payer: FaucetPayer | undefined,
): { available: boolean; reason: string | null } {
  if (config.network.passphrase !== Networks.TESTNET) {
    return { available: false, reason: "the faucet only runs on Stellar testnet" };
  }
  if (!payer) {
    return { available: false, reason: "no faucet account is configured on this deployment" };
  }
  return { available: true, reason: null };
}

const payoutResponse = {
  200: {
    type: "object",
    additionalProperties: false,
    required: ["address", "paid_stroops", "tx_hash", "next_claim_at"],
    properties: {
      address: { type: "string", pattern: "^G[A-Z2-7]{55}$" },
      // i128 stroops, so a string (rule 5b).
      paid_stroops: { type: "string", pattern: "^[0-9]+$" },
      tx_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
      /** When this address may ask again. */
      next_claim_at: { type: "string" },
    },
  },
} as const;

/**
 * Did Horizon reject the transaction, with result codes to say why?
 *
 * Only then is it known that nothing moved. The codes arrive on the Horizon
 * error, which `StellarClient.submit` keeps as the `cause` of its own.
 */
export function horizonRejected(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    const codes = (current as { response?: { data?: { extras?: { result_codes?: unknown } } } })
      .response?.data?.extras?.result_codes;
    if (codes) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export const RESPONSE_SCHEMAS = { payoutResponse };

export async function faucetRoutes(
  app: FastifyInstance,
  { pool, challenges, config, payer }: FaucetRouteDeps,
): Promise<void> {
  app.post(
    "/faucet",
    {
      config: { rateLimit: { max: RATE_LIMITS.faucet, timeWindow: "1 minute" } },
      schema: { security: [{ walletSignature: [] }], response: payoutResponse },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const address = await challenges.verify(
        request.headers["x-sterun-address"] as string | undefined,
        request.headers["x-sterun-nonce"] as string | undefined,
        request.headers["x-sterun-signature"] as string | undefined,
      );

      const availability = faucetAvailability(config, payer);
      if (!availability.available || !payer) {
        const onMainnet = config.network.passphrase !== Networks.TESTNET;
        return reply.code(onMainnet ? 403 : 503).send({
          error: "faucet-unavailable",
          message: availability.reason ?? "the faucet is unavailable",
        });
      }

      const recipient = await payer.recipientStatus(address);
      if (recipient !== "ready") {
        return reply.code(409).send({
          error: "no-trustline",
          message:
            recipient === "no-account"
              ? "this wallet's account does not exist on testnet yet: fund it with test XLM, " +
                "add the sUSD trustline, then ask again"
              : "this wallet cannot hold sUSD yet: add the sUSD trustline in your wallet, then ask again",
        });
      }

      if ((await payer.balance()) < config.faucetAmount) {
        return reply.code(503).send({
          error: "faucet-empty",
          message: "the test sUSD faucet has run dry; the team has to top it up — try again later",
        });
      }

      const claim = await claimPayout(pool, {
        address,
        amountStroops: config.faucetAmount,
        windowHours: config.faucetWindowHours,
        dailyCapStroops: config.faucetDailyCapStroops,
      });
      if (claim.kind !== "claimed") {
        const retrySeconds = Math.max(1, Math.ceil((claim.retryAt.getTime() - Date.now()) / 1000));
        return reply
          .code(429)
          .header("retry-after", String(retrySeconds))
          .send({
            error: "rate-limited",
            message:
              claim.kind === "address-window"
                ? `this wallet already received test sUSD; it can ask again at ${claim.retryAt.toISOString()}`
                : `the faucet has handed out today's limit; try again at ${claim.retryAt.toISOString()}`,
            retry_at: claim.retryAt.toISOString(),
          });
      }

      let txHash: string;
      try {
        txHash = await payer.pay(address, config.faucetAmount);
      } catch (e) {
        // Released only when Horizon says the transaction was REJECTED. A
        // timeout or a 5xx says nothing about whether it reached a ledger —
        // Horizon can answer 504 for a transaction that then closes — and
        // releasing the window on one of those let a retry pay the same wallet
        // twice. Left pending, it still counts against both limits.
        if (!horizonRejected(e)) {
          request.log.error(
            { err: e, payoutId: claim.payoutId },
            "faucet payout outcome unknown; left pending",
          );
          return reply.code(502).send({
            error: "payout-unconfirmed",
            message:
              "the payment was sent but could not be confirmed; check your sUSD balance before " +
              "asking again — this wallet will not be paid twice",
          });
        }
        // Rejected outright, so nothing moved: release the window, so a failed
        // payout never costs the runner it.
        await settlePayout(pool, claim.payoutId, { status: "failed" });
        const detail = e instanceof Error ? e.message : String(e);
        // The trustline can be removed between the check above and the payment.
        if (/op_no_trust|op_not_authorized/.test(detail)) {
          return reply.code(409).send({
            error: "no-trustline",
            message: "this wallet cannot hold sUSD: add the sUSD trustline in your wallet, then ask again",
          });
        }
        if (/op_underfunded/.test(detail)) {
          return reply.code(503).send({
            error: "faucet-empty",
            message: "the test sUSD faucet has run dry; the team has to top it up — try again later",
          });
        }
        throw e;
      }

      await settlePayout(pool, claim.payoutId, { status: "paid", txHash });
      request.log.info({ payoutId: claim.payoutId, txHash }, "faucet payout");
      return {
        address,
        paid_stroops: config.faucetAmount.toString(),
        tx_hash: txHash,
        next_claim_at: new Date(Date.now() + config.faucetWindowHours * 3_600_000).toISOString(),
      };
    },
  );
}
