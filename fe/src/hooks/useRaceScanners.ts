"use client";

/**
 * One race's scanners. The key is the one `useScannerCounts` uses, so the bell
 * and the Scanners tab read one cache entry and a scanner added on the tab
 * clears the bell's warning without a reload.
 */
import { useQuery } from "@tanstack/react-query";

import { fetchScanners } from "@/lib/scanners";

export function useRaceScanners(eventId: number) {
  return useQuery({
    queryKey: ["scanners", eventId] as const,
    queryFn: () => fetchScanners(eventId),
    staleTime: 60_000,
    retry: false,
  });
}
