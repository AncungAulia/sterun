/**
 * STE-6 — the Stellar operations the faucet needs, and nothing else.
 *
 * Why a runner needs this at all: sUSD is a *classic* Stellar asset, and a
 * classic account cannot hold one without a trustline. `RaceRecord.enter` pays
 * the entry fee by calling the SAC's `transfer`, so a runner without a
 * trustline fails there — and because `enter` is atomic, the whole entry rolls
 * back (no quota consumed, no mint). That failure is correct, but it is a
 * terrible first experience, so every test runner gets funded and trustlined
 * here first.
 *
 * (Protocol 26 added a SAC `trust` function that lets a contract open the
 * trustline itself. Using it would mean changing RaceRecord, whose interface is
 * frozen at v1.0.0 — a spec-change PR, not a backend decision. Noted as the
 * obvious v2 simplification.)
 */
import {
  Asset,
  BASE_FEE,
  Contract,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
  rpc,
  scValToNative,
  nativeToScVal,
  type Transaction,
} from "@stellar/stellar-sdk";
import type { Config } from "./config.js";

/** 5 minutes for a transaction to make it into a ledger. */
const TIMEOUT_SECONDS = 300;

export class StellarClient {
  readonly horizon: Horizon.Server;
  readonly rpc: rpc.Server;
  readonly susd: Asset;

  constructor(private readonly config: Config) {
    this.horizon = new Horizon.Server(config.network.horizonUrl);
    this.rpc = new rpc.Server(config.network.rpcUrl);
    this.susd = new Asset("sUSD", config.addresses.susdIssuer);
  }

  /** Does this account exist on the network at all? */
  async accountExists(address: string): Promise<boolean> {
    try {
      await this.horizon.loadAccount(address);
      return true;
    } catch (e) {
      if ((e as { response?: { status?: number } })?.response?.status === 404) return false;
      throw e;
    }
  }

  /**
   * Ask Friendbot to create or top up `address` with test XLM.
   *
   * Three distinct outcomes, reported distinctly because they mean different
   * things to whoever is reading the output:
   *
   *   created       the account did not exist and now does;
   *   topped-up     it existed but had spent below the starting balance, and
   *                 Friendbot refilled it — this is the common case on the
   *                 second run, and calling it "funded" reads like the first;
   *   already-funded  it is already at the starting balance. Friendbot answers
   *                 400 for that, which is not a failure: the state we wanted
   *                 is the state we have.
   *
   * Any other non-2xx is a genuine failure and throws.
   */
  async fundWithFriendbot(address: string): Promise<"created" | "topped-up" | "already-funded"> {
    const existed = await this.accountExists(address);
    const url = `${this.config.network.friendbotUrl}?addr=${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (res.ok) return existed ? "topped-up" : "created";
    const body = await res.text();
    if (
      res.status === 400 &&
      /op_already_exists|already funded|createAccountAlreadyExist/i.test(body)
    ) {
      return "already-funded";
    }
    throw new Error(`friendbot failed for ${address}: HTTP ${res.status} ${body.slice(0, 300)}`);
  }

  /** Classic trustline balance, or `null` when the account has no sUSD trustline. */
  async trustlineBalance(address: string): Promise<bigint | null> {
    const account = await this.horizon.loadAccount(address);
    const line = account.balances.find(
      (b) =>
        "asset_code" in b &&
        b.asset_code === this.susd.getCode() &&
        "asset_issuer" in b &&
        b.asset_issuer === this.susd.getIssuer(),
    );
    if (!line) return null;
    // Horizon renders balances as decimal strings; sUSD has 7 decimals, and the
    // string always carries all 7, so this is exact integer arithmetic.
    const [whole = "0", frac = ""] = line.balance.split(".");
    return BigInt(whole) * 10_000_000n + BigInt(frac.padEnd(7, "0"));
  }

  /** Open the sUSD trustline. No-op (reported as such) when one already exists. */
  async ensureTrustline(secret: string): Promise<"created" | "already-present"> {
    const kp = Keypair.fromSecret(secret);
    if ((await this.trustlineBalance(kp.publicKey())) !== null) return "already-present";

    const account = await this.horizon.loadAccount(kp.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.network.passphrase,
    })
      .addOperation(Operation.changeTrust({ asset: this.susd }))
      .setTimeout(TIMEOUT_SECONDS)
      .build();
    await this.submit(tx, kp);
    return "created";
  }

  /** Classic `payment` of sUSD from the distributor. Returns the tx hash. */
  async payoutSusd(distributorSecret: string, to: string, stroops: bigint): Promise<string> {
    if (stroops <= 0n) throw new Error(`payout amount must be positive, got ${stroops}`);
    const kp = Keypair.fromSecret(distributorSecret);
    const account = await this.horizon.loadAccount(kp.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.network.passphrase,
    })
      .addOperation(
        Operation.payment({
          destination: to,
          asset: this.susd,
          // Horizon takes a decimal string; stroops -> units, exactly.
          amount: decimalFromStroops(stroops),
        }),
      )
      .setTimeout(TIMEOUT_SECONDS)
      .build();
    return this.submit(tx, kp);
  }

  /**
   * The same balance as seen by a *contract*, read through the SAC.
   *
   * This is the check that matters: `RaceRecord.enter` does not look at
   * Horizon, it calls `balance` on the SAC. Reading it the same way proves the
   * funded runner is actually spendable from inside a contract invocation, not
   * merely visible in an explorer. Simulation only — nothing is submitted, so
   * this needs no signature and no funds.
   */
  async sacBalance(address: string): Promise<bigint> {
    const contract = new Contract(this.config.addresses.susdSac);
    // Any funded account works as the simulation source; the distributor is
    // guaranteed to exist because the payout comes from it.
    const source = await this.rpc.getAccount(this.config.addresses.susdDistributor);
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.config.network.passphrase,
    })
      .addOperation(contract.call("balance", nativeToScVal(address, { type: "address" })))
      .setTimeout(TIMEOUT_SECONDS)
      .build();

    const sim = await this.rpc.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(`SAC balance simulation failed for ${address}: ${sim.error}`);
    }
    if (!sim.result) throw new Error(`SAC balance simulation returned no result for ${address}`);
    return BigInt(scValToNative(sim.result.retval) as string | number | bigint);
  }

  private async submit(tx: Transaction, signer: Keypair): Promise<string> {
    tx.sign(signer);
    try {
      const res = await this.horizon.submitTransaction(tx);
      return res.hash;
    } catch (e) {
      throw new Error(`transaction failed: ${describeHorizonError(e)}`, { cause: e });
    }
  }
}

/** stroops -> the decimal string Horizon expects, without touching a float. */
export function decimalFromStroops(stroops: bigint): string {
  const whole = stroops / 10_000_000n;
  const frac = (stroops % 10_000_000n).toString().padStart(7, "0");
  return `${whole}.${frac}`;
}

/**
 * Horizon buries the useful part of a failure in
 * `response.data.extras.result_codes`. Surfacing it is the difference between
 * "Request failed with status code 400" and "op_no_trust".
 */
export function describeHorizonError(e: unknown): string {
  const extras = (e as { response?: { data?: { extras?: { result_codes?: unknown } } } })?.response
    ?.data?.extras;
  if (extras?.result_codes) return JSON.stringify(extras.result_codes);
  return e instanceof Error ? e.message : String(e);
}
