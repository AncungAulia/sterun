"use client";

/**
 * When entries stop by themselves, read from the chain.
 *
 * From the chain rather than from the event document, and the difference is the
 * whole point of STE-69: the document's registration window is what runners
 * were promised, and this is what actually refuses an entry. A race published
 * before the contract could hold a date has `null` here while its document
 * still names one, and where the two disagree the enforced date is the one a
 * screen must show.
 *
 * Its own query rather than a field on `getEventSummary`, because the summary
 * is read by the directory for every race on the page, and the close date is
 * wanted by two: the organiser's console and the runner's entry flow. That
 * second reader is why it sits here rather than inside the console's module.
 */
import { useQuery } from "@tanstack/react-query";

import { readClient } from "@/lib/chain/sterun";

export const closesKeys = {
  one: (eventId: number) => ["registration-closes", eventId] as const,
};

export function useRegistrationCloses(eventId: number) {
  return useQuery({
    queryKey: closesKeys.one(eventId),
    queryFn: () => readClient.getRegistrationCloses(eventId),
    staleTime: 30_000,
  });
}
