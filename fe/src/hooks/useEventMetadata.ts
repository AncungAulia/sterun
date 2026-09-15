/**
 * STE-13 — the off-chain event document, fetched and checked against the hash
 * the chain committed to.
 *
 * Separate from `useEvent` because the two have nothing in common but an event:
 * one is an RPC simulation against a Soroban node, the other an HTTP GET to
 * whatever host the organiser chose. That host is frequently a parked domain or
 * a dead link, and a failure there must not take the event page with it.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";

import { fetchEventMetadata, type MetadataResult } from "@/lib/metadata";

/**
 * Events are frozen once created (WEB_APP_IA.md §2.2), so a document that
 * verifies once verifies forever. There is nothing to refetch.
 */
const FOREVER = Number.POSITIVE_INFINITY;

/**
 * The query for one document, shared by the event page and the directory. Both
 * read the same cache entry, so a race opened from the directory already has
 * its document verified.
 */
export function metadataQuery(uri: string, metadataHash: string) {
  return queryOptions<MetadataResult>({
    // The hash is part of the key, not just the url. A url can be reused by a
    // later event with different content, and reading the previous document out
    // of cache would show one event's poster on another.
    queryKey: ["event-metadata", uri, metadataHash],
    queryFn: () => fetchEventMetadata(uri, metadataHash),
    enabled: uri.length > 0,
    staleTime: FOREVER,
    // fetchEventMetadata reports failure in its result rather than throwing, so
    // a retry would only repeat a request that already answered.
    retry: false,
  });
}

export function useEventMetadata(uri: string, metadataHash: string) {
  return useQuery(metadataQuery(uri, metadataHash));
}
