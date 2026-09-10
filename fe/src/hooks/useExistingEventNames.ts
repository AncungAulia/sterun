"use client";

/**
 * Every event name the backend index currently knows.
 *
 * Read from `be/` rather than from the chain on purpose. The directory
 * assembles itself by asking the registry for each id in turn (`lib/events.ts`
 * explains why the contract cannot list them), which is one RPC round trip per
 * event — acceptable once for a page, absurd for a field somebody is typing
 * into.
 *
 * Two honest limits, both of which are why this only ever produces a warning:
 * the index lags the chain by a poll, so an event created seconds ago may be
 * missing; and one page is fetched, not all of them, so past the page size the
 * check quietly stops being exhaustive.
 */
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";

/** The backend's own maximum page (`MAX_PAGE` in be/src/routes/directory.ts). */
const PAGE = 200;

interface EventsResponse {
  events: { event_name: string }[];
}

export function useExistingEventNames() {
  const query = useQuery({
    queryKey: ["existing-event-names"],
    queryFn: async () => {
      const body = await apiFetch<EventsResponse>(`/events?limit=${PAGE}`);
      return body.events.map((event) => event.event_name);
    },
    staleTime: 60_000,
    // A warning that cannot be fetched is not an error anybody should see: the
    // wizard works fine without it, and a retry storm behind a text field is
    // worse than not knowing.
    retry: false,
  });

  return query.data ?? [];
}
