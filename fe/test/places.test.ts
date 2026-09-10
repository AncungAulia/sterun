import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PLACES_ATTRIBUTION,
  countries,
  countryName,
  fetchCities,
  hasCities,
  provinceName,
  provincesOf,
} from "@/lib/places";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Stands in for the static file the browser would fetch from `public/`. */
function servingCities(body: unknown, ok = true) {
  const fetcher = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 404,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

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

    it("fetches one country's cities, keyed by province", async () => {
      const jakarta = provincesOf("ID").find((p) => p.name === "DKI Jakarta")!;
      const fetcher = servingCities({ [jakarta.id]: ["Jakarta Pusat", "Jakarta Selatan"] });

      const cities = await fetchCities("ID");

      expect(fetcher).toHaveBeenCalledWith("/places/ID.json");
      expect(cities[String(jakarta.id)]).toEqual(["Jakarta Pusat", "Jakarta Selatan"]);
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
    it("says which countries have cities, which is now nearly all of them", () => {
      // Was Indonesia alone. The per-country split (2.1 MB across 223 files,
      // one fetched at a time) is what made the rest affordable.
      expect(hasCities("ID")).toBe(true);
      expect(hasCities("US")).toBe(true);
      expect(hasCities("CN")).toBe(true);
      expect(hasCities("ZZ")).toBe(false);
    });

    it("returns an empty list rather than throwing for an unknown country", () => {
      expect(provincesOf("ZZ")).toEqual([]);
      expect(countryName("ZZ")).toBeNull();
    });

    it("asks for nothing when the country has no file to ask for", async () => {
      const fetcher = servingCities({});

      expect(await fetchCities("ZZ")).toEqual({});
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("has no province name for an id that is not in that country", () => {
      expect(provinceName("ID", 999_999)).toBeNull();
    });
  });

  describe("negative", () => {
    it("hands back an empty list when the file will not load, rather than throwing", async () => {
      // The city field falls back to a text input on an empty list, so a
      // failed fetch costs the organiser a dropdown, not the form.
      servingCities(null, false);

      await expect(fetchCities("CN")).resolves.toEqual({});
    });

    it("survives a file that is not the shape it should be", async () => {
      servingCities(["this is not a map of provinces"]);

      await expect(fetchCities("CN")).resolves.toEqual({});
    });

    it("survives the network refusing outright", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => {
        throw new Error("offline");
      }));

      await expect(fetchCities("CN")).resolves.toEqual({});
    });
  });
});
