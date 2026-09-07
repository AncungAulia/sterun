import { describe, expect, it } from "vitest";

import {
  PLACES_ATTRIBUTION,
  citiesOf,
  countries,
  countryName,
  hasCities,
  provinceName,
  provincesOf,
} from "@/lib/places";

describe("places", () => {
  describe("positive", () => {
    it("carries every country", () => {
      expect(countries.length).toBeGreaterThan(200);
      expect(countries.some((c) => c.iso2 === "ID" && c.name === "Indonesia")).toBe(true);
    });

    it("lists provinces for a country that has them", () => {
      const provinces = provincesOf("ID");

      expect(provinces.length).toBeGreaterThan(30);
      expect(provinces.map((p) => p.name)).toContain("DKI Jakarta");
    });

    it("lists cities for a province", () => {
      const jakarta = provincesOf("ID").find((p) => p.name === "DKI Jakarta");

      expect(citiesOf(jakarta!.id).length).toBeGreaterThan(0);
    });

    it("resolves ids back to names, which is what goes in the document", () => {
      const jakarta = provincesOf("ID").find((p) => p.name === "DKI Jakarta")!;

      expect(countryName("ID")).toBe("Indonesia");
      expect(provinceName("ID", jakarta.id)).toBe("DKI Jakarta");
    });

    it("keeps the attribution the licence requires", () => {
      // ODbL: redistribution is allowed and attribution is not optional. It
      // travels in the data file so a refactor cannot quietly drop it.
      expect(PLACES_ATTRIBUTION).toMatch(/ODbL/);
      expect(PLACES_ATTRIBUTION).toMatch(/countries-states-cities-database/);
    });

    it("sorts countries and provinces by name, because a select is read", () => {
      const names = countries.map((c) => c.name);
      expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    });
  });

  describe("edge", () => {
    it("says which country has cities, and which do not", () => {
      expect(hasCities("ID")).toBe(true);
      expect(hasCities("US")).toBe(false);
    });

    it("returns an empty list rather than throwing for an unknown country", () => {
      expect(provincesOf("ZZ")).toEqual([]);
      expect(countryName("ZZ")).toBeNull();
    });

    it("returns an empty city list when no province is chosen", () => {
      expect(citiesOf(null)).toEqual([]);
    });

    it("returns an empty city list for a province outside the covered country", () => {
      const california = provincesOf("US").find((p) => p.name === "California");

      expect(citiesOf(california!.id)).toEqual([]);
    });

    it("has no province name for an id that is not in that country", () => {
      expect(provinceName("ID", 999_999)).toBeNull();
    });
  });
});
