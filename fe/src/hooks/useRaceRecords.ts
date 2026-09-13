"use client";

/**
 * One indexer read per race, in parallel.
 *
 * `useQueries` rather than one query over all of them, so a race whose read
 * fails leaves the others alone: the dashboard draws a sparkline per race and
 * one unreachable page should cost one line, not the page.
 */
import { useQueries } from "@tanstack/react-query";

import { fetchEventRecords, type IndexedRecord } from "@/lib/records";

const STALE_MS = 60_000;

export function useRaceRecords(eventIds: readonly number[]): Map<number, IndexedRecord[]> {
  const results = useQueries({
    queries: eventIds.map((eventId) => ({
      queryKey: ["race-records", eventId] as const,
      queryFn: () => fetchEventRecords(eventId),
      staleTime: STALE_MS,
      retry: false,
    })),
  });

  const byEvent = new Map<number, IndexedRecord[]>();
  results.forEach((result, index) => {
    // Only a resolved read is entered. An absent key means "not answered", and
    // `buildNeeds` treats that as silence rather than as a finding.
    if (result.data) byEvent.set(eventIds[index], result.data);
  });
  return byEvent;
}
