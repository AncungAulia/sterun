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
 * ## No link state
 *
 * Linking the vault row to the token is the backend's, from the chain (STE-59),
 * so nothing here tracks or retries it. Entries saved before that may still
 * carry a `confirmed` field; it is ignored.
 */
import { createStore, get, set, update, type UseStore } from "idb-keyval";

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
  /** The vault row this entry's details went into. */
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
 * Read and written in one transaction (idb-keyval `update`), so it cannot put
 * an older copy of the entry back over a write that landed in between. An
 * entry this device does not hold is left absent.
 */
export async function markReceiptSaved(tokenId: number): Promise<void> {
  await update<StoredEntry | undefined>(
    tokenId,
    (entry) => (entry ? { ...entry, receiptSaved: true } : entry),
    entries(),
  );
}
