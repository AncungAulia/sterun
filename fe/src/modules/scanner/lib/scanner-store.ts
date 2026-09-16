/**
 * What a volunteer's phone keeps for a desk with no signal (STE-22).
 *
 * Two things, in two stores, both in IndexedDB because the desk runs for hours
 * and a reload, a locked screen or a flat battery swapped for a power bank must
 * not lose either of them:
 *
 *   - **The roster**, one per event, exactly as it was downloaded. It is the
 *     only thing a code can be checked against at the desk.
 *   - **The claims** this phone has handed a race pack over for. Written before
 *     the verdict is on screen, so a pack handed over is a pack recorded even if
 *     the phone is dropped in the same second.
 *
 * ## What is not here
 *
 * A name. The roster's `name_fragment` ("Budi S.") is the most that ever
 * reaches this phone, because the backend reduces it before it leaves the
 * vault. `__tests__/scanner-store.test.ts` sweeps every stored key to keep it
 * that way.
 *
 * ## Why it lives in the scanner and not in src/lib
 *
 * One user. `entry-store.ts` sits in src/lib because the entry flow and the pass
 * both read it; nothing but the scanner reads this (ARCHITECTURE.md §4.2).
 */
import { createStore, get, set, update, values, type UseStore } from "idb-keyval";

export type RecordState = "Entered" | "RacepackClaimed" | "Finished" | "Dnf";

export interface RosterEntry {
  tokenId: number;
  bibNo: number;
  categoryId: number;
  /** The chain's state when the roster was generated, not now. */
  state: RecordState;
  /** "Budi S.", or null for an entry made before the vault kept one. */
  nameFragment: string | null;
  /** What goes in the race pack: `{ item: "Event jersey", choice: "L" }`. */
  addOns: { item: string; choice: string }[];
  totpSecret: string;
}

export interface StoredRoster {
  eventId: number;
  /**
   * The race's name and its distances, read from the chain at download time.
   * The roster itself carries a category id and nothing else, and the desk has
   * no signal to look a distance up with, so the label a volunteer reads on
   * HAND OVER has to travel with the roster.
   */
  raceName: string;
  categories: { categoryId: number; code: string }[];
  /** The ledger the states above were read at. */
  snapshotLedger: number;
  /** ISO 8601, the backend's clock. */
  generatedAt: string;
  /** ISO 8601, this phone's clock. */
  downloadedAt: string;
  /**
   * This phone's clock minus the backend's, in whole seconds, measured at the
   * moment the download arrived. Positive means the phone is fast.
   */
  driftSeconds: number;
  totp: { digits: number; stepSeconds: number; toleranceSteps: number };
  entries: RosterEntry[];
}

export type ClaimStatus = "waiting" | "sent" | "refused";

export interface QueuedClaim {
  tokenId: number;
  bibNo: number;
  eventId: number;
  /** ISO 8601, when the volunteer got GREEN. */
  scannedAt: string;
  status: ClaimStatus;
  /** Filled in by round 2's sender. */
  txHash?: string;
  ledger?: number;
  reason?: string;
}

let rosters: UseStore | null = null;
let claims: UseStore | null = null;

/** Created on first use: IndexedDB does not exist during server rendering. */
function rosterStore(): UseStore {
  rosters ??= createStore("sterun-scanner-rosters", "rosters");
  return rosters;
}

function claimStore(): UseStore {
  claims ??= createStore("sterun-scanner-claims", "claims");
  return claims;
}

/** Replaces the event's roster whole. A partial merge would mix two snapshots. */
export async function saveRoster(roster: StoredRoster): Promise<void> {
  await set(roster.eventId, roster, rosterStore());
}

export async function readRoster(eventId: number): Promise<StoredRoster | undefined> {
  return get<StoredRoster>(eventId, rosterStore());
}

export async function listRosters(): Promise<StoredRoster[]> {
  return values<StoredRoster>(rosterStore());
}

/**
 * Records a handover. Keyed by token id, and the first write wins: a record
 * can be claimed once, so a second GREEN for the same token (which the verdict
 * already prevents) must not move its place in the queue or reset a row that
 * round 2 has already sent.
 */
export async function enqueueClaim(claim: QueuedClaim): Promise<void> {
  await update<QueuedClaim | undefined>(claim.tokenId, (existing) => existing ?? claim, claimStore());
}

/** This event's claims, in the order they were handed over. */
export async function listClaims(eventId: number): Promise<QueuedClaim[]> {
  const all = await values<QueuedClaim>(claimStore());
  return all
    .filter((claim) => claim.eventId === eventId)
    .sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));
}
