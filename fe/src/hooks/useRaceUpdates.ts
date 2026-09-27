"use client";

/**
 * STE-57 - what changed on a race since it was published: the signed
 * announcements, and when places were raised.
 *
 * Shared because two features touch the same cache entries: the event page
 * reads them, and the console's Add places refreshes them once its raise and
 * announcement land.
 *
 * Both come from the backend, so both are optional to the page. A failed read
 * is no line and no Updates section, never an error over the race: nothing a
 * runner needs to decide is in here that the chain does not already show.
 */
import { useQuery } from "@tanstack/react-query";

import { listAnnouncements } from "@/lib/event/announcements";
import { fetchQuotaHistory } from "@/lib/event/quota-history";

export const raceUpdateKeys = {
  announcements: (eventId: number) => ["announcements", eventId] as const,
  quotaHistory: (eventId: number) => ["quota-history", eventId] as const,
};

const STALE_MS = 60_000;

function validId(eventId: number): boolean {
  return Number.isInteger(eventId) && eventId >= 0;
}

export function useAnnouncements(eventId: number) {
  return useQuery({
    queryKey: raceUpdateKeys.announcements(eventId),
    queryFn: () => listAnnouncements(eventId),
    enabled: validId(eventId),
    staleTime: STALE_MS,
    retry: false,
  });
}

export function useQuotaHistory(eventId: number) {
  return useQuery({
    queryKey: raceUpdateKeys.quotaHistory(eventId),
    queryFn: () => fetchQuotaHistory(eventId),
    enabled: validId(eventId),
    staleTime: STALE_MS,
    retry: false,
  });
}
