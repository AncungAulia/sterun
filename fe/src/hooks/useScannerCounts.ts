"use client";

/**
 * How many devices are allowed to check runners in, for the races close enough
 * that the answer matters.
 *
 * The chain cannot answer this: `is_scanner` takes an address, so enumerating
 * them means the index (`be/CLAUDE.md`). One request per race, which is why the
 * caller passes a bounded list rather than every race the wallet owns.
 */
import { useQueries } from "@tanstack/react-query";

import { fetchScanners } from "@/lib/scanners";

export function useScannerCounts(eventIds: readonly number[]): Map<number, number> {
  const results = useQueries({
    queries: eventIds.map((eventId) => ({
      queryKey: ["scanners", eventId] as const,
      queryFn: () => fetchScanners(eventId),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const counts = new Map<number, number>();
  results.forEach((result, index) => {
    if (result.data) counts.set(eventIds[index], result.data.length);
  });
  return counts;
}
