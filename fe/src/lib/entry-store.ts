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
 * Linking the vault row to the token is retried in the background, because the
 * entry is already real on chain when that call fails, and blocking a runner
 * who has paid on a backend hiccup would be the wrong way round.
 */
import { createStore, get, set, values, type UseStore } from "idb-keyval";

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

export async function markConfirmed(tokenId: number): Promise<void> {
  const entry = await readEntry(tokenId);
  if (entry) await saveEntry({ ...entry, confirmed: true });
}

export async function unconfirmedEntries(): Promise<StoredEntry[]> {
  return (await values<StoredEntry>(entries())).filter((entry) => !entry.confirmed);
}
