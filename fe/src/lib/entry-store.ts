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
  /**
   * What the pass learned from the chain the last time this device had signal
   * (STE-21 round 2). A venue has none, so the pass draws its state from here
   * and corrects it whenever a read succeeds.
   */
  state?: string;
  /** Unix seconds, as a decimal string, when the race pack was collected. */
  claimedAt?: string;
  /** From the race's document, which round 1 never read. Absent until one online visit. */
  city?: string;
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
 * The newest entry this device holds, or undefined.
 *
 * What the installed app opens at (`app/(offline)/pass/page.tsx`): a manifest
 * has one `start_url` for the whole origin and cannot know a token id, so the
 * id is looked up here instead. Newest by `enteredAt`, with the token id as
 * the tie-break, since ids only ever go up and an entry saved by an older
 * build may have no date at all.
 */
export async function latestEntry(): Promise<StoredEntry | undefined> {
  const all = await values<StoredEntry>(entries());
  return all
    .filter((entry) => typeof entry?.tokenId === "number")
    .sort((a, b) => {
      const byDate = Date.parse(b.enteredAt ?? "") || 0;
      const mine = Date.parse(a.enteredAt ?? "") || 0;
      return byDate === mine ? b.tokenId - a.tokenId : byDate - mine;
    })
    .at(0);
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

/**
 * Adds what the pass read from the chain or from the race's document.
 *
 * Only the fields it was given: one online visit reads the record and another
 * reads the document, and neither may undo the other. Written in the same
 * transaction as the read, like the receipt tick, and an entry this device does
 * not hold is left absent rather than invented.
 */
export async function rememberPassFacts(
  tokenId: number,
  facts: { state?: string; claimedAt?: string; city?: string; bibNo?: number },
): Promise<void> {
  const given = Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== undefined));
  await update<StoredEntry | undefined>(
    tokenId,
    (entry) => (entry ? { ...entry, ...given } : entry),
    entries(),
  );
}
