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

// ---------------------------------------------------------------------------
// STE-49 — the HTTP faucet: who may be paid, and the ledger that makes it safe
// ---------------------------------------------------------------------------

/**
 * The three things the route needs from the network, behind an interface so
 * the route's rules (window, cap, concurrency) are testable without Stellar.
 */
export interface FaucetPayer {
  /** The faucet account's own address, for logs and /config. */
  readonly address: string;
  /** Whether `address` can receive sUSD right now. */
  recipientStatus(address: string): Promise<"ready" | "no-account" | "no-trustline">;
  /** sUSD the faucet account still holds, in stroops. */
  balance(): Promise<bigint>;
  /** Pay `stroops` of sUSD to `to`. Resolves to the transaction hash. */
  pay(to: string, stroops: bigint): Promise<string>;
}

export class StellarFaucetPayer implements FaucetPayer {
  readonly address: string;
  private readonly stellar: StellarClient;

  constructor(
    config: Config,
    private readonly secret: string,
  ) {
    this.address = Keypair.fromSecret(secret).publicKey();
    this.stellar = new StellarClient(config);
  }

  async recipientStatus(address: string): Promise<"ready" | "no-account" | "no-trustline"> {
    try {
      return (await this.stellar.trustlineBalance(address)) === null ? "no-trustline" : "ready";
    } catch (e) {
      // Horizon answers 404 for an account that was never created. That is a
      // runner who has not funded their wallet yet, not a server failure.
      if ((e as { response?: { status?: number } })?.response?.status === 404) return "no-account";
      throw e;
    }
  }

  async balance(): Promise<bigint> {
    return (await this.stellar.trustlineBalance(this.address)) ?? 0n;
  }

  /**
   * Payments go one at a time. Each loads the faucet account's sequence number
   * from Horizon, so two in flight at once built transactions with the same
   * sequence and the second failed `tx_bad_seq` — two runners pressing the
   * button within seconds, and one got a 500. Serialised in this process; a
   * second API instance would need its own faucet account.
   */
  private queue: Promise<unknown> = Promise.resolve();

  pay(to: string, stroops: bigint): Promise<string> {
    const run = this.queue.then(() => this.stellar.payoutSusd(this.secret, to, stroops));
    this.queue = run.catch(() => undefined);
    return run;
  }
}

/** Why a claim was not granted, and when it could be. */
export type ClaimOutcome =
  | { kind: "claimed"; payoutId: string }
  | { kind: "address-window"; retryAt: Date }
  | { kind: "daily-cap"; retryAt: Date };

/**
 * Serialises every claim in the process group. One constant, because the daily
 * cap is global: a per-address lock would let two addresses race past it.
 * Faucet traffic is a trickle, so one queue costs nothing.
 */
const FAUCET_LOCK_KEY = 4_900_049;

/**
 * Reserve a payout, or say why not.
 *
 * Runs in one transaction under an advisory lock and inserts the `pending` row
 * before returning, so a concurrent request for the same address blocks on the
 * lock, then sees that row and is refused. Nothing is paid here; the caller pays
 * after this commits and then calls {@link settlePayout}.
 */
export async function claimPayout(
  pool: import("pg").Pool,
  request: { address: string; amountStroops: bigint; windowHours: number; dailyCapStroops: bigint },
): Promise<ClaimOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [FAUCET_LOCK_KEY]);

    const recent = await client.query<{ retry_at: Date }>(
      `SELECT requested_at + make_interval(hours => $2) AS retry_at
         FROM faucet_payouts
        WHERE address = $1
          AND status IN ('pending', 'paid')
          AND requested_at > now() - make_interval(hours => $2)
        ORDER BY requested_at DESC
        LIMIT 1`,
      [request.address, request.windowHours],
    );
    const lastForAddress = recent.rows[0];
    if (lastForAddress) {
      await client.query("ROLLBACK");
      return { kind: "address-window", retryAt: lastForAddress.retry_at };
    }

    const today = await client.query<{ total: string; retry_at: Date | null }>(
      `SELECT COALESCE(sum(amount_stroops), 0)::text AS total,
              min(requested_at) + interval '24 hours' AS retry_at
         FROM faucet_payouts
        WHERE status IN ('pending', 'paid')
          AND requested_at > now() - interval '24 hours'`,
    );
    const paidToday = BigInt(today.rows[0]?.total ?? "0");
    if (paidToday + request.amountStroops > request.dailyCapStroops) {
      await client.query("ROLLBACK");
      // The earliest counted payout ageing out is the first moment the cap
      // could admit another one.
      return { kind: "daily-cap", retryAt: today.rows[0]?.retry_at ?? new Date() };
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO faucet_payouts (address, amount_stroops) VALUES ($1, $2) RETURNING id::text`,
      [request.address, request.amountStroops.toString()],
    );
    await client.query("COMMIT");
    return { kind: "claimed", payoutId: inserted.rows[0]?.id ?? "" };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Record what happened to a claimed payout. */
export async function settlePayout(
  pool: import("pg").Pool,
  payoutId: string,
  outcome: { status: "paid"; txHash: string } | { status: "failed" },
): Promise<void> {
  await pool.query(
    `UPDATE faucet_payouts SET status = $2, tx_hash = $3, settled_at = now() WHERE id = $1`,
    [payoutId, outcome.status, outcome.status === "paid" ? outcome.txHash : null],
  );
}
