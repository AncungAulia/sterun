import { describe, expect, it } from "vitest";

import { shortAddress } from "@/utils/format";

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
