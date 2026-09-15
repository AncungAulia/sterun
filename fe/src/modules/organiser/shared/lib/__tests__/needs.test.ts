import { describe, expect, it } from "vitest";

import {
  buildNeeds,
  racesToAskAboutResults,
  racesToAskAboutScanners,
} from "@/modules/organiser/shared/lib/needs";
import type { EventSummary } from "@/lib/event/events";
import type { EventStatus, SterunEvent } from "@sterunxyz/sdk";

const NOW = 1_800_000_000n;
const DAY = 86_400n;

function summary(eventId: number, overrides: Partial<SterunEvent> = {}): EventSummary {
  return {
    event: {
      eventId,
      organiser: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
      name: `Race ${eventId}`,
      metadataHash: "a".repeat(64),
      uri: "",
      startsAt: NOW + 30n * DAY,
      status: "Open" as EventStatus,
      ...overrides,
    },
    categories: [],
  };
}

const NOTHING = { scannerCounts: new Map<number, number>(), resultCounts: new Map<number, number>() };

describe("racesToAskAboutScanners", () => {
  describe("positive", () => {
    it("asks about a race inside the window", () => {
      const soon = summary(1, { startsAt: NOW + 5n * DAY });

      expect(racesToAskAboutScanners([soon], NOW)).toEqual([1]);
    });
  });

  describe("negative", () => {
    it("does not ask about a race two months out", () => {
      // Bounded on purpose: this is one request per race and an organiser with
      // a year of races would pay for all of them on every page load.
      expect(racesToAskAboutScanners([summary(1, { startsAt: NOW + 60n * DAY })], NOW)).toEqual([]);
    });

    it("does not ask about a race that has already run", () => {
      expect(racesToAskAboutScanners([summary(1, { startsAt: NOW - DAY })], NOW)).toEqual([]);
    });

    it("does not ask about a race whose entries are not open", () => {
      const notOpen = summary(1, { startsAt: NOW + 5n * DAY, status: "Draft" });

      expect(racesToAskAboutScanners([notOpen], NOW)).toEqual([]);
    });

    it("does not ask about a cancelled race", () => {
      const off = summary(1, { startsAt: NOW + 5n * DAY, status: "Cancelled" });

      expect(racesToAskAboutScanners([off], NOW)).toEqual([]);
    });
  });

  describe("edge", () => {
    it("asks about a race exactly on the window's edge", () => {
      expect(racesToAskAboutScanners([summary(1, { startsAt: NOW + 14n * DAY })], NOW)).toEqual([1]);
    });

    it("asks about a race whose entries have closed but which still has to be run", () => {
      // Entries closing is the normal state a week before a race. It is the
      // moment a missing scanner matters most.
      const closed = summary(1, { startsAt: NOW + 3n * DAY, status: "Closed" });

      expect(racesToAskAboutScanners([closed], NOW)).toEqual([1]);
    });
  });
});

describe("racesToAskAboutResults", () => {
  it("asks about a race that ran yesterday", () => {
    expect(racesToAskAboutResults([summary(1, { startsAt: NOW - DAY })], NOW)).toEqual([1]);
  });

  it("does not ask about a race that has not run", () => {
    expect(racesToAskAboutResults([summary(1, { startsAt: NOW + DAY })], NOW)).toEqual([]);
  });

  it("does not ask about a cancelled race", () => {
    const off = summary(1, { startsAt: NOW - DAY, status: "Cancelled" });

    expect(racesToAskAboutResults([off], NOW)).toEqual([]);
  });
});

describe("buildNeeds", () => {
  describe("positive", () => {
    it("asks for a scanner when a race is days away and has none", () => {
      const soon = summary(1, { startsAt: NOW + 3n * DAY, name: "Fun Run Sleman" });

      const [need] = buildNeeds({
        events: [soon],
        nowS: NOW,
        scannerCounts: new Map([[1, 0]]),
        resultCounts: new Map(),
      });

      expect(need.kind).toBe("scanner");
      expect(need.urgent).toBe(true);
      expect(need.title).toBe("Add a scanner - Fun Run Sleman");
      expect(need.detail).toBe("Runs in 3 days. Nobody can check runners in.");
      expect(need.href).toBe("/org/events/1?tab=scanners");
    });

    it("asks for entries to be opened on a race that is not open", () => {
      const [need] = buildNeeds({ events: [summary(1, { status: "Draft" })], nowS: NOW, ...NOTHING });

      expect(need.kind).toBe("open");
      expect(need.urgent).toBe(false);
      expect(need.action).toBe("Open entries");
    });

    it("asks for results on a race that ran with none recorded", () => {
      const ran = summary(1, { startsAt: NOW - 12n * DAY });

      const [need] = buildNeeds({
        events: [ran],
        nowS: NOW,
        scannerCounts: new Map(),
        resultCounts: new Map([[1, 0]]),
      });

      expect(need.kind).toBe("results");
      expect(need.detail).toBe("Finished 12 days ago with no results.");
    });
  });

  describe("negative", () => {
    it("says nothing about a race that already has a scanner", () => {
      const soon = summary(1, { startsAt: NOW + 3n * DAY });

      expect(
        buildNeeds({ events: [soon], nowS: NOW, scannerCounts: new Map([[1, 2]]), resultCounts: new Map() }),
      ).toEqual([]);
    });

    it("says nothing about a race whose results are in", () => {
      const ran = summary(1, { startsAt: NOW - 2n * DAY });

      expect(
        buildNeeds({ events: [ran], nowS: NOW, scannerCounts: new Map(), resultCounts: new Map([[1, 40]]) }),
      ).toEqual([]);
    });

    it("says nothing when the scanner count has not arrived yet", () => {
      // An unanswered request is not an answer of zero. Claiming a race has no
      // scanner because a node was slow would send somebody to add one they
      // already have.
      const soon = summary(1, { startsAt: NOW + 3n * DAY });

      expect(buildNeeds({ events: [soon], nowS: NOW, ...NOTHING })).toEqual([]);
    });

    it("says nothing about a cancelled race, whatever else is missing", () => {
      const off = summary(1, { startsAt: NOW - 2n * DAY, status: "Cancelled" });

      expect(
        buildNeeds({ events: [off], nowS: NOW, scannerCounts: new Map([[1, 0]]), resultCounts: new Map([[1, 0]]) }),
      ).toEqual([]);
    });
  });

  describe("edge", () => {
    it("puts the urgent one first, then the soonest race", () => {
      const urgent = summary(1, { startsAt: NOW + 2n * DAY });
      const later = summary(2, { startsAt: NOW + 40n * DAY, status: "Draft" });
      const ran = summary(3, { startsAt: NOW - 5n * DAY });

      const needs = buildNeeds({
        events: [later, ran, urgent],
        nowS: NOW,
        scannerCounts: new Map([[1, 0]]),
        resultCounts: new Map([[3, 0]]),
      });

      expect(needs.map((need) => need.kind)).toEqual(["scanner", "results", "open"]);
    });

    it("stops calling a missing scanner urgent once the race is far enough away", () => {
      // Urgency is about how long there is to act, not about the size of the
      // problem. Ten days out this is a note; two days out it is a banner.
      const soon = summary(1, { startsAt: NOW + 10n * DAY });

      const [need] = buildNeeds({
        events: [soon],
        nowS: NOW,
        scannerCounts: new Map([[1, 0]]),
        resultCounts: new Map(),
      });

      expect(need.urgent).toBe(false);
    });

    it("says 'Runs tomorrow' rather than 'in 1 days'", () => {
      const soon = summary(1, { startsAt: NOW + 1n * DAY });

      const [need] = buildNeeds({
        events: [soon],
        nowS: NOW,
        scannerCounts: new Map([[1, 0]]),
        resultCounts: new Map(),
      });

      expect(need.detail).toBe("Runs tomorrow. Nobody can check runners in.");
    });
  });
});
