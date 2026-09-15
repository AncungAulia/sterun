/**
 * This wallet's race records, read from chain (STE-21).
 *
 * Not from the index, and never cached: this is the guard that stops a runner
 * paying twice for one race, and the index lags a new entry by a poll. The
 * entry flow invalidates `runnerRecordsKey` as soon as an entry lands.
 */
import { useQuery } from "@tanstack/react-query";

import { readClient } from "@/lib/sterun";
import type { SterunRecord } from "@sterunxyz/sdk";

export const runnerRecordsKey = (address: string | null) => ["runner-records", address] as const;

export function useRunnerRecords(address: string | null) {
  return useQuery<SterunRecord[]>({
    queryKey: runnerRecordsKey(address),
    queryFn: () => readClient.recordsOfDetailed(address as string),
    enabled: Boolean(address),
    staleTime: 0,
  });
}
