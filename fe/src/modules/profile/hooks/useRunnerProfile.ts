"use client";

/**
 * Everything the profile page reads, in the order it can fail.
 *
 * 1. **The records**, `recordsOfDetailed(address)` over RPC. The page's truth.
 *    If this fails the page says it could not look (P11); it never says the
 *    runner has no races, because `records_of` never reverts and an empty list
 *    is a real answer that an RPC failure must not impersonate.
 * 2. **The races**, one `getEventSummary` per distinct event, in the same cache
 *    entry `/events/[id]` uses. A race that will not answer costs its card a
 *    name, never the card.
 * 3. **The documents**, for the city, hash-checked like everywhere else. An
 *    unproven document contributes nothing.
 *
 * The index's transaction links are read per card by `useRecordTrail`, only
 * for the page on screen.
 */
import { useQueries, useQuery } from "@tanstack/react-query";

import { eventKeys } from "@/hooks/useEvents";
import { metadataQuery } from "@/hooks/useEventMetadata";
import { readClient } from "@/lib/chain/sterun";
import { getEventSummary, type EventSummary } from "@/lib/event/events";

import { newestFirst } from "../lib/profile-summary";

export const profileKeys = {
  records: (address: string) => ["runner-profile", address] as const,
};

export function useRunnerProfile(address: string) {
  const records = useQuery({
    queryKey: profileKeys.records(address),
    queryFn: async () => newestFirst(await readClient.recordsOfDetailed(address)),
    staleTime: 30_000,
  });

  const eventIds = [...new Set((records.data ?? []).map((record) => record.eventId))];

  const events = useQueries({
    queries: eventIds.map((eventId) => ({
      queryKey: eventKeys.one(eventId),
      queryFn: () => getEventSummary(readClient, eventId),
      staleTime: 30_000,
    })),
  });

  const summaries = new Map<number, EventSummary>();
  events.forEach((query, index) => {
    if (query.data) summaries.set(eventIds[index]!, query.data);
  });

  const documentTargets = [...summaries.values()].filter((summary) => summary.event.uri.length > 0);
  const documents = useQueries({
    queries: documentTargets.map((summary) => metadataQuery(summary.event.uri, summary.event.metadataHash)),
  });

  const cities = new Map<number, string>();
  documents.forEach((query, index) => {
    const city = query.data?.status === "verified" ? query.data.document.location?.city?.trim() : undefined;
    if (city) cities.set(documentTargets[index]!.event.eventId, city);
  });

  return {
    records,
    summaryOf: (eventId: number) => summaries.get(eventId) ?? null,
    cityOf: (eventId: number) => cities.get(eventId) ?? null,
    /** True while any race this page needs is still being read. */
    racesLoading: events.some((query) => query.isPending),
  };
}
