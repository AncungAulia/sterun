import { describe, expect, it } from "vitest";

import {
  closeDateBound,
  closeDateProblem,
  closeDateSentence,
  datePassed,
  headerPlan,
} from "../lib/close-date";
import type { EventMetadata } from "@/lib/event/metadata";

/** 1 Jan 2027, so every fixture date below is readable at a glance. */
const RACE_DAY = 1_798_761_600n;
const NOW = 1_790_000_000n;

const iso = (date: Date) => date.toISOString().slice(0, 16);

function metadata(schedule: EventMetadata["schedule"]): EventMetadata {
  return { schedule } as EventMetadata;
}

describe("close-date", () => {
  describe("positive", () => {
    it("leads with what each race most needs next", () => {
      expect(headerPlan("Draft", null, NOW).primary).toBe("open");
      expect(headerPlan("Open", null, NOW).primary).toBe("addPlaces");
      // Closed by hand: reopening by hand is the move that matches.
      expect(headerPlan("Closed", null, NOW).primary).toBe("reopen");
    });

    it("leads a date-closed race with the date, because reopening alone does nothing", () => {
      const plan = headerPlan("Closed", NOW - 10n, NOW);

      expect(plan.primary).toBe("closeDate");
      expect(plan.menu).toContain("reopen");
    });

    it("folds everything else into the menu rather than the header", () => {
      expect(headerPlan("Open", RACE_DAY, NOW).menu).toEqual(["closeDate", "close"]);
    });

    it("takes race pack collection as the bound when the document names one", () => {
      const bound = closeDateBound(
        RACE_DAY,
        metadata([
          { phase: "registration", startsAt: "2026-09-01T00:00:00.000Z" },
          { phase: "racepack", startsAt: "2026-12-28T02:00:00.000Z" },
        ]),
      );

      expect(bound.reason).toBe("racepack");
      expect(bound.latest).toBe(Math.floor(Date.parse("2026-12-28T02:00:00.000Z") / 1000));
    });

    it("names both dates, so the reader sees which way they moved", () => {
      const previous = BigInt(Math.floor(Date.parse("2026-10-12T16:59:00.000Z") / 1000));
      const next = new Date("2026-10-19T16:59:00.000Z");

      expect(closeDateSentence("Merdeka Run 2026", previous, next, iso)).toBe(
        "Entries for Merdeka Run 2026 now close on 2026-10-19T16:59 instead of 2026-10-12T16:59.",
      );
    });

    it("says it plainly when there was no date before", () => {
      expect(closeDateSentence("Merdeka Run 2026", null, new Date("2026-10-19T16:59:00.000Z"), iso)).toBe(
        "Entries for Merdeka Run 2026 close on 2026-10-19T16:59.",
      );
    });

    it("accepts a date inside the bound", () => {
      const bound = closeDateBound(RACE_DAY, null);

      expect(closeDateProblem(new Date(Number(RACE_DAY - 86_400n) * 1000), bound, iso)).toBeNull();
    });
  });

  describe("negative", () => {
    it("gives a terminal race nothing at all", () => {
      expect(headerPlan("Completed", RACE_DAY, NOW)).toEqual({ primary: null, menu: [] });
      expect(headerPlan("Cancelled", RACE_DAY, NOW)).toEqual({ primary: null, menu: [] });
    });

    it("never calls a missing date passed, and never guesses without a clock", () => {
      expect(datePassed(null, NOW)).toBe(false);
      expect(datePassed(NOW - 10n, undefined)).toBe(false);
      // The first render has no clock, so a Closed race must not be treated as
      // date-closed before one arrives.
      expect(headerPlan("Closed", NOW - 10n, undefined).primary).toBe("reopen");
    });

    it("falls back to race day when the document has no race pack window", () => {
      expect(closeDateBound(RACE_DAY, null)).toEqual({ latest: Number(RACE_DAY), reason: "raceDay" });
      expect(closeDateBound(RACE_DAY, metadata([{ phase: "registration" }])).reason).toBe("raceDay");
    });

    it("ignores a race pack window that sits after race day", () => {
      // A document can say anything; race day still ends entries.
      const bound = closeDateBound(
        RACE_DAY,
        metadata([{ phase: "racepack", startsAt: "2030-01-01T00:00:00.000Z" }]),
      );

      expect(bound.reason).toBe("raceDay");
    });

    it("refuses a date past the bound, and says which bound", () => {
      const packs = closeDateBound(
        RACE_DAY,
        metadata([{ phase: "racepack", startsAt: "2026-12-28T02:00:00.000Z" }]),
      );

      expect(closeDateProblem(new Date("2026-12-29T00:00:00.000Z"), packs, iso)).toMatch(
        /Race pack collection starts/,
      );
      expect(
        closeDateProblem(new Date(Number(RACE_DAY + 86_400n) * 1000), closeDateBound(RACE_DAY, null), iso),
      ).toMatch(/Race day is/);
    });

    it("asks for a date rather than accepting an empty one", () => {
      expect(closeDateProblem(null, closeDateBound(RACE_DAY, null), iso)).toBe("Choose a date and time.");
      expect(closeDateProblem(new Date("banana"), closeDateBound(RACE_DAY, null), iso)).toBe(
        "Choose a date and time.",
      );
    });
  });
});
