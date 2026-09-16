import { describe, expect, it } from "vitest";

import { parseRaceTab, raceTabHref } from "@/modules/organiser/race/lib/race-tab";

describe("parseRaceTab", () => {
  describe("positive", () => {
    it("takes the three tabs that exist", () => {
      expect(parseRaceTab("overview")).toBe("overview");
      expect(parseRaceTab("entries")).toBe("entries");
      expect(parseRaceTab("scanners")).toBe("scanners");
    });
  });

  describe("negative", () => {
    it("lands on Overview for a tab that does not exist yet", () => {
      // The bell already links results to ?tab=results. Until that tab is
      // built the link must still open the race, not a blank page.
      expect(parseRaceTab("results")).toBe("overview");
      expect(parseRaceTab("banana")).toBe("overview");
    });
  });

  describe("edge", () => {
    it("reads the first of a repeated parameter and treats none as Overview", () => {
      expect(parseRaceTab(["scanners", "entries"])).toBe("scanners");
      expect(parseRaceTab(undefined)).toBe("overview");
    });
  });
});

describe("raceTabHref", () => {
  it("gives Overview the bare address and the others a tab parameter", () => {
    expect(raceTabHref(4, "overview")).toBe("/org/events/4");
    expect(raceTabHref(4, "scanners")).toBe("/org/events/4?tab=scanners");
  });
});
