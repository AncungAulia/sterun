/**
 * STE-68 — hand race packs over in one signature when the live contract can,
 * one signature each when it cannot.
 *
 * `claim_racepack_many` (STE-66, contracts v2.7) is accepted but, as this is
 * written, not yet installed on the live RaceRecord, and the `@sterunxyz/sdk`
 * on main does not have `claimRacepackMany` yet either. The seed must work on
 * either side of that upgrade without anybody editing it, so it asks both:
 *
 *   the contract   does the deployed wasm export `claim_racepack_many`? Read
 *                  from the wasm's own spec on chain, not from a version
 *                  number somebody wrote down.
 *   the SDK        does this build of `SterunClient` have the method?
 *
 * Only both together mean batch. The contract without the SDK is a stale SDK
 * build (`pnpm --filter @sterunxyz/sdk build`), and the SDK without the
 * contract is the upgrade not having happened; each falls back to single calls
 * and says which it was. A batch is not atomic (INTERFACE.md v2.7): a pack
 * another desk already handed over comes back as skipped, never as a revert.
 *
 * No runtime import of `@sterunxyz/sdk` here, so the choice is tested without it.
 */
import { contract } from "@stellar/stellar-sdk";

/**
 * Does this wasm export `fn`? `null` when the bytes are not a contract with a
 * readable spec, which a caller must treat as "do not assume".
 */
export function wasmExports(wasm: Uint8Array, fn: string): boolean | null {
  let spec: contract.Spec;
  try {
    spec = contract.Spec.fromWasm(Buffer.from(wasm));
  } catch {
    return null;
  }
  try {
    spec.getFunc(fn); // throws when the spec has no such function
    return true;
  } catch {
    return false;
  }
}

/** The contract's cap, `TooManyClaims(109)` above it (INTERFACE.md v2.7). */
export const CLAIM_MAX_BATCH = 100;

export type ClaimPath =
  | { kind: "batch"; why: string }
  | { kind: "single"; why: string };

export function chooseClaimPath(contractHasBatch: boolean | null, sdkHasBatch: boolean): ClaimPath {
  if (contractHasBatch === true && sdkHasBatch) {
    return { kind: "batch", why: "the live RaceRecord exports claim_racepack_many and this SDK build has claimRacepackMany" };
  }
  if (contractHasBatch === true) {
    return { kind: "single", why: "the live RaceRecord exports claim_racepack_many, but this SDK build has no claimRacepackMany: rebuild the SDK (pnpm --filter @sterunxyz/sdk build) after pulling STE-66" };
  }
  if (contractHasBatch === null) {
    return { kind: "single", why: "could not read the live RaceRecord's exported functions, so the batch is not assumed" };
  }
  return { kind: "single", why: "the live RaceRecord does not export claim_racepack_many yet (STE-66 not upgraded)" };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`size must be a positive whole number, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The two ways a desk can send, as `SterunClient` exposes them. */
export interface ClaimClient {
  claimRacepack(tokenId: number, operator: string, options?: unknown): Promise<{ txHash: string }>;
  // Method syntax, like `claimRacepack` above, and not a function property:
  // under `strictFunctionTypes` a property's parameters are checked
  // contravariantly, so `options?: unknown` would reject the real
  // `SterunClient.claimRacepackMany`, whose `options` is the precise
  // `CallOptions`. Methods are bivariant, which is what this structural
  // "does the build have it" type needs (STE-66).
  claimRacepackMany?(
    tokenIds: readonly number[],
    operator: string,
    options?: unknown,
  ): Promise<{ txHash: string; value: { tokenId: number; reason: string }[] }>;
}

export function sdkHasBatch(client: object): boolean {
  return typeof (client as ClaimClient).claimRacepackMany === "function";
}

export interface ClaimOutcome {
  path: ClaimPath;
  txs: { label: string; hash: string }[];
  /** Packs a batch did not hand over, and why (`not-entered` = another desk got there first). */
  skipped: { tokenId: number; reason: string }[];
}

export async function claimRacepacks(
  client: ClaimClient,
  tokenIds: readonly number[],
  operator: string,
  options: unknown,
  path: ClaimPath,
): Promise<ClaimOutcome> {
  const out: ClaimOutcome = { path, txs: [], skipped: [] };
  if (path.kind === "batch" && client.claimRacepackMany) {
    for (const batch of chunk(tokenIds, CLAIM_MAX_BATCH)) {
      const sent = await client.claimRacepackMany(batch, operator, options);
      out.txs.push({ label: `claim_racepack_many ×${batch.length} (tokens ${batch.join(", ")})`, hash: sent.txHash });
      out.skipped.push(...sent.value);
    }
    return out;
  }
  for (const tokenId of tokenIds) {
    const sent = await client.claimRacepack(tokenId, operator, options);
    out.txs.push({ label: `claim_racepack token ${tokenId}`, hash: sent.txHash });
  }
  return out;
}
