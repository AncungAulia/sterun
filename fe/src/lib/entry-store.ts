/**
 * What this browser keeps about an entry it made (STE-21).
 *
 * ## Why IndexedDB
 *
 * The name on the bib and the receipt code are on no chain and returned by no
 * route, so this is the only place the success page can read them after a
 * refresh. Round 2's pass reads the check-in secret from here too, and has to
 * work with no network at the start line, which is what IndexedDB is for.
 *
 * ## What is not here
 *
 * Personal details: no name, identity number, email, phone or date of birth.
 * `entry-store.test.ts` checks the shape. Losing the device is recovered in
 * round 2 by re-fetching the secret with the owning wallet (STE-52).
 *
 * ## `confirmed`
 *
 * Set when the Sign and pay dialog's third step links the vault row to the
 * token. A link that fails leaves it false and the entry stands anyway, because
 * it is already real on chain; nothing on this device retries it, and the
 * backend is to link such rows from the chain (STE-59).
 */
import { createStore, get, set, update, values, type UseStore } from "idb-keyval";

export interface StoredEntry {
  eventId: number;
  categoryId: number;
  tokenId: number;
  bibNo: number;
  bibName: string;
  raceName: string;
  /** Unix seconds, as a decimal string. */
  startsAt: string;
  distanceCode: string;
  participantHash: string;
  /** The receipt code. */
  salt: string;
  totpSecret: string;
  /** Empty when the entry was found by the no-answer check rather than returned. */
  txHash: string;
  runner: string;
  /** ISO 8601. */
  enteredAt: string;
  confirmed: boolean;
  /** The vault row, kept so confirming can be retried. */
  participantId?: string;
  /**
   * What came with the entry, as the receipt prints it: "Event jersey M". The
   * chain holds add-on ids, not names or sizes, so this is the only copy.
   * Optional, like `paidStroops`, so a receipt still renders without it.
   */
  racePack?: string[];
  /** What `enter` charged, in stroops, as a decimal string. */
  paidStroops?: string;
  /**
   * The runner ticked "I've saved my receipt". Kept so a return visit through
   * View my entry does not ask again or celebrate again (Ancung, 2026-09-15).
   */
  receiptSaved?: boolean;
}

let store: UseStore | null = null;

/**
 * Created on first use rather than at import: a module that touches IndexedDB
 * as it loads breaks server rendering, where there is none.
 */
function entries(): UseStore {
  store ??= createStore("sterun-entries", "entries");
  return store;
}

export async function saveEntry(entry: StoredEntry): Promise<void> {
  await set(entry.tokenId, entry, entries());
}

export async function readEntry(tokenId: number): Promise<StoredEntry | undefined> {
  return get<StoredEntry>(tokenId, entries());
}

/**
 * Sets fields on a stored entry inside one transaction.
 *
 * Read and write as two separate steps let two updates landing together (the
 * link after paying and the receipt tick) each put back the flag the other had
 * just set, so a runner was asked about their receipt again (2026-09-15).
 * idb-keyval's `update` reads and writes in the same transaction. An entry
 * this device does not hold is left absent.
 */
async function patchEntry(tokenId: number, changes: Partial<StoredEntry>): Promise<void> {
  await update<StoredEntry | undefined>(
    tokenId,
    (entry) => (entry ? { ...entry, ...changes } : entry),
    entries(),
  );
}

export async function markConfirmed(tokenId: number): Promise<void> {
  await patchEntry(tokenId, { confirmed: true });
}

export async function markReceiptSaved(tokenId: number): Promise<void> {
  await patchEntry(tokenId, { receiptSaved: true });
}

export async function unconfirmedEntries(): Promise<StoredEntry[]> {
  // `update` stores `undefined` under a key it was asked about but never held.
  return (await values<StoredEntry | undefined>(entries())).filter(
    (entry): entry is StoredEntry => entry !== undefined && !entry.confirmed,
  );
}
