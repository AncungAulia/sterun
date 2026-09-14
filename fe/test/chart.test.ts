import { describe, expect, it } from "vitest";

import {
  areaPaths,
  fillByDaysOut,
  halfRingPath,
  niceCeiling,
  smoothPath,
  sparklinePath,
  windowed,
} from "@/modules/organiser/chart";

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

const NOW = 1_800_000_000n;
const DAY = 86_400n;

describe("fillByDaysOut", () => {
  describe("positive", () => {
    it("counts an entry against the days it was made before race day", () => {
      const startsAt = NOW + 10n * DAY;
      const records = [{ enteredAt: NOW - 20n * DAY }, { enteredAt: NOW }];

      const series = fillByDaysOut(records, 4, startsAt, NOW);

      // 30 days out: one of four places gone. 10 days out: two of four.
      expect(series.at(0)).toEqual({ daysOut: 30, filled: 0.25 });
      expect(series.at(-1)).toEqual({ daysOut: 10, filled: 0.5 });
    });

    it("runs from the earliest entry to where the race is now", () => {
      const startsAt = NOW + 5n * DAY;
      const series = fillByDaysOut([{ enteredAt: NOW - DAY }], 10, startsAt, NOW);

      expect(series.at(-1)?.daysOut).toBe(5);
    });

    it("accumulates, so the line only ever climbs", () => {
      const startsAt = NOW + 1n * DAY;
      const series = fillByDaysOut(
        [{ enteredAt: NOW - 3n * DAY }, { enteredAt: NOW - 2n * DAY }, { enteredAt: NOW - DAY }],
        10,
        startsAt,
        NOW,
      );

      const filled = series.map((point) => point.filled);
      expect([...filled].sort((a, b) => a - b)).toEqual(filled);
    });
  });

  describe("negative", () => {
    it("is empty for a race nobody has entered", () => {
      expect(fillByDaysOut([], 100, NOW + DAY, NOW)).toEqual([]);
    });

    it("is empty for a quota of zero rather than dividing by it", () => {
      expect(fillByDaysOut([{ enteredAt: NOW }], 0, NOW + DAY, NOW)).toEqual([]);
    });
  });

  describe("edge", () => {
    it("caps at one when a race somehow holds more entries than places", () => {
      const series = fillByDaysOut([{ enteredAt: NOW }, { enteredAt: NOW }], 1, NOW + DAY, NOW);

      expect(series.at(-1)?.filled).toBe(1);
    });

    it("puts a race that has already run at zero days out", () => {
      const series = fillByDaysOut([{ enteredAt: NOW - 10n * DAY }], 10, NOW - DAY, NOW);

      expect(series.at(-1)?.daysOut).toBe(0);
    });
  });
});

describe("windowed", () => {
  describe("positive", () => {
    it("keeps a series that already fits, untouched", () => {
      const points = [
        { daysOut: 40, filled: 0.1 },
        { daysOut: 5, filled: 0.4 },
      ];

      expect(windowed(points, 60)).toEqual(points);
    });
  });

  describe("edge", () => {
    it("carries an early race's fill to the edge rather than starting it at zero", () => {
      // A race that opened four months out was already a third full when it
      // entered the window. Dropping those entries would draw it climbing from
      // nothing at 60 days, which is a lie about a race that was well ahead.
      const series = windowed(
        [
          { daysOut: 120, filled: 0.2 },
          { daysOut: 90, filled: 0.33 },
          { daysOut: 30, filled: 0.5 },
        ],
        60,
      );

      expect(series).toEqual([
        { daysOut: 60, filled: 0.33 },
        { daysOut: 30, filled: 0.5 },
      ]);
    });

    it("collapses the old points into one rather than stacking them on the edge", () => {
      // Clamping each of them to 60 would draw a vertical wall at the left.
      const series = windowed(
        [
          { daysOut: 200, filled: 0.1 },
          { daysOut: 150, filled: 0.2 },
          { daysOut: 100, filled: 0.3 },
        ],
        60,
      );

      expect(series).toEqual([{ daysOut: 60, filled: 0.3 }]);
    });
  });

  describe("negative", () => {
    it("is empty for a series with nothing in it", () => {
      expect(windowed([], 60)).toEqual([]);
    });
  });
});

describe("smoothPath", () => {
  it("starts at the first point and ends at the last", () => {
    const path = smoothPath([
      [0, 10],
      [50, 5],
      [100, 0],
    ]);

    expect(path.startsWith("M 0,10")).toBe(true);
    expect(path.endsWith("100,0")).toBe(true);
  });

  it("returns an empty string for no points", () => {
    expect(smoothPath([])).toBe("");
  });

  it("draws a single point without producing NaN", () => {
    expect(smoothPath([[5, 5]])).not.toContain("NaN");
  });

  it("produces no NaN for two points on top of each other", () => {
    expect(
      smoothPath([
        [10, 10],
        [10, 10],
      ]),
    ).not.toContain("NaN");
  });
});

describe("niceCeiling", () => {
  it("rounds up to a multiple of five, never below five", () => {
    expect(niceCeiling(0)).toBe(5);
    expect(niceCeiling(5)).toBe(5);
    expect(niceCeiling(22)).toBe(25);
  });
});

describe("areaPaths", () => {
  const box = { x0: 0, x1: 100, yTop: 0, yBase: 50 };

  describe("positive", () => {
    it("spreads the days across the box and scales them to the ceiling", () => {
      const drawn = areaPaths([0, 5, 10], box, 10);
      expect(drawn?.points).toEqual([
        [0, 50],
        [50, 25],
        [100, 0],
      ]);
      expect(drawn?.area.endsWith("L 100,50 L 0,50 Z")).toBe(true);
    });
  });

  describe("negative", () => {
    it("draws nothing for a fortnight with no entries", () => {
      // A line along the bottom reads as a measured zero, and the panel says
      // "no entries" in words instead.
      expect(areaPaths([0, 0, 0], box, 5)).toBeNull();
      expect(areaPaths([], box, 5)).toBeNull();
    });
  });

  describe("edge", () => {
    it("centres a single day rather than dividing by zero", () => {
      const drawn = areaPaths([3], box, 5);
      expect(drawn?.points).toEqual([[50, 20]]);
      expect(drawn?.line).not.toContain("NaN");
    });
  });
});

describe("halfRingPath", () => {
  it("draws the top half of a circle, left to right", () => {
    expect(halfRingPath(150, 160, 132)).toBe("M 18,160 A 132,132 0 0 1 282,160");
  });
});
