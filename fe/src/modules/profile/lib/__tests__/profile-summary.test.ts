import { describe, expect, it } from "vitest";

import {
  PAGE_SIZE,
  formatFactDay,
  formatFirstRace,
  formatRaceDay,
  lastChangedAt,
  newestFirst,
  pageCount,
  pageOf,
  profileNumbers,
} from "@/modules/profile/lib/profile-summary";

import { record } from "./fixtures";

describe("newestFirst", () => {
  it("orders by entry time, newest first, and never by bib", () => {
    const older = record({ tokenId: 1, eventId: 1, enteredAt: 100n, bibNo: 900 });
    const newer = record({ tokenId: 2, eventId: 2, enteredAt: 300n, bibNo: 1 });
    const middle = record({ tokenId: 3, eventId: 3, enteredAt: 200n, bibNo: 0 });

    expect(newestFirst([older, newer, middle]).map((r) => r.tokenId)).toEqual([2, 3, 1]);
  });

  it("keeps one order for two entries in the same second", () => {
    const a = record({ tokenId: 5, eventId: 1, enteredAt: 100n });
    const b = record({ tokenId: 9, eventId: 1, enteredAt: 100n });
    expect(newestFirst([a, b]).map((r) => r.tokenId)).toEqual([9, 5]);
    expect(newestFirst([b, a]).map((r) => r.tokenId)).toEqual([9, 5]);
  });
});

describe("profileNumbers", () => {
  it("counts races, finishes with or without a time, and the first entry", () => {
    const numbers = profileNumbers([
      record({ tokenId: 1, eventId: 1, enteredAt: 300n, state: "Finished", finishTimeS: 3000 }),
      record({ tokenId: 2, eventId: 2, enteredAt: 100n, state: "Finished", finishTimeS: null }),
      record({ tokenId: 3, eventId: 3, enteredAt: 200n, state: "Dnf" }),
    ]);
    expect(numbers).toEqual({ races: 3, finished: 2, firstEnteredAt: 100n });
  });

  it("has no first race with no records", () => {
    expect(profileNumbers([])).toEqual({ races: 0, finished: 0, firstEnteredAt: null });
  });

  it("names the month of the first race", () => {
    expect(formatFirstRace(1_783_900_800n, "Asia/Jakarta")).toBe("Jul 2026");
  });
});

describe("pagination", () => {
  const items = Array.from({ length: 45 }, (_, index) => index);

  it("is twenty a page", () => {
    expect(PAGE_SIZE).toBe(20);
    expect(pageCount(45)).toBe(3);
    expect(pageCount(40)).toBe(2);
    expect(pageCount(0)).toBe(1);
    expect(pageOf(items, 1).items).toEqual(items.slice(0, 20));
    expect(pageOf(items, 3).items).toEqual(items.slice(40));
  });

  it("clamps a page number that no longer exists instead of showing nothing", () => {
    expect(pageOf(items, 9)).toEqual({ items: items.slice(40), page: 3 });
    expect(pageOf(items, 0).page).toBe(1);
    expect(pageOf(items, Number.NaN).page).toBe(1);
  });
});

describe("dates", () => {
  it("writes the day first, long under a race name and short in a fact", () => {
    // 27 September 2026, 05:30 in Jakarta.
    expect(formatRaceDay(1_790_461_800n, "Asia/Jakarta")).toBe("27 September 2026");
    expect(formatFactDay(1_790_461_800n, "Asia/Jakarta")).toBe("27 Sep 2026");
  });
});

describe("lastChangedAt", () => {
  it("is the latest of entering, collecting and the result", () => {
    expect(lastChangedAt({ enteredAt: 100n, claimedAt: null, resultAt: null })).toBe(100n);
    expect(lastChangedAt({ enteredAt: 100n, claimedAt: 300n, resultAt: null })).toBe(300n);
    expect(lastChangedAt({ enteredAt: 100n, claimedAt: 300n, resultAt: 500n })).toBe(500n);
    // A no-show's result has no claim before it.
    expect(lastChangedAt({ enteredAt: 100n, claimedAt: null, resultAt: 400n })).toBe(400n);
  });
});
