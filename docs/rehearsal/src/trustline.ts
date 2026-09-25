/**
 * Reading a trustline through RPC, where "no trustline" arrives as a throw.
 *
 * `getAssetBalance` does not answer an account with no trustline for the asset
 * with an empty `balanceEntry`; it throws `Trustline for <asset> not found for
 * <address>`. STE-68's first live seed run (2026-09-25) failed at S.2 on that:
 * the step branched on an empty `balanceEntry`, so its `addTrustline` call was
 * unreachable and a run with a fresh organiser could never pass.
 *
 * Kept in its own module, free of `@sterunxyz/sdk`, so the tests can import it
 * without the SDK build harness.ts needs. The web app makes the same narrow
 * match for the same reason (`fe/src/lib/wallet/susd.ts`): a slow or unhappy
 * node must never be read as "this wallet holds nothing".
 */
import type { Asset } from "@stellar/stellar-sdk";

export const NO_TRUSTLINE = /^Trustline for .+ not found for /;

/** The one call these two reads make, so a test can stand in for the node. */
export interface BalanceReader {
  getAssetBalance(
    address: string,
    asset: Asset,
    passphrase: string,
  ): Promise<{ balanceEntry?: { amount: string } | null }>;
}

function isNoTrustline(error: unknown): boolean {
  return error instanceof Error && NO_TRUSTLINE.test(error.message);
}

/** Does `address` hold a trustline for `asset`? Every other failure still throws. */
export async function readHasTrustline(
  reader: BalanceReader,
  address: string,
  asset: Asset,
  passphrase: string,
): Promise<boolean> {
  try {
    const { balanceEntry } = await reader.getAssetBalance(address, asset, passphrase);
    return Boolean(balanceEntry);
  } catch (error) {
    if (isNoTrustline(error)) return false;
    throw error;
  }
}

/** The address's balance of `asset`; no trustline is a zero balance, not a failure. */
export async function readBalance(
  reader: BalanceReader,
  address: string,
  asset: Asset,
  passphrase: string,
): Promise<bigint> {
  try {
    const { balanceEntry } = await reader.getAssetBalance(address, asset, passphrase);
    return balanceEntry ? BigInt(balanceEntry.amount) : 0n;
  } catch (error) {
    if (isNoTrustline(error)) return 0n;
    throw error;
  }
}
