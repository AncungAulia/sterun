/**
 * Who may check runners in for a race, as the index reconstructs it.
 *
 * The chain cannot answer this: `is_scanner` takes an address and there is
 * nothing that enumerates (`be/CLAUDE.md`, the scanner list). Two fields are
 * read as optional because the index does not send them yet, when a scanner
 * was added and how many runners it checked in (STE-43). A table that waited
 * for them would not exist; a table that invented them would lie.
 */
import { apiFetch } from "@/lib/api/client";

export interface IndexedScanner {
  address: string;
  addedLedger: number;
  /** Unix seconds. `null` until the index sends it. */
  addedAt: bigint | null;
  /** Race packs this device handed out. `null` until the index sends it. */
  scans: number | null;
}

interface ScannerJson {
  address: string;
  added_ledger: number;
  /**
   * Optional for an index older than STE-43, and `null` from one that has it
   * but could not date this scanner (one recovered by a rebuild). Both read as
   * "no date"; `BigInt(null)` would throw and take the whole tab down.
   */
  added_at?: string | null;
  scans?: number;
}

export async function fetchScanners(eventId: number): Promise<IndexedScanner[]> {
  const body = await apiFetch<{ scanners: ScannerJson[]; last_ledger: number }>(
    `/events/${eventId}/scanners`,
  );
  return body.scanners.map((row) => ({
    address: row.address,
    addedLedger: row.added_ledger,
    addedAt: row.added_at === undefined || row.added_at === null ? null : BigInt(row.added_at),
    scans: row.scans ?? null,
  }));
}
