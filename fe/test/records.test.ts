import { describe, expect, it } from "vitest";

import { entriesPerDay, finishedCount, type IndexedRecord } from "@/lib/records";

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
