import { describe, expect, it } from "vitest";

import { statusAction } from "@/modules/organiser/race/lib/status-action";

const NOW = 1_000_000n;
const LATER = NOW + 86_400n;
const EARLIER = NOW - 86_400n;

describe("statusAction", () => {
  describe("positive", () => {
    it("opens a race that is not open yet, and says it cannot be undone", () => {
      const move = statusAction("Draft", LATER, NOW);
      expect(move).toMatchObject({ to: "Open", label: "Open entries", confirm: "Sign and open" });
      // A cost warning, so it is in the dialog's own text and never a tooltip.
      expect(move?.body).toContain("can never go back");
    });

    it("closes an open race, before or after race day", () => {
      expect(statusAction("Open", LATER, NOW)).toMatchObject({ to: "Closed", label: "Close entries" });
      expect(statusAction("Open", EARLIER, NOW)).toMatchObject({ to: "Closed" });
    });

    it("reopens a closed race that has not run yet", () => {
      expect(statusAction("Closed", LATER, NOW)).toMatchObject({
        to: "Open",
        label: "Reopen entries",
      });
    });
  });

  describe("negative", () => {
    it("offers nothing on a race that is over or called off", () => {
      expect(statusAction("Completed", EARLIER, NOW)).toBeNull();
      expect(statusAction("Cancelled", LATER, NOW)).toBeNull();
    });

    it("does not reopen entries for a race that has already run", () => {
      expect(statusAction("Closed", EARLIER, NOW)).toBeNull();
    });

    it("does not open entries for a race that has already run", () => {
      expect(statusAction("Draft", EARLIER, NOW)).toBeNull();
    });
  });

  describe("edge", () => {
    it("does not guess about race day before the clock is known", () => {
      // The first render has no clock (useNowSeconds). Reopening depends on
      // race day, so it waits; opening and closing do not need to.
      expect(statusAction("Closed", LATER, undefined)).toBeNull();
      expect(statusAction("Draft", LATER, undefined)).toMatchObject({ to: "Open" });
      expect(statusAction("Open", LATER, undefined)).toMatchObject({ to: "Closed" });
    });
  });
});
