/**
 * sUSD from the runner's side: can they pay, and if not, how they get some (STE-21).
 *
 * ## Read through the asset contract
 *
 * The balance comes from `getSACBalance`, because the asset contract is what
 * `enter` asks when it moves the fee. A missing balance entry means no
 * trustline. A missing account means the wallet was never funded at all, and a
 * trustline cannot be opened until it is.
 *
 * ## Testnet only
 *
 * Test sUSD exists only on testnet, and nothing here that hands it out runs
 * anywhere else. On mainnet the same flow reads USDC and offers no faucet; only
 * the asset changes (root CLAUDE.md, settled decisions).
 */
import {
  Asset,
  BASE_FEE,
  Operation,
  TransactionBuilder,
  rpc,
  type Account,
} from "@stellar/stellar-sdk";

import { ApiError, apiFetch } from "./api";
import { IS_TESTNET, NETWORK, SUSD_ISSUER } from "./env";
import { PlainError } from "./plain-error";
import type { MessageSigner } from "./upload";
import type { signTransaction } from "./wallet";

export type SusdBalance =
  | { kind: "no-account" }
  | { kind: "no-trustline" }
  | { kind: "balance"; stroops: bigint };

/** Exactly the part of `rpc.Server` a balance read uses, so a test can supply it. */
export interface BalanceReader {
  getAssetBalance(
    address: string,
    asset: Asset,
    networkPassphrase?: string,
  ): Promise<{ balanceEntry?: { amount: string } }>;
  getAccount(address: string): Promise<unknown>;
}

/**
 * What `getAssetBalance` throws when the account holds no trustline for the
 * asset, including an account that does not exist at all (checked on testnet,
 * 2026-09-15). Matched narrowly on purpose: every other failure is a failure,
 * and reading a slow node as "no trustline" would ask a runner to set up a
 * wallet that is already set up.
 */
const NO_TRUSTLINE = /^Trustline for .+ not found for /;

/** sUSD, named the way a trustline names it: code and issuer. */
export function susdAsset(): Asset {
  return new Asset("sUSD", SUSD_ISSUER);
}

function rpcServer(): rpc.Server {
  return new rpc.Server(NETWORK.rpcUrl);
}

/**
 * The wallet's sUSD, read through RPC.
 *
 * `getAssetBalance`, not `getSACBalance`: the latter only takes a contract
 * (`C...`) and throws for every wallet address, so the first version of this
 * read failed for every runner while its mocked tests passed (2026-09-15).
 */
export async function readSusdBalance(
  address: string,
  server: BalanceReader = rpcServer(),
): Promise<SusdBalance> {
  try {
    const { balanceEntry } = await server.getAssetBalance(address, susdAsset(), NETWORK.networkPassphrase);
    return { kind: "balance", stroops: balanceEntry ? BigInt(balanceEntry.amount) : 0n };
  } catch (error) {
    if (!(error instanceof Error) || !NO_TRUSTLINE.test(error.message)) throw error;
  }

  // No trustline. Whether the account exists decides what setting it up takes.
  try {
    await server.getAccount(address);
    return { kind: "no-trustline" };
  } catch {
    return { kind: "no-account" };
  }
}

/**
 * How much more the wallet needs, in stroops. Zero means it can pay.
 *
 * A free entry needs nothing, whatever the wallet holds: `enter` moves no money
 * for it, so neither a trustline nor an account balance is asked for.
 */
export function shortfall(balance: SusdBalance, total: bigint): bigint {
  if (total === 0n) return 0n;
  const held = balance.kind === "balance" ? balance.stroops : 0n;
  return held >= total ? 0n : total - held;
}

const SETUP_FAILED = "Your wallet could not be set up for test sUSD. Please try again.";

/**
 * Make the wallet able to hold sUSD: fund it from friendbot if it has never
 * been funded, then sign one `changeTrust`. Testnet only.
 */
export async function addSusdTrustline(address: string, sign: typeof signTransaction): Promise<void> {
  if (!IS_TESTNET) throw new PlainError("Test sUSD is only available on the test network.");
  const server = rpcServer();

  let account: Account;
  try {
    account = await server.getAccount(address);
  } catch {
    const funded = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`);
    if (!funded.ok) throw new PlainError(SETUP_FAILED);
    account = await server.getAccount(address);
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.networkPassphrase,
  })
    .addOperation(Operation.changeTrust({ asset: susdAsset() }))
    .setTimeout(120)
    .build();

  const { signedTxXdr } = await sign(tx.toXDR(), {
    address,
    networkPassphrase: NETWORK.networkPassphrase,
  });

  const sent = await server.sendTransaction(
    TransactionBuilder.fromXDR(signedTxXdr, NETWORK.networkPassphrase),
  );
  if (sent.status !== "PENDING" && sent.status !== "DUPLICATE") throw new PlainError(SETUP_FAILED);

  const final = await server.pollTransaction(sent.hash, { attempts: 20 });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new PlainError(SETUP_FAILED);
}

export type FaucetResult =
  | { kind: "sent" }
  | { kind: "rate-limited" }
  | { kind: "empty" }
  | { kind: "unavailable" }
  /** Sent, but not confirmed. The route will not pay this wallet twice, so asking again is pointless. */
  | { kind: "unconfirmed" }
  /** The wallet cannot hold sUSD (the trustline was removed between our check and the payout). */
  | { kind: "no-trustline" };

/**
 * Ask the backend faucet to send test sUSD to the signer (STE-49).
 *
 * The route is `be/src/routes/faucet.ts` on main, live since 2026-09-15. Its
 * refusals, each mapped below: `faucet-unavailable` (503 on a deployment with
 * no faucet key, 403 off testnet), `no-trustline` (409), `faucet-empty` (503),
 * `rate-limited` (429), and `payout-unconfirmed` (502). A 404 is kept as
 * unavailable for a backend that predates the route.
 */
export async function requestTestSusd(address: string, sign: MessageSigner): Promise<FaucetResult> {
  const challenge = await apiFetch<{ nonce: string; expires_at: string }>("/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const signature = await sign(challenge.nonce, { address });

  try {
    await apiFetch("/faucet", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sterun-address": address,
        "x-sterun-nonce": challenge.nonce,
        "x-sterun-signature": signature,
      },
      body: JSON.stringify({}),
    });
    return { kind: "sent" };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === "rate-limited" || error.status === 429) return { kind: "rate-limited" };
      if (error.code === "faucet-empty") return { kind: "empty" };
      if (error.code === "faucet-unavailable" || error.status === 404) return { kind: "unavailable" };
      if (error.code === "payout-unconfirmed") return { kind: "unconfirmed" };
      if (error.code === "no-trustline") return { kind: "no-trustline" };
    }
    throw error;
  }
}
