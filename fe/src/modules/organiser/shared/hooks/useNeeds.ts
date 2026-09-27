"use client";

/**
 * The needs list, assembled from three reads.
 *
 * The two request lists are deliberately narrow: scanner lists only for races
 * close enough for the answer to matter, records only for races that have
 * already run. An organiser with a year of races should not pay for all of them
 * on every page load.
 *
 * `useNowSeconds()` is `bigint | undefined`: its server snapshot is `undefined`,
 * so the first render has no clock at all. The guard below is what stops a race
 * being called overdue during hydration, and the `?? 0n` above it only exists to
 * keep the two request lists typed while that is true.
 */
import { useEvents } from "@/hooks/useEvents";
import { useNowSeconds } from "@/hooks/useNowSeconds";
import { useRaceRecords } from "@/modules/organiser/shared/hooks/useRaceRecords";
import { useScannerCounts } from "@/modules/organiser/shared/hooks/useScannerCounts";
import { finishedCount } from "@/modules/organiser/shared/lib/records";
import {
  buildNeeds,
  racesToAskAboutResults,
  racesToAskAboutScanners,
  type Need,
} from "@/modules/organiser/shared/lib/needs";

export function useNeeds(address: string | null): Need[] {
  const { data } = useEvents();
  const nowS = useNowSeconds();

  const mine = data?.events.filter(({ event }) => event.organiser === address) ?? [];
  const now = nowS ?? 0n;

  /*
    With no clock yet these are both empty, because every race is in the future
    against a `now` of zero and none of them is inside the scanner window. So
    the first render asks the indexer for nothing, and the real lists go out on
    the render that follows hydration.
  */
  const scannerIds = racesToAskAboutScanners(mine, now);
  const resultIds = racesToAskAboutResults(mine, now);

  const scannerCounts = useScannerCounts(scannerIds);
  const records = useRaceRecords(resultIds);

  const resultCounts = new Map<number, number>();
  for (const [eventId, rows] of records) resultCounts.set(eventId, finishedCount(rows));

  if (nowS === undefined) return [];
  return buildNeeds({ events: mine, nowS: now, scannerCounts, resultCounts });
}
