/**
 * STE-13 — the directory and the event page, as React Query reads.
 *
 * Both are plain chain reads through the read-only client, so neither is gated
 * on a wallet (ARCHITECTURE.md §4.5). What React Query adds here is the part
 * that matters against a public testnet node: one in-flight request per key
 * however many components ask, a cache that survives navigating to an event and
 * back, and a retry that does not need writing by hand.
 */
import { useQuery } from "@tanstack/react-query";

import { getEventSummary, listEvents, type EventDirectory, type EventSummary } from "@/lib/events";
import { readClient } from "@/lib/sterun";

/**
 * How long a read stays fresh.
 *
 * Thirty seconds is roughly six ledgers, and it is a deliberate compromise: the
 * numbers on this page (slots left, event status) change when somebody sends a
 * transaction, not on a clock, so polling harder mostly means more load on a
 * public node for the same answer. Anything that must be exactly current at the
 * moment it is used, above all a quota, is re-read at that moment rather than
 * trusted from this cache (ARCHITECTURE.md §5.1).
 */
const STALE_MS = 30_000;

export const eventKeys = {
  all: ["events"] as const,
  one: (eventId: number) => ["events", eventId] as const,
};

/** Every event in the registry, sorted for the directory. */
export function useEvents() {
  return useQuery<EventDirectory>({
    queryKey: eventKeys.all,
    queryFn: () => listEvents(readClient),
    staleTime: STALE_MS,
  });
}

/**
 * One event and its categories.
 *
 * `enabled` guards a non-numeric id because the id arrives from the URL, where
 * `/events/banana` is one typo away. Without it the page would fire a contract
 * call with `NaN` and render a network error for what is really a bad link.
 */
export function useEvent(eventId: number) {
  return useQuery<EventSummary>({
    queryKey: eventKeys.one(eventId),
    queryFn: () => getEventSummary(readClient, eventId),
    enabled: Number.isInteger(eventId) && eventId >= 0,
    staleTime: STALE_MS,
  });
}

/**
 * The add-ons an event holds on chain: what each costs and how many are left.
 *
 * A separate read from the event itself because it fails separately and is
 * worth showing separately: an older event has none at all, and a node that
 * will not answer this one should not take the categories down with it.
 *
 * Kept fresher than the rest of the page. `unitsLeft` is the number that
 * decides whether an entry is about to revert `AddOnQuotaFull`, and a stale
 * one is the difference between a picker that offers a sold-out size and one
 * that does not.
 */
export function useEventAddOns(eventId: number) {
  return useQuery({
    queryKey: [...eventKeys.one(eventId), "add-ons"],
    queryFn: () => readClient.listAddOns(eventId),
    staleTime: 10_000,
  });
}
