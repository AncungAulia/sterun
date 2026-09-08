import { describe, expect, it } from "vitest";

import { formatEventDate, formatEventDateTime, formatPrice, shortAddress } from "@/utils/format";

const ADDRESS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

describe("shortAddress", () => {
  describe("positive", () => {
    it("keeps both ends so two addresses can be told apart by eye", () => {
      expect(shortAddress(ADDRESS)).toBe("GAAZ…CWN7");
    });

    it("honours a custom lead and tail", () => {
      expect(shortAddress(ADDRESS, 6, 6)).toBe("GAAZI4…OCCWN7");
    });
  });

  describe("edge", () => {
    it("returns a string shorter than the truncation untouched", () => {
      expect(shortAddress("GABC")).toBe("GABC");
    });

    it("returns a string exactly at the boundary untouched", () => {
      // 9 characters against lead 4 + tail 4 + the ellipsis: truncating here
      // would cost a character and gain nothing.
      expect(shortAddress("GABCDEFGH")).toBe("GABCDEFGH");
    });

    it("truncates as soon as truncating actually shortens the string", () => {
      expect(shortAddress("GABCDEFGHI")).toBe("GABC…FGHI");
    });

    it("handles an empty string", () => {
      expect(shortAddress("")).toBe("");
    });

    it("uses a single ellipsis character, not three dots", () => {
      // Three dots would widen the label and break alignment in a table of
      // addresses rendered with tabular figures.
      expect(shortAddress(ADDRESS)).toContain("…");
      expect(shortAddress(ADDRESS)).not.toContain("...");
    });
  });
});

describe("formatPrice", () => {
  describe("positive", () => {
    it("shows a whole-unit price with the asset code", () => {
      expect(formatPrice(150_000_000n)).toBe("sUSD 15");
    });

    it("keeps the fractional part when there is one", () => {
      expect(formatPrice(155_000_000n)).toBe("sUSD 15.5");
    });

    it("groups thousands so a large fee stays readable", () => {
      expect(formatPrice(15_000_000_000n)).toBe("sUSD 1,500");
    });
  });

  describe("edge", () => {
    it("says Free rather than sUSD 0, because zero is a different offer", () => {
      expect(formatPrice(0n)).toBe("Free");
    });

    it("shows a single stroop without rounding it away", () => {
      // The contract takes i128 stroops, so this price is expressible and a
      // runner would be charged it. Rounding it to sUSD 0 would show a free
      // race that is not free.
      expect(formatPrice(1n)).toBe("sUSD 0.0000001");
    });

    it("does not pad a whole price with trailing zeroes", () => {
      expect(formatPrice(10_000_000n)).toBe("sUSD 1");
    });

    it("groups a price that is both large and fractional", () => {
      expect(formatPrice(12_345_678_912_345_678n)).toBe("sUSD 1,234,567,891.2345678");
    });
  });
});

/**
 * A race in Jakarta: 2026-09-28 05:30 +07:00, which is still 2026-09-27 in UTC.
 * Chosen on purpose. The date a runner cares about is the local one at the
 * start line, and a naive UTC render moves this race to the previous day.
 */
const GUN_START = 1_790_548_200n;

describe("formatEventDate", () => {
  describe("positive", () => {
    it("renders the calendar date in the given timezone", () => {
      expect(formatEventDate(GUN_START, "Asia/Jakarta")).toBe("Sep 28, 2026");
    });
  });

  describe("edge", () => {
    it("moves the date for a viewer whose timezone is behind the start line", () => {
      // Not a bug to hide: the instant is the same one, and the label in
      // formatEventDateTime is what says which clock is being read.
      expect(formatEventDate(GUN_START, "America/Los_Angeles")).toBe("Sep 27, 2026");
    });

    it("does not crash on a timestamp outside the range a Date can hold", () => {
      expect(formatEventDate(99_999_999_999_999n, "UTC")).toBe("Unknown date");
    });
  });
});

describe("formatEventDateTime", () => {
  describe("positive", () => {
    it("names the timezone, so the time is never ambiguous", () => {
      expect(formatEventDateTime(GUN_START, "Asia/Jakarta")).toBe("Sep 28, 2026, 05:30 GMT+7");
    });

    it("uses a 24-hour clock", () => {
      expect(formatEventDateTime(GUN_START, "Asia/Jakarta")).not.toContain("AM");
      expect(formatEventDateTime(GUN_START, "Asia/Jakarta")).not.toContain("PM");
    });
  });

  describe("edge", () => {
    it("does not crash on a timestamp outside the range a Date can hold", () => {
      expect(formatEventDateTime(99_999_999_999_999n, "UTC")).toBe("Unknown date");
    });
  });
});
