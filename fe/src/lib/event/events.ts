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
import type { SterunCategory, SterunEvent } from "@sterunxyz/sdk";

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
  try {
    return { eventId, summary: await getEventSummary(client, eventId) };
  } catch {
    return { eventId, summary: null };
  }
}

/**
 * One event and its categories, for the event page.
 *
 * Throws when the event itself cannot be read, because that page has nothing
 * left to draw and should say so. Categories are treated the same way as in the
 * directory: their absence costs the entry options, not the race.
 */
export async function getEventSummary(
  client: EventReader,
  eventId: number,
): Promise<EventSummary> {
  const event = await client.getEvent(eventId);

  let categories: SterunCategory[] = [];
  try {
    categories = await client.listCategories(eventId);
  } catch {
    categories = [];
  }

  return { event, categories };
}

/**
 * How much a race is worth showing, before its date is looked at (Ancung,
 * 2026-09-17).
 *
 * The date alone put a race that had already run, or one that was cancelled,
 * above a race somebody can enter next month, purely because it happened
 * sooner. Someone opening a race directory is asking "what can I enter?", so
 * that is the first question the order answers.
 *
 * - `0` **enterable now**: open, still to come, with places left somewhere.
 * - `1` **still ahead**: not open yet, entries closed, or sold out. There is a
 *   race at the end of it, so it belongs above what is over.
 * - `2` **over**: already run, or cancelled whatever its date says.
 *
 * A race whose categories could not be read counts as `1` rather than `0`: it
 * may be enterable, but nothing here can say so, and promising a way in that
 * is not there is the worse mistake.
 */
export function entryRank(summary: EventSummary, nowS: bigint): 0 | 1 | 2 {
  const { event, categories } = summary;
  if (event.status === "Cancelled" || event.startsAt < nowS) return 2;
  const open = event.status === "Open" && categories.some((category) => category.slotsLeft > 0);
  return open ? 0 : 1;
}

/**
 * Races that can be entered first, then the ones still to come, then what is
 * over. Inside each, soonest first for what is ahead and most recent first for
 * what has run.
 *
 * Sorting by id would show the directory in the order events were created,
 * which is meaningless to somebody looking for a race to enter.
 */
export function sortEvents(events: EventSummary[], nowS: bigint): EventSummary[] {
  return [...events].sort((a, b) => {
    const rank = entryRank(a, nowS) - entryRank(b, nowS);
    if (rank !== 0) return rank;

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
