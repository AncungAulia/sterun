"use client";

/**
 * One indexer read per race, in parallel.
 *
 * `useQueries` rather than one query over all of them, so a race whose read
 * fails leaves the others alone: the dashboard draws a sparkline per race and
 * one unreachable page should cost one line, not the page.
 */
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";

import { fetchEventRecords, type IndexedRecord } from "@/modules/organiser/shared/lib/records";

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

/**
 * Whether one race's read has failed, as opposed to not having answered yet.
 *
 * `useRaceRecords` leaves a race out of its map in both cases, and a page that
 * cannot tell them apart either claims a failure while the node is still
 * thinking or reports zero on a timeout. Reads the same cache entry
 * `useRaceRecords` fills, so it costs no request.
 */
export function useRaceRecordsFailed(eventId: number): boolean {
  const client = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => client.getQueryCache().subscribe(onChange),
    [client],
  );
  return useSyncExternalStore(
    subscribe,
    () => client.getQueryState(["race-records", eventId])?.status === "error",
    () => false,
  );
}
