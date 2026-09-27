"use client";

/**
 * The races this wallet may scan, and the rosters this phone already holds.
 *
 * ## Which races
 *
 * The chain has no "races I scan for" query: `is_scanner` takes one event and
 * one address. So the directory is read the way the rest of `fe` reads it, and
 * each race still worth a desk (not cancelled, not completed) is asked once.
 * The organiser counts too, because the roster route lets them in
 * (`be/src/routes/roster.ts`), and a small race run by one person is a real
 * case.
 *
 * A race whose check fails to answer is left out rather than shown. Offering a
 * download the backend will refuse is a worse screen than a shorter list, and
 * the list is refetched on the next visit.
 *
 * ## Rosters on this phone
 *
 * Read from IndexedDB and listed even with no signal and no wallet: a
 * volunteer who reloads at the venue must still be able to open the desk.
 */
import { useQuery } from "@tanstack/react-query";

import { useEvents } from "@/hooks/useEvents";
import { readClient } from "@/lib/chain/sterun";
import type { EventSummary } from "@/lib/event/events";

import { listRosters } from "../lib/scanner-store";

export const scannerKeys = {
  rosters: ["scanner", "rosters"] as const,
  scannable: (address: string | null) => ["scanner", "scannable", address] as const,
};

const DESK_STATUSES = new Set(["Draft", "Open", "Closed"]);

export function useScannableEvents(address: string | null) {
  const events = useEvents();

  return useQuery<EventSummary[]>({
    queryKey: [...scannerKeys.scannable(address), events.data?.events.length ?? 0],
    enabled: address !== null && events.isSuccess,
    staleTime: 30_000,
    queryFn: async () => {
      const candidates = (events.data?.events ?? []).filter((summary) =>
        DESK_STATUSES.has(summary.event.status),
      );
      const allowed = await Promise.all(
        candidates.map(async (summary) => {
          if (summary.event.organiser === address) return true;
          try {
            return await readClient.isScanner(summary.event.eventId, address!);
          } catch {
            return false;
          }
        }),
      );
      return candidates.filter((_, index) => allowed[index]);
    },
  });
}

export function useStoredRosters() {
  return useQuery({
    queryKey: scannerKeys.rosters,
    queryFn: listRosters,
    staleTime: 0,
  });
}
