import { describe, expect, it } from "vitest";

import {
  describeDrift,
  distanceOf,
  driftLimitSeconds,
  formatClock,
} from "@/modules/scanner/lib/roster-facts";

describe("roster facts", () => {
  it("reads a time on a 24-hour clock in the given zone", () => {
    expect(formatClock("2026-09-27T02:02:00.000Z", "Asia/Jakarta")).toBe("09:02");
    expect(formatClock("2026-09-27T06:41:00.000Z", "Asia/Jakarta")).toBe("13:41");
  });

  it("names a distance by category, and nothing for one the chain did not give", () => {
    const roster = { categories: [{ categoryId: 0, code: "10K" }, { categoryId: 1, code: "5K" }] };
    expect(distanceOf(roster, 1)).toBe("5K");
    expect(distanceOf(roster, 9)).toBeNull();
  });

  it("puts the drift limit at the tolerance in seconds, where scans start failing", () => {
    // One step, not the 90-second code window: see the comment on the function.
    expect(driftLimitSeconds({ digits: 6, stepSeconds: 30, toleranceSteps: 1 })).toBe(30);
    expect(driftLimitSeconds({ digits: 6, stepSeconds: 30, toleranceSteps: 2 })).toBe(60);
  });

  describe("a drift, in words", () => {
    it("says which way the clock is wrong", () => {
      expect(describeDrift(240)).toBe("4 minutes fast");
      expect(describeDrift(-240)).toBe("4 minutes slow");
    });

    it("keeps seconds below two minutes, so 95 does not sound like it is inside 90", () => {
      expect(describeDrift(95)).toBe("95 seconds fast");
      expect(describeDrift(-119)).toBe("119 seconds slow");
    });

    it("rounds to whole minutes above that", () => {
      expect(describeDrift(150)).toBe("3 minutes fast");
      expect(describeDrift(3_600)).toBe("60 minutes fast");
    });
  });
});
