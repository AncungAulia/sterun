import { describe, expect, it } from "vitest";

import { findNameClash, normaliseEventName } from "@/lib/event-names";

describe("normaliseEventName", () => {
  it("ignores the differences nobody means", () => {
    expect(normaliseEventName("  Lari   Jateng 2026! ")).toBe("lari jateng 2026");
    expect(normaliseEventName("LARI JATENG 2026")).toBe("lari jateng 2026");
    expect(normaliseEventName("Lari-Jateng (2026)")).toBe("lari jateng 2026");
  });

  it("keeps differences that are differences", () => {
    // The one guess this must not make. A warning that fires on races that are
    // genuinely different is a warning organisers learn to click past.
    expect(normaliseEventName("Jakarta 10K")).not.toBe(normaliseEventName("Jakarta 10 K"));
    expect(normaliseEventName("Lari Jateng 2026")).not.toBe(normaliseEventName("Lari Jateng 2027"));
  });
});

describe("findNameClash", () => {
  const existing = ["Lari Jateng 2026", "Jakarta Sunrise 10K"];

  describe("positive", () => {
    it("finds a match that differs only in case and spacing", () => {
      expect(findNameClash("  lari   jateng 2026", existing)).toBe("Lari Jateng 2026");
    });

    it("answers with the name as it was written, so the warning can quote it", () => {
      expect(findNameClash("JAKARTA SUNRISE 10K", existing)).toBe("Jakarta Sunrise 10K");
    });
  });

  describe("negative", () => {
    it("says nothing about a name that is genuinely new", () => {
      expect(findNameClash("Borobudur Marathon 2026", existing)).toBeNull();
    });

    it("says nothing when the index gave back nothing", () => {
      // The backend being unreachable must not look like a clear name, nor
      // like a clash. It looks like no opinion, which is what this is.
      expect(findNameClash("Lari Jateng 2026", [])).toBeNull();
    });
  });

  describe("edge", () => {
    it("holds its tongue while the field is empty or only punctuation", () => {
      // Otherwise the warning fires on the first keystroke of every event,
      // since "" normalises to the same thing as "---".
      expect(findNameClash("", existing)).toBeNull();
      expect(findNameClash("   ", existing)).toBeNull();
      expect(findNameClash("!!!", existing)).toBeNull();
    });

    it("does not match a name that merely starts the same way", () => {
      expect(findNameClash("Lari Jateng", existing)).toBeNull();
      expect(findNameClash("Lari Jateng 2026 Half", existing)).toBeNull();
    });
  });
});
