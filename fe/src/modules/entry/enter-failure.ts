/**
 * Why `enter` did not go through, told from the ledger rather than the error
 * code (STE-21).
 *
 * ## Why not decode the code
 *
 * An error code out of `enter` cannot name its contract. `enter` hands control
 * to the sUSD token, which numbers its own errors in EventRegistry's `1..=99`
 * band, so reading `#5` as "this distance is full" could be a confident lie
 * about a payment that failed (`lib/errors.ts`, `OUR_OWN_METHODS`, which still
 * leaves `enter` out).
 *
 * ## What can be trusted instead
 *
 * The state of the ledger after the refusal. If the distance now has no places,
 * "this distance just sold out" is true whichever contract said no. The checks
 * run in the order a runner can do something about them: a closed race ends
 * the attempt, a full distance or item sends them back to step 1, and a short
 * balance can be fixed on the spot.
 *
 * Declines and no-answers are read first, from the error, because neither is a
 * refusal and the chain has nothing to add to them.
 */
import { friendlyError, isDeclined, isNoAnswer } from "@/lib/errors";
import { shortfall, type SusdBalance } from "@/lib/susd";
import type { EventStatus } from "@sterunxyz/sdk";

/** The chain, re-read after a refusal. `useEntryAttempt` assembles it. */
export interface ChainAfter {
  status: EventStatus;
  /** Places left on the distance the runner chose. */
  slotsLeft: number;
  /** Names of the reserved items whose units ran out. */
  soldOutAddOns: string[];
  balance: SusdBalance;
  /** What the entry would have charged, in stroops. */
  total: bigint;
}

export type EnterFailure =
  | { kind: "declined" }
  | { kind: "no-answer" }
  | { kind: "closed" }
  | { kind: "sold-out" }
  | { kind: "add-on-sold-out"; names: string[] }
  | { kind: "short"; needed: bigint }
  | { kind: "other"; message: string };

/**
 * `after` is null when re-reading the chain itself failed. That falls to the
 * plain sentence: with nothing trustworthy to say, saying nothing specific is
 * the honest answer.
 */
export function classifyEnterFailure(error: unknown, after: ChainAfter | null): EnterFailure {
  if (isNoAnswer(error)) return { kind: "no-answer" };
  if (isDeclined(error)) return { kind: "declined" };

  if (after) {
    if (after.status !== "Open") return { kind: "closed" };
    if (after.slotsLeft === 0) return { kind: "sold-out" };
    if (after.soldOutAddOns.length > 0) return { kind: "add-on-sold-out", names: after.soldOutAddOns };
    const needed = shortfall(after.balance, after.total);
    if (needed > 0n) return { kind: "short", needed };
  }

  return { kind: "other", message: friendlyError(error) };
}
