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
  getSACBalance(
    address: string,
    asset: Asset,
    networkPassphrase?: string,
  ): Promise<{ balanceEntry?: { amount: string } }>;
  getAccount(address: string): Promise<unknown>;
}

/** sUSD, named the way a trustline names it: code and issuer. */
export function susdAsset(): Asset {
  return new Asset("sUSD", SUSD_ISSUER);
}

function rpcServer(): rpc.Server {
  return new rpc.Server(NETWORK.rpcUrl);
}

export async function readSusdBalance(
  address: string,
  server: BalanceReader = rpcServer(),
): Promise<SusdBalance> {
  const { balanceEntry } = await server.getSACBalance(address, susdAsset(), NETWORK.networkPassphrase);
  if (balanceEntry) return { kind: "balance", stroops: BigInt(balanceEntry.amount) };

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
  | { kind: "unavailable" };

/**
 * Ask the backend faucet to send test sUSD to the signer (STE-49).
 *
 * The route path is assumed until STE-49 lands: confirm it with James before
 * merging. Until then the route answers 404, which reads as `unavailable`, so
 * the pay step still works for anyone who already holds sUSD.
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
      if (error.status === 404) return { kind: "unavailable" };
    }
    throw error;
  }
}
