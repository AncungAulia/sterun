/**
 * STE-6 — the sUSD faucet, as a function so both the CLI and (later) an HTTP
 * route can use it.
 *
 * Three steps, and each is a no-op when it is already done, so running it twice
 * costs a few reads and changes nothing:
 *
 *   1. Friendbot — the account must exist and hold XLM before it can do
 *      anything at all.
 *   2. trustline — sUSD is a classic asset; without one the account cannot
 *      receive it, and `RaceRecord.enter` will roll back at the fee transfer.
 *   3. payout — a classic payment from the distributor.
 *
 * Then it reads the balance back **through the SAC**, not through Horizon. That
 * is the only reading that proves anything useful: `enter` calls the SAC, so
 * that is the balance that decides whether a runner can pay.
 */
import { Keypair } from "@stellar/stellar-sdk";
import type { Config } from "./config.js";
import { formatSusd } from "./config.js";
import { StellarClient } from "./stellar.js";

export interface FaucetResult {
  address: string;
  funded: "created" | "topped-up" | "already-funded";
  trustline: "created" | "already-present";
  /** `null` when nothing was paid out — see `skipPayout`. */
  payoutTxHash: string | null;
  paidStroops: bigint;
  /** Balance as a contract sees it, after everything above. */
  sacBalanceStroops: bigint;
}

const FUNDING_MESSAGE = {
  created: "account created and funded by Friendbot",
  "topped-up": "topped up by Friendbot (account already existed)",
  "already-funded": "already at the starting balance",
} as const;

export interface FaucetOptions {
  /** Secret of the account being topped up. It must sign its own trustline. */
  recipientSecret: string;
  /** Defaults to `config.faucetAmount`. */
  amountStroops?: bigint;
  /**
   * Skip the payout and only guarantee account + trustline. This is the mode a
   * third party without the distributor key can run, and it is still useful:
   * the trustline is the part they cannot receive sUSD without.
   */
  skipPayout?: boolean;
  log?: (message: string) => void;
}

export async function runFaucet(config: Config, options: FaucetOptions): Promise<FaucetResult> {
  const log = options.log ?? (() => {});
  const kp = Keypair.fromSecret(options.recipientSecret);
  const address = kp.publicKey();
  const stellar = new StellarClient(config);
  const amount = options.amountStroops ?? config.faucetAmount;

  log(`account ${address}`);

  const funded = await stellar.fundWithFriendbot(address);
  log(`  1/3 XLM       ${FUNDING_MESSAGE[funded]}`);

  const trustline = await stellar.ensureTrustline(options.recipientSecret);
  log(`  2/3 trustline ${trustline === "created" ? "opened for sUSD" : "already present"}`);

  let payoutTxHash: string | null = null;
  let paid = 0n;
  if (options.skipPayout) {
    log("  3/3 payout    skipped (--no-payout)");
  } else if (!config.distributorSecret) {
    // Not an error: an outside contributor legitimately does not have this key.
    // Say what is missing and what they can do about it instead of throwing.
    log(
      "  3/3 payout    skipped — SUSD_DISTRIBUTOR_SECRET is not set, so this run cannot pay out.\n" +
        "                The account and trustline above are ready; ask the PM for sUSD.",
    );
  } else {
    payoutTxHash = await stellar.payoutSusd(config.distributorSecret, address, amount);
    paid = amount;
    log(`  3/3 payout    ${formatSusd(amount)} sUSD sent, tx ${payoutTxHash}`);
  }

  const sacBalanceStroops = await stellar.sacBalance(address);
  log(`  balance seen by contracts (SAC): ${formatSusd(sacBalanceStroops)} sUSD`);

  return { address, funded, trustline, payoutTxHash, paidStroops: paid, sacBalanceStroops };
}
