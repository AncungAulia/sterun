/**
 * STE-13 — reading the event directory off the chain.
 *
 * EventRegistry has no "list events" method, and it could not have one: a
 * Soroban view returning an unbounded vector is a call that gets slower and
 * more expensive as the protocol succeeds, until one day it exceeds the
 * resource limits and the directory stops loading for everyone. What it has
 * instead is `event_count`, and ids are sequential from zero, so the list is
 * assembled client-side by asking for each id.
 *
 * That fan-out is the reason this lives in `lib/` rather than inside the hook:
 * the interesting behaviour is how it handles a count that does not match what
 * can actually be read, and that deserves tests without a testnet in the loop.
 */
import type { SterunCategory, SterunEvent } from "@sterun/sdk";

/** One directory row: the event, and the categories a runner picks between. */
export interface EventSummary {
  event: SterunEvent;
  categories: SterunCategory[];
}

export interface EventDirectory {
  events: EventSummary[];
  /**
   * Ids the registry counted but would not hand over.
   *
   * Surfaced rather than swallowed. Ledger entries expire on Soroban, so a
   * missing event is a real state the page has to be able to explain instead
   * of quietly showing a shorter list than the chain says exists.
   */
  unreadable: number[];
}

/** Exactly the part of `SterunClient` this module uses. */
export interface EventReader {
  eventCount(): Promise<number>;
  getEvent(eventId: number): Promise<SterunEvent>;
  listCategories(eventId: number): Promise<SterunCategory[]>;
}

/**
 * Every event in the registry, newest race first.
 *
 * Throws if the registry cannot be reached at all. That is deliberate: an
 * unreachable RPC and an empty registry look identical once you return `[]`,
 * and drawing "no events yet" over a network failure is the one lie this page
 * must not tell.
 */
export async function listEvents(
  client: EventReader,
  nowS: bigint = BigInt(Math.floor(Date.now() / 1000)),
): Promise<EventDirectory> {
  const count = await client.eventCount();
  const ids = Array.from({ length: count }, (_, id) => id);

  const results = await Promise.all(ids.map((id) => readEvent(client, id)));

  const events: EventSummary[] = [];
  const unreadable: number[] = [];
  for (const result of results) {
    if (result.summary) events.push(result.summary);
    else unreadable.push(result.eventId);
  }

  return { events: sortEvents(events, nowS), unreadable };
}

/**
 * One event and its categories.
 *
 * The two failures are not the same failure. Without the event there is no row
 * to draw, so the id goes to `unreadable`. Without its categories there is
 * still a race with a name and a date, and hiding it would lose more than
 * showing it without its entry options.
 */
async function readEvent(
  client: EventReader,
  eventId: number,
): Promise<{ eventId: number; summary: EventSummary | null }> {
  let event: SterunEvent;
  try {
    event = await client.getEvent(eventId);
  } catch {
    return { eventId, summary: null };
  }

  let categories: SterunCategory[] = [];
  try {
    categories = await client.listCategories(eventId);
  } catch {
    categories = [];
  }

  return { eventId, summary: { event, categories } };
}

/**
 * Upcoming races first, soonest at the top; finished races after them, most
 * recent first.
 *
 * Sorting by id would show the directory in the order events were created,
 * which is meaningless to somebody looking for a race to enter. A race that
 * has already run is still worth a page (a runner profile links to it), but it
 * belongs below the ones that can still be entered.
 */
export function sortEvents(events: EventSummary[], nowS: bigint): EventSummary[] {
  return [...events].sort((a, b) => {
    const aUpcoming = a.event.startsAt >= nowS;
    const bUpcoming = b.event.startsAt >= nowS;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;

    if (a.event.startsAt !== b.event.startsAt) {
      const soonestFirst = a.event.startsAt < b.event.startsAt ? -1 : 1;
      return aUpcoming ? soonestFirst : -soonestFirst;
    }

    // Two races at the same instant still need a stable order, or the list
    // reshuffles between renders for no reason the visitor can see.
    return a.event.eventId - b.event.eventId;
  });
}
