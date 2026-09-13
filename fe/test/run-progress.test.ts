import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearRunProgress, loadRunProgress, saveRunProgress } from "@/lib/run-progress";

const KEY = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";

describe("run progress", () => {
  beforeEach(() => {
    // Unstub first: a prior test's `vi.stubGlobal("localStorage", ...)` is
    // otherwise still in effect when this runs, and calling `.clear()` on the
    // stand-in (which has no `clear`) throws before the real test even starts.
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  describe("positive", () => {
    it("gives back what was saved", () => {
      saveRunProgress(KEY, { eventId: 7, done: ["create", "category:5K"] });

      expect(loadRunProgress(KEY)).toEqual({ eventId: 7, done: ["create", "category:5K"] });
    });

    it("forgets a run once it is cleared", () => {
      saveRunProgress(KEY, { eventId: 7, done: ["create"] });
      clearRunProgress(KEY);

      expect(loadRunProgress(KEY)).toBeNull();
    });

    it("keeps one run per wallet", () => {
      const other = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
      saveRunProgress(KEY, { eventId: 1, done: ["create"] });
      saveRunProgress(other, { eventId: 2, done: [] });

      expect(loadRunProgress(KEY)?.eventId).toBe(1);
      expect(loadRunProgress(other)?.eventId).toBe(2);
    });
  });

  describe("negative", () => {
    it("returns null when nothing was saved", () => {
      expect(loadRunProgress(KEY)).toBeNull();
    });

    it("returns null rather than throwing on a value that is not JSON", () => {
      window.localStorage.setItem(`sterun.run.${KEY}`, "{not json");

      expect(loadRunProgress(KEY)).toBeNull();
    });

    it("returns null on JSON of the wrong shape", () => {
      // Written by an older version of this app, or by hand. A half-understood
      // object is more dangerous than no object: it would resume a run into
      // steps that do not exist.
      window.localStorage.setItem(`sterun.run.${KEY}`, JSON.stringify({ eventId: "seven" }));

      expect(loadRunProgress(KEY)).toBeNull();
    });
  });

  describe("edge", () => {
    it("survives storage being unavailable", () => {
      // Private windows and blocked site data both throw on access rather than
      // returning nothing. Losing the progress is acceptable; taking the wizard
      // down with it is not.
      vi.stubGlobal("localStorage", {
        getItem() {
          throw new Error("denied");
        },
        setItem() {
          throw new Error("denied");
        },
        removeItem() {
          throw new Error("denied");
        },
      });

      expect(() => saveRunProgress(KEY, { eventId: 1, done: [] })).not.toThrow();
      expect(loadRunProgress(KEY)).toBeNull();
      expect(() => clearRunProgress(KEY)).not.toThrow();
    });

    it("accepts a run that has an id but no completed steps yet", () => {
      saveRunProgress(KEY, { eventId: 3, done: [] });

      expect(loadRunProgress(KEY)).toEqual({ eventId: 3, done: [] });
    });
  });
});
