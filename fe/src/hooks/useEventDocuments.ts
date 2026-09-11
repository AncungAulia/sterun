/**
 * Every event's document, for the directory.
 *
 * One query per event, built from `metadataQuery`: the same cache entry the
 * event page reads, so opening a race after browsing does not fetch or hash its
 * document again. The hash check is not relaxed here either. A `modified` or
 * `unavailable` document is simply absent, and the card says "No image"
 * (WEB_APP_IA.md §6: an unproven document is not shown at all).
 */
import { useQueries } from "@tanstack/react-query";

import { metadataQuery } from "@/hooks/useEventMetadata";
import type { EventSummary } from "@/lib/events";
import type { EventMetadata } from "@/lib/metadata";

export interface EventDocuments {
  /** Event id to its verified document, or null when there is none to show. */
  byEvent: ReadonlyMap<number, EventMetadata | null>;
  /** Events whose document has not answered yet. */
  pending: ReadonlySet<number>;
  /** True once no document is still on its way. */
  settled: boolean;
}

export function useEventDocuments(events: readonly EventSummary[]): EventDocuments {
  return useQueries({
    queries: events.map(({ event }) => metadataQuery(event.uri, event.metadataHash)),
    combine: (results) => {
      const byEvent = new Map<number, EventMetadata | null>();
      const pending = new Set<number>();
      results.forEach((result, index) => {
        const event = events[index]?.event;
        if (!event) return;
        // A query without a uri is disabled: it reports "pending" for ever and
        // never fetches. There is nothing to wait for, so it counts as answered.
        if (event.uri.length > 0 && result.isPending) pending.add(event.eventId);
        byEvent.set(
          event.eventId,
          result.data?.status === "verified" ? result.data.document : null,
        );
      });
      return { byEvent, pending, settled: pending.size === 0 };
    },
  });
}
