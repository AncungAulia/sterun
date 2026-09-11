import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useArea } from "@/hooks/useArea";
import { AREA_STORAGE_KEY, parseArea, placeLabel } from "@/lib/area";

const YOGYA = { countryCode: "ID", country: "Indonesia", province: "DI Yogyakarta" };
const INDONESIA = { countryCode: "ID", country: "Indonesia" };

beforeEach(() => window.localStorage.clear());

describe("useArea", () => {
  describe("positive", () => {
    it("starts with no area", () => {
      const { result } = renderHook(() => useArea());

      expect(result.current.area).toBeNull();
    });

    it("keeps a chosen area in this browser and hands it back", () => {
      const { result } = renderHook(() => useArea());

      act(() => result.current.setArea(YOGYA));

      expect(result.current.area).toEqual(YOGYA);
      expect(JSON.parse(window.localStorage.getItem(AREA_STORAGE_KEY) ?? "null")).toEqual(YOGYA);
    });

    it("keeps a whole country, with no province", () => {
      const { result } = renderHook(() => useArea());

      act(() => result.current.setArea(INDONESIA));

      expect(result.current.area).toStrictEqual(INDONESIA);
    });

    it("forgets the area when cleared", () => {
      const { result } = renderHook(() => useArea());
      act(() => result.current.setArea(YOGYA));

      act(() => result.current.clearArea());

      expect(result.current.area).toBeNull();
      expect(window.localStorage.getItem(AREA_STORAGE_KEY)).toBeNull();
    });
  });

  describe("edge", () => {
    it("reads an area saved on an earlier visit", () => {
      window.localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify(YOGYA));

      const { result } = renderHook(() => useArea());

      expect(result.current.area).toEqual(YOGYA);
    });

    it("follows a change made in another tab", () => {
      const { result } = renderHook(() => useArea());

      act(() => {
        window.localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify(YOGYA));
        window.dispatchEvent(new StorageEvent("storage", { key: AREA_STORAGE_KEY }));
      });

      expect(result.current.area).toEqual(YOGYA);
    });

    it("trims the province it reads", () => {
      expect(parseArea(JSON.stringify({ ...YOGYA, province: "  DI Yogyakarta " }))).toEqual(YOGYA);
    });

    it.each([
      ["missing", JSON.stringify(INDONESIA)],
      ["blank", JSON.stringify({ ...INDONESIA, province: "   " })],
      ["null", JSON.stringify({ ...INDONESIA, province: null })],
    ])("reads a whole country when the province is %s", (_label, raw) => {
      // Strict, so a blank province is dropped rather than kept as "" or undefined.
      expect(parseArea(raw)).toStrictEqual(INDONESIA);
    });
  });

  describe("negative", () => {
    it.each([
      ["not JSON", "{"],
      ["a lowercase country code", JSON.stringify({ ...YOGYA, countryCode: "id" })],
      ["missing the country code", JSON.stringify({ country: "Indonesia", province: "Bali" })],
      ["missing the country name", JSON.stringify({ countryCode: "ID", province: "Bali" })],
      ["a province that is not text", JSON.stringify({ ...INDONESIA, province: 34 })],
      ["not an object", JSON.stringify("DI Yogyakarta")],
    ])("ignores a stored value that is %s", (_label, raw) => {
      expect(parseArea(raw)).toBeNull();
    });

    it("carries on without an area when storage refuses", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });

      const { result } = renderHook(() => useArea());

      expect(result.current.area).toBeNull();
    });
  });
});

describe("placeLabel", () => {
  it("names the province and its country", () => {
    expect(placeLabel(YOGYA)).toBe("DI Yogyakarta, Indonesia");
  });

  it("names only the country when no province is chosen", () => {
    expect(placeLabel(INDONESIA)).toBe("Indonesia");
  });
});
