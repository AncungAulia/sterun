import { describe, expect, it, vi } from "vitest";

import { getEventSummary, listEvents, sortEvents, type EventSummary } from "@/lib/events";
import type { SterunCategory, SterunEvent } from "@sterunxyz/sdk";

const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const NOW_S = 1_790_000_000n;

function event(eventId: number, overrides: Partial<SterunEvent> = {}): SterunEvent {
  return {
    eventId,
    organiser: ORGANISER,
    name: `Race ${eventId}`,
    metadataHash: "a".repeat(64),
    uri: `https://sterun.xyz/events/${eventId}.json`,
    startsAt: NOW_S + BigInt(eventId) * 86_400n,
    status: "Open",
    ...overrides,
  };
}

function category(eventId: number, categoryId: number, overrides: Partial<SterunCategory> = {}) {
  const quota = overrides.quota ?? 100;
  const enteredCount = overrides.enteredCount ?? 0;
  return {
    eventId,
    categoryId,
    code: "10K",
    distanceM: 10_000,
    quota,
    enteredCount,
    priceStroops: 150_000_000n,
    slotsLeft: quota - enteredCount,
    ...overrides,
  } satisfies SterunCategory;
}

/**
 * The three read methods listEvents needs, and nothing else.
 *
 * `count` is separate from the events on purpose: the registry counts ids, and
 * an id it counts can still fail to read. That gap is the interesting case.
 */
function reader(
  events: SterunEvent[],
  categories: Record<number, SterunCategory[]> = {},
  count = events.length,
) {
  return {
    eventCount: vi.fn(async () => count),
    getEvent: vi.fn(async (id: number) => {
      const found = events.find((e) => e.eventId === id);
      if (!found) throw new Error(`no event ${id}`);
      return found;
    }),
    listCategories: vi.fn(async (id: number) => categories[id] ?? []),
  };
}

describe("listEvents", () => {
  describe("positive", () => {
    it("reads every event the registry counts", async () => {
      const client = reader([event(0), event(1), event(2)]);

      const { events } = await listEvents(client, NOW_S);

      expect(events.map((e) => e.event.eventId)).toEqual([0, 1, 2]);
      expect(client.eventCount).toHaveBeenCalledTimes(1);
    });

    it("brings each event its categories", async () => {
      const client = reader([event(0)], { 0: [category(0, 0), category(0, 1)] });

      const { events } = await listEvents(client, NOW_S);

      expect(events[0].categories).toHaveLength(2);
      expect(events[0].categories[0].code).toBe("10K");
    });

    it("asks the chain how many events there are rather than guessing an end", async () => {
      // The registry has no "list" method, so the only honest stop condition is
      // event_count. Probing ids until one reverts would read a gap as the end.
      const client = reader([event(0), event(1)]);

      await listEvents(client, NOW_S);

      expect(client.getEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe("edge", () => {
    it("returns nothing at all before any event exists", async () => {
      const client = reader([]);

      const { events, unreadable } = await listEvents(client, NOW_S);

      expect(events).toEqual([]);
      expect(unreadable).toEqual([]);
      expect(client.getEvent).not.toHaveBeenCalled();
    });

    it("keeps an event that has no categories yet", async () => {
      // create_event and add_category are separate calls, so an event with zero
      // categories is a normal intermediate state, not corruption.
      const client = reader([event(0)]);

      const { events } = await listEvents(client, NOW_S);

      expect(events).toHaveLength(1);
      expect(events[0].categories).toEqual([]);
    });
  });

  describe("negative", () => {
    it("reports an unreadable event instead of losing the whole directory", async () => {
      const client = reader([event(0), event(2)], {}, 3);

      const { events, unreadable } = await listEvents(client, NOW_S);

      expect(events.map((e) => e.event.eventId)).toEqual([0, 2]);
      expect(unreadable).toEqual([1]);
    });

    it("keeps an event whose categories cannot be read", async () => {
      // Ledger entries expire on Soroban. Losing the categories is a reason to
      // show the event with no categories, not to hide the race.
      const client = reader([event(0)]);
      client.listCategories.mockRejectedValueOnce(new Error("entry archived"));

      const { events, unreadable } = await listEvents(client, NOW_S);

      expect(events).toHaveLength(1);
      expect(events[0].categories).toEqual([]);
      expect(unreadable).toEqual([]);
    });

    it("fails loudly when the registry itself cannot be reached", async () => {
      // A dead RPC is not an empty directory, and must never be drawn as one.
      const client = reader([]);
      client.eventCount.mockRejectedValueOnce(new Error("rpc unreachable"));

      await expect(listEvents(client, NOW_S)).rejects.toThrow("rpc unreachable");
    });
  });
});

describe("sortEvents", () => {
  function summary(eventId: number, startsAt: bigint): EventSummary {
    return { event: event(eventId, { startsAt }), categories: [] };
  }

  describe("positive", () => {
    it("puts the race that starts soonest first", () => {
      const later = summary(0, NOW_S + 200n);
      const sooner = summary(1, NOW_S + 100n);

      expect(sortEvents([later, sooner], NOW_S).map((e) => e.event.eventId)).toEqual([1, 0]);
    });

    it("puts every upcoming race ahead of every finished one", () => {
      const past = summary(0, NOW_S - 100n);
      const upcoming = summary(1, NOW_S + 100n);

      expect(sortEvents([past, upcoming], NOW_S).map((e) => e.event.eventId)).toEqual([1, 0]);
    });

    it("orders past races most recent first", () => {
      const older = summary(0, NOW_S - 200n);
      const recent = summary(1, NOW_S - 100n);

      expect(sortEvents([older, recent], NOW_S).map((e) => e.event.eventId)).toEqual([1, 0]);
    });
  });

  describe("edge", () => {
    it("treats a race starting this very second as upcoming", () => {
      const now = summary(0, NOW_S);
      const past = summary(1, NOW_S - 1n);

      expect(sortEvents([past, now], NOW_S).map((e) => e.event.eventId)).toEqual([0, 1]);
    });

    it("breaks a tie by event id, so the order never wobbles between renders", () => {
      const second = summary(5, NOW_S + 100n);
      const first = summary(2, NOW_S + 100n);

      expect(sortEvents([second, first], NOW_S).map((e) => e.event.eventId)).toEqual([2, 5]);
    });

    it("does not mutate the array it was given", () => {
      const input = [summary(0, NOW_S + 200n), summary(1, NOW_S + 100n)];

      sortEvents(input, NOW_S);

      expect(input.map((e) => e.event.eventId)).toEqual([0, 1]);
    });
  });
});

describe("getEventSummary", () => {
  describe("positive", () => {
    it("returns the event with its categories", async () => {
      const client = reader([event(7)], { 7: [category(7, 0), category(7, 1)] });

      const summary = await getEventSummary(client, 7);

      expect(summary.event.eventId).toBe(7);
      expect(summary.categories.map((c) => c.categoryId)).toEqual([0, 1]);
    });
  });

  describe("negative", () => {
    it("throws for an event that does not exist, so the page can say so", async () => {
      const client = reader([event(0)]);

      await expect(getEventSummary(client, 99)).rejects.toThrow();
    });

    it("still returns the event when its categories cannot be read", async () => {
      const client = reader([event(0)]);
      client.listCategories.mockRejectedValueOnce(new Error("entry archived"));

      const summary = await getEventSummary(client, 0);

      expect(summary.event.eventId).toBe(0);
      expect(summary.categories).toEqual([]);
    });
  });
});
