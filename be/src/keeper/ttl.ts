/**
 * STE-16 (C8) — the TTL keeper.
 *
 * ## Why this job exists
 *
 * Soroban storage is rented. A persistent entry has a time-to-live measured in
 * ledgers, and when it lapses the entry is **archived** — not deleted, but no
 * longer readable until somebody pays to restore it. A race record is exactly
 * the kind of state that threatens: the product promise is a history that
 * outlives the event by years, and nobody is going to touch a 2026 finisher's
 * record in 2028.
 *
 * The contracts already do their share (SYSTEM_DESIGN.md §3.4): every mutating
 * call extends what it touches, and `extend_record_ttl` is permissionless so
 * anyone can pay. This job is the part that runs when nobody does.
 *
 * ## Why it extends ledger keys rather than calling `extend_record_ttl`
 *
 * `RaceRecord::extend_record_ttl(token_id)` bumps two things: the contract
 * instance, and `DataKey::Record(token_id)`. It does **not** bump OpenZeppelin's
 * `NFTStorageKey::Owner(token_id)` or the `Enumerable` per-owner index, because
 * those live under a different crate's keys and the function never touches
 * them. A record whose `Record` entry is alive and whose `Owner` entry has
 * archived still breaks `verify` and `records_of` — which is most of what the
 * record is for.
 *
 * So the keeper works in ledger keys and uses `ExtendFootprintTTLOp`, which is
 * also what the ticket asks for. It learns the keys by **simulating the reads**
 * (`ChainReader.recordFootprint`) and taking the footprint the host computed,
 * rather than reconstructing `DataKey::Record(id)` and OZ's key layout by hand.
 * A keeper that extends a key it built wrong reports success every week while
 * the record archives underneath it, and that failure is silent for months.
 *
 * ## Numbers
 *
 * The thresholds match the contract's own (`sc/contracts/race_record/src/lib.rs`)
 * on purpose: extending to a different horizon than the contract does would make
 * "when does this expire" depend on which of the two touched it last.
 */
import type { xdr } from "@stellar/stellar-sdk";

/** ~5s per ledger, the same constant the contracts use. */
export const DAY_IN_LEDGERS = 17_280;
/** Below ~120 days remaining, pay. Matches `BUMP_THRESHOLD`. */
export const DEFAULT_THRESHOLD_LEDGERS = 120 * DAY_IN_LEDGERS;
/**
 * Extend to ~180 days. Matches `BUMP_TO`, and is the network's maximum entry
 * TTL — if a future network lowers `max_entry_ttl`, this and the contract's
 * constant both have to come down or the operation starts failing.
 */
export const DEFAULT_EXTEND_TO_LEDGERS = 180 * DAY_IN_LEDGERS;
/**
 * Ledger keys per extension transaction.
 *
 * Bounded by the transaction's Soroban resource limits rather than by anything
 * here, so this is deliberately well under any of them: a batch that is refused
 * for size wastes a fee and leaves the whole batch un-extended.
 */
export const DEFAULT_KEYS_PER_TRANSACTION = 25;
/** getLedgerEntries takes many keys per call, but not unbounded. */
export const DEFAULT_KEYS_PER_QUERY = 100;

/** One entry's TTL as RPC reports it. */
export interface KeyTtl {
  /** The key, base64 XDR — usable as a Map key, unlike the object. */
  id: string;
  key: xdr.LedgerKey;
  /**
   * Last ledger at which the entry is still live, or `null` when RPC does not
   * serve it: either archived, or never written.
   */
  liveUntilLedgerSeq: number | null;
}

export interface TtlSelection {
  /** Below the threshold and still live — the ones to pay for. */
  due: KeyTtl[];
  /** Comfortably alive. Nothing to do. */
  alive: KeyTtl[];
  /**
   * Not served by RPC. Extending cannot help these — `ExtendFootprintTTLOp`
   * skips what it cannot see — so they go in the run log and the operator
   * follows the restore runbook in be/OPERATIONS.md.
   */
  missing: KeyTtl[];
}

/**
 * Split the scan into work, no-work, and trouble.
 *
 * Pure, and the reason the keeper's decision-making is testable without a
 * network: the arithmetic that decides whether Sterun pays rent this week is
 * three comparisons, and they are all here.
 */
export function selectDueKeys(
  entries: KeyTtl[],
  atLedger: number,
  thresholdLedgers: number,
): TtlSelection {
  const due: KeyTtl[] = [];
  const alive: KeyTtl[] = [];
  const missing: KeyTtl[] = [];

  for (const entry of entries) {
    if (entry.liveUntilLedgerSeq === null) {
      missing.push(entry);
      continue;
    }
    // Remaining can be negative: RPC still answers for an entry whose TTL has
    // lapsed but which has not been evicted yet. That is due, urgently.
    const remaining = entry.liveUntilLedgerSeq - atLedger;
    if (remaining < thresholdLedgers) due.push(entry);
    else alive.push(entry);
  }

  return { due, alive, missing };
}

/** Fixed-size chunks, order preserved. Rejects a size of zero rather than looping forever. */
export function batch<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`batch size must be a positive integer, got ${size}`);
  }
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
