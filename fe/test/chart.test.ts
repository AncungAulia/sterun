import { describe, expect, it } from "vitest";

import { sparklinePath } from "@/modules/organiser/chart";

describe("sparklinePath", () => {
  describe("positive", () => {
    it("draws a point per value across the full width", () => {
      const path = sparklinePath([0, 1, 2], 80, 20);

      expect(path).not.toBeNull();
      expect(path!.split(" ").filter((part) => part.includes(",")).length).toBe(3);
      expect(path!.startsWith("M 0,")).toBe(true);
      expect(path!).toContain("80,");
    });

    it("puts the largest value at the top", () => {
      const path = sparklinePath([0, 10], 100, 20)!;
      const [, last] = path.split("L ");
      const y = Number(last.split(",")[1]);

      expect(y).toBeLessThan(10);
    });
  });

  describe("negative", () => {
    it("returns null for a race nobody has entered", () => {
      // A flat line at zero and "no data" look identical, and the caller draws
      // a neutral rule for the second rather than a line that claims a shape.
      expect(sparklinePath([0, 0, 0], 80, 20)).toBeNull();
    });

    it("returns null for an empty series", () => {
      expect(sparklinePath([], 80, 20)).toBeNull();
    });
  });

  describe("edge", () => {
    it("draws a single value as a flat line rather than dividing by zero", () => {
      const path = sparklinePath([5], 80, 20);

      expect(path).not.toBeNull();
      expect(path!).not.toContain("NaN");
    });

    it("never produces NaN when every value is equal", () => {
      const path = sparklinePath([4, 4, 4], 80, 20);

      expect(path).not.toBeNull();
      expect(path!).not.toContain("NaN");
    });

    it("produces no NaN for a zero-width box", () => {
      // A card can be measured before it has been laid out. An SVG path holding
      // NaN does not throw: the browser drops it and the panel renders empty
      // with nothing in the console, which is the failure this guards.
      const path = sparklinePath([1, 2], 0, 0);

      expect(path).not.toBeNull();
      expect(path!).not.toContain("NaN");
    });
  });
});
