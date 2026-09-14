import { describe, expect, it } from "vitest";

import { entriesPerDay, finishedCount, trending, type IndexedRecord } from "@/lib/records";

const NOW = 1_800_000_000n;
const DAY = 86_400n;

function record(overrides: Partial<IndexedRecord> = {}): IndexedRecord {
  return {
    tokenId: 1,
    eventId: 1,
    categoryId: 0,
    bibNo: 1001,
    runnerAddress: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
    state: "Entered",
    enteredAt: NOW,
    claimedAt: null,
    finishTimeS: null,
    resultAt: null,
    addonIds: null,
    ...overrides,
  };
}

describe("entriesPerDay", () => {
  describe("positive", () => {
    it("counts today's entries in the last bucket", () => {
      const days = entriesPerDay([record({ enteredAt: NOW })], NOW, 3);

      expect(days).toEqual([0, 0, 1]);
    });

    it("counts an entry from two days ago in the first bucket", () => {
      const days = entriesPerDay([record({ enteredAt: NOW - 2n * DAY })], NOW, 3);

      expect(days).toEqual([1, 0, 0]);
    });

    it("adds entries that fall on the same day", () => {
      const days = entriesPerDay(
        [record({ enteredAt: NOW }), record({ tokenId: 2, enteredAt: NOW - 3_600n })],
        NOW,
        2,
      );

      expect(days).toEqual([0, 2]);
    });
  });

  describe("negative", () => {
    it("ignores an entry older than the window", () => {
      expect(entriesPerDay([record({ enteredAt: NOW - 40n * DAY })], NOW, 14)).toEqual(
        Array(14).fill(0),
      );
    });

    it("ignores an entry dated in the future", () => {
      // A clock that disagrees with the chain's, or a record from a node ahead
      // of this browser. It must not land outside the array.
      expect(entriesPerDay([record({ enteredAt: NOW + 5n * DAY })], NOW, 3)).toEqual([0, 0, 0]);
    });
  });

  describe("edge", () => {
    it("returns a zero for every day when there are no records", () => {
      expect(entriesPerDay([], NOW, 14)).toEqual(Array(14).fill(0));
    });

    it("returns an empty array for a window of zero days", () => {
      expect(entriesPerDay([record()], NOW, 0)).toEqual([]);
    });
  });
});

describe("finishedCount", () => {
  it("counts finishes and DNFs, because both are a recorded result", () => {
    const records = [
      record({ tokenId: 1, state: "Finished", finishTimeS: 3_134 }),
      record({ tokenId: 2, state: "Finished", finishTimeS: null }),
      record({ tokenId: 3, state: "Dnf" }),
      record({ tokenId: 4, state: "Entered" }),
      record({ tokenId: 5, state: "RacepackClaimed" }),
    ];

    expect(finishedCount(records)).toBe(3);
  });

  it("counts a finish with no official time, which is a normal fun-run row", () => {
    // STE-41. `finishTimeS === null` means "finished, no official time" and is
    // never a zero-second race.
    expect(finishedCount([record({ state: "Finished", finishTimeS: null })])).toBe(1);
  });

  it("is zero for a race nobody has finished", () => {
    expect(finishedCount([record({ state: "Entered" })])).toBe(0);
  });
});

describe("trending", () => {
  const categories = [
    { categoryId: 0, code: "5K" },
    { categoryId: 1, code: "10K" },
  ];

  describe("positive", () => {
    it("ranks distances by entries in the window, most first", () => {
      const ranked = trending(
        [
          {
            eventId: 1,
            eventName: "Fun Run Sleman",
            categories,
            records: [
              record({ tokenId: 1, categoryId: 0, enteredAt: NOW - DAY }),
              record({ tokenId: 2, categoryId: 0, enteredAt: NOW - DAY }),
              record({ tokenId: 3, categoryId: 1, enteredAt: NOW }),
            ],
          },
        ],
        NOW,
        7,
        4,
      );

      expect(ranked).toEqual([
        { eventId: 1, eventName: "Fun Run Sleman", code: "5K", count: 2 },
        { eventId: 1, eventName: "Fun Run Sleman", code: "10K", count: 1 },
      ]);
    });

    it("ranks across races, not within one", () => {
      const ranked = trending(
        [
          { eventId: 1, eventName: "A", categories, records: [record({ categoryId: 0 })] },
          {
            eventId: 2,
            eventName: "B",
            categories,
            records: [
              record({ tokenId: 2, categoryId: 0 }),
              record({ tokenId: 3, categoryId: 0 }),
            ],
          },
        ],
        NOW,
        7,
        4,
      );

      expect(ranked[0]).toEqual({ eventId: 2, eventName: "B", code: "5K", count: 2 });
    });
  });

  describe("negative", () => {
    it("leaves out a distance nobody entered in the window", () => {
      const ranked = trending(
        [{ eventId: 1, eventName: "A", categories, records: [record({ enteredAt: NOW - 30n * DAY })] }],
        NOW,
        7,
        4,
      );

      expect(ranked).toEqual([]);
    });
  });

  describe("edge", () => {
    it("keeps at most the number asked for", () => {
      const many = Array.from({ length: 9 }, (_, i) => ({
        eventId: i,
        eventName: `Race ${i}`,
        categories,
        records: [record({ tokenId: i, categoryId: 0 })],
      }));

      expect(trending(many, NOW, 7, 4)).toHaveLength(4);
    });

    it("falls back to the id when a category has no code", () => {
      // A partly-read event can reach this with categories missing. Printing
      // nothing at all would leave a row with a number and no name.
      const ranked = trending(
        [{ eventId: 1, eventName: "A", categories: [], records: [record({ categoryId: 3 })] }],
        NOW,
        7,
        4,
      );

      expect(ranked[0].code).toBe("Distance 3");
    });
  });
});
