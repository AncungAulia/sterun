import { describe, expect, it } from "vitest";

import type { IndexedRecord } from "@/lib/records";
import {
  addOnsToHandOut,
  entryStatus,
  filterEntries,
  formatDuration,
  packsCollected,
  raceTotals,
  recentActivity,
  timeAgo,
} from "@/modules/organiser/race";
import type { SterunAddOn, SterunCategory } from "@sterunxyz/sdk";

const WALLET_A = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const WALLET_B = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

function record(overrides: Partial<IndexedRecord> = {}): IndexedRecord {
  return {
    tokenId: 0,
    eventId: 0,
    categoryId: 0,
    bibNo: 1,
    runnerAddress: WALLET_A,
    state: "Entered",
    enteredAt: 1_000n,
    claimedAt: null,
    finishTimeS: null,
    resultAt: null,
    addonIds: null,
    ...overrides,
  };
}

function category(overrides: Partial<SterunCategory> = {}): SterunCategory {
  const quota = overrides.quota ?? 200;
  const enteredCount = overrides.enteredCount ?? 50;
  return {
    eventId: 0,
    categoryId: 0,
    code: "10K",
    distanceM: 10_000,
    quota,
    enteredCount,
    priceStroops: 100_000_000n,
    slotsLeft: quota - enteredCount,
    ...overrides,
  };
}

function addOn(overrides: Partial<SterunAddOn> = {}): SterunAddOn {
  const quota = overrides.quota ?? 100;
  const reservedCount = overrides.reservedCount ?? 10;
  return {
    eventId: 0,
    addonId: 0,
    code: "JERSEY_M",
    priceStroops: 50_000_000n,
    quota,
    reservedCount,
    unitsLeft: quota - reservedCount,
    ...overrides,
  };
}

describe("raceTotals", () => {
  describe("positive", () => {
    it("adds entry fees and add-on sales into what has been received", () => {
      const totals = raceTotals([category()], [addOn()]);
      expect(totals.entered).toBe(50);
      expect(totals.quota).toBe(200);
      // 50 x 10 sUSD + 10 x 5 sUSD
      expect(totals.received).toBe(5_500_000_000n);
      // 200 x 10 sUSD + 100 x 5 sUSD: a sell-out of both
      expect(totals.potential).toBe(25_000_000_000n);
    });
  });

  describe("edge", () => {
    it("is all zeros for a race with nothing on sale", () => {
      expect(raceTotals([], [])).toEqual({ entered: 0, quota: 0, received: 0n, potential: 0n });
    });
  });
});

describe("entryStatus and packsCollected", () => {
  describe("positive", () => {
    it("names each state the way the table reads it", () => {
      expect(entryStatus(record({ state: "Entered" }))).toBe("not-collected");
      expect(entryStatus(record({ state: "RacepackClaimed", claimedAt: 2n }))).toBe("collected");
      expect(entryStatus(record({ state: "Finished", claimedAt: 2n }))).toBe("finished");
      expect(entryStatus(record({ state: "Dnf" }))).toBe("dnf");
    });
  });

  describe("edge", () => {
    it("counts a pack as collected by its time, not by the state that followed it", () => {
      // A runner who collected and then finished still took a race pack home.
      // A no-show marked DNF never did.
      const records = [
        record({ state: "RacepackClaimed", claimedAt: 5n }),
        record({ state: "Finished", claimedAt: 5n }),
        record({ state: "Dnf", claimedAt: null }),
        record({ state: "Entered" }),
      ];
      expect(packsCollected(records)).toBe(2);
    });
  });
});

describe("filterEntries", () => {
  const records = [
    record({ tokenId: 1, bibNo: 12, categoryId: 0, runnerAddress: WALLET_A, enteredAt: 30n }),
    record({
      tokenId: 2,
      bibNo: 7,
      categoryId: 1,
      runnerAddress: WALLET_B,
      enteredAt: 10n,
      state: "RacepackClaimed",
      claimedAt: 40n,
    }),
  ];
  const all = { query: "", categoryId: null, status: "all" as const };

  describe("positive", () => {
    it("lists every entry, earliest first, when nothing narrows it", () => {
      expect(filterEntries(records, all).map((r) => r.tokenId)).toEqual([2, 1]);
    });

    it("finds a bib by its exact number", () => {
      expect(filterEntries(records, { ...all, query: "12" }).map((r) => r.tokenId)).toEqual([1]);
    });

    it("finds a wallet by any part of it, in any case", () => {
      expect(filterEntries(records, { ...all, query: "gaazi4" }).map((r) => r.tokenId)).toEqual([2]);
    });

    it("narrows by distance and by status together", () => {
      expect(filterEntries(records, { ...all, categoryId: 1, status: "collected" })).toHaveLength(1);
      expect(filterEntries(records, { ...all, categoryId: 0, status: "collected" })).toHaveLength(0);
    });
  });

  describe("negative", () => {
    it("does not read a bib number as part of a wallet", () => {
      // Both wallets contain a 7. Bib 7 is one runner, not every address with
      // that digit in it.
      expect(filterEntries(records, { ...all, query: "7" }).map((r) => r.tokenId)).toEqual([2]);
    });

    it("does not match a bib by a prefix of it", () => {
      // "1" is not bib 12. An organiser typing a bib wants that runner.
      expect(filterEntries(records, { ...all, query: "1" })).toHaveLength(0);
    });
  });

  describe("edge", () => {
    it("ignores spaces around what was typed", () => {
      expect(filterEntries(records, { ...all, query: "  7 " })).toHaveLength(1);
    });
  });
});

describe("addOnsToHandOut", () => {
  describe("positive", () => {
    it("counts the add-ons of runners who have not collected yet", () => {
      const records = [
        record({ addonIds: [0, 1] }),
        record({ addonIds: [2], state: "RacepackClaimed", claimedAt: 3n }),
        record({ addonIds: [] }),
      ];
      expect(addOnsToHandOut(records)).toBe(2);
    });
  });

  describe("negative", () => {
    it("says nothing rather than zero when the index does not send add-ons yet", () => {
      expect(addOnsToHandOut([record({ addonIds: null })])).toBeNull();
    });
  });

  describe("edge", () => {
    it("is zero for a race nobody has entered", () => {
      expect(addOnsToHandOut([])).toBe(0);
    });
  });
});

describe("recentActivity", () => {
  const categories = [{ categoryId: 0, code: "10K" }];

  describe("positive", () => {
    it("turns each record into the things that happened to it, newest first", () => {
      const items = recentActivity(
        [
          record({
            tokenId: 1,
            bibNo: 4,
            enteredAt: 10n,
            claimedAt: 20n,
            state: "Finished",
            finishTimeS: 3134,
            resultAt: 30n,
          }),
          record({ tokenId: 2, bibNo: 5, enteredAt: 25n }),
        ],
        categories,
        10,
      );
      expect(items.map((item) => [item.kind, item.at])).toEqual([
        ["finished", 30n],
        ["entered", 25n],
        ["collected", 20n],
        ["entered", 10n],
      ]);
      expect(items[0]).toMatchObject({ bibNo: 4, code: "10K", finishTimeS: 3134 });
    });

    it("keeps only as many as asked for", () => {
      const many = Array.from({ length: 8 }, (_, i) => record({ tokenId: i, enteredAt: BigInt(i) }));
      expect(recentActivity(many, categories, 4)).toHaveLength(4);
    });
  });

  describe("edge", () => {
    it("reports a DNF as its own kind and an untimed finish with no time", () => {
      const items = recentActivity(
        [
          record({ tokenId: 1, enteredAt: 10n, state: "Dnf", resultAt: 50n }),
          record({
            tokenId: 2,
            enteredAt: 10n,
            state: "Finished",
            claimedAt: 20n,
            finishTimeS: null,
            resultAt: 40n,
          }),
        ],
        categories,
        10,
      );
      expect(items[0].kind).toBe("dnf");
      expect(items[1]).toMatchObject({ kind: "finished", finishTimeS: null });
    });

    it("names a distance it cannot find by its id rather than dropping the row", () => {
      const [item] = recentActivity([record({ categoryId: 9 })], categories, 1);
      expect(item.code).toBe("Distance 9");
    });
  });
});

describe("formatDuration", () => {
  it("writes minutes and seconds under an hour, and hours past it", () => {
    expect(formatDuration(3134)).toBe("52:14");
    expect(formatDuration(3761)).toBe("1:02:41");
    expect(formatDuration(59)).toBe("0:59");
  });
});

describe("timeAgo", () => {
  const now = 1_000_000n;
  it("reads like a person would say it", () => {
    expect(timeAgo(now - 20n, now)).toBe("just now");
    expect(timeAgo(now - 4n * 60n, now)).toBe("4 min ago");
    expect(timeAgo(now - 3n * 3600n, now)).toBe("3 h ago");
    expect(timeAgo(now - 30n * 3600n, now)).toBe("yesterday");
    expect(timeAgo(now - 5n * 86_400n, now)).toBe("5 days ago");
  });

  it("never says a time in the future is in the past", () => {
    expect(timeAgo(now + 100n, now)).toBe("just now");
  });
});
