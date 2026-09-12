/**
 * Every event's document, for the directory.
 *
 * One query per document, built from `metadataQuery`: the same cache entry the
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

/** The same uri and hash is the same document, and the same query key. */
function documentKey(uri: string, metadataHash: string): string {
  return `${metadataHash}\n${uri}`;
}

export function useEventDocuments(events: readonly EventSummary[]): EventDocuments {
  // Asked once per distinct document, not once per event. Two events can name
  // the same one, and useQueries matches its observers by key, so a repeated
  // key is warned about and can hand one event's slot the other's result.
  // An event without a uri gets no query at all: there is nothing to fetch.
  const documents = new Map<string, { uri: string; metadataHash: string }>();
  for (const { event } of events) {
    if (event.uri.length === 0) continue;
    documents.set(documentKey(event.uri, event.metadataHash), {
      uri: event.uri,
      metadataHash: event.metadataHash,
    });
  }
  const wanted = [...documents.entries()];

  return useQueries({
    queries: wanted.map(([, document]) => metadataQuery(document.uri, document.metadataHash)),
    combine: (results) => {
      const resultByKey = new Map(wanted.map(([key], index) => [key, results[index]]));
      const byEvent = new Map<number, EventMetadata | null>();
      const pending = new Set<number>();
      for (const { event } of events) {
        const result = resultByKey.get(documentKey(event.uri, event.metadataHash));
        if (result?.isPending) pending.add(event.eventId);
        byEvent.set(
          event.eventId,
          result?.data?.status === "verified" ? result.data.document : null,
        );
      }
      return { byEvent, pending, settled: pending.size === 0 };
    },
  });
}
