import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useArea } from "@/hooks/useArea";
import {
  AREA_STORAGE_KEY,
  markAsked,
  parseStoredPlace,
  placeLabel,
  type Area,
  type Nearby,
} from "@/lib/area";

const YOGYA: Area = { mode: "area", countryCode: "ID", country: "Indonesia", province: "DI Yogyakarta" };
const INDONESIA: Area = { mode: "area", countryCode: "ID", country: "Indonesia" };
const NEAR: Nearby = { mode: "nearby", lat: -7.7828, lng: 110.3671 };

/** What is actually in localStorage, parsed, so the shape itself is asserted. */
function stored() {
  return JSON.parse(window.localStorage.getItem(AREA_STORAGE_KEY) ?? "null");
}

beforeEach(() => window.localStorage.clear());

describe("useArea", () => {
  describe("positive", () => {
    it("starts with no place and nothing asked", () => {
      const { result } = renderHook(() => useArea());

      expect(result.current.place).toBeNull();
      expect(result.current.asked).toBe(false);
    });

    it("keeps a chosen place in this browser and hands it back", () => {
      const { result } = renderHook(() => useArea());

      act(() => result.current.setPlace(YOGYA));

      expect(result.current.place).toEqual(YOGYA);
      expect(stored()).toEqual({ place: YOGYA, asked: true });
    });

    it("keeps a whole country, with no province", () => {
      const { result } = renderHook(() => useArea());

      act(() => result.current.setPlace(INDONESIA));

      expect(result.current.place).toStrictEqual(INDONESIA);
    });

    it("keeps the coordinates the browser handed over", () => {
      const { result } = renderHook(() => useArea());

      act(() => result.current.setPlace(NEAR));

      expect(result.current.place).toStrictEqual(NEAR);
      expect(stored()).toEqual({ place: NEAR, asked: true });
    });

    it("replaces coordinates with a place picked by hand", () => {
      const { result } = renderHook(() => useArea());
      act(() => result.current.setPlace(NEAR));

      act(() => result.current.setPlace(YOGYA));

      expect(result.current.place).toStrictEqual(YOGYA);
    });

    it("forgets the place when cleared, and remembers that we asked", () => {
      // The flag has to outlive the place. Dropping it here would show the
      // browser's prompt again to somebody who has just chosen all locations.
      const { result } = renderHook(() => useArea());
      act(() => result.current.setPlace(YOGYA));

      act(() => result.current.clearPlace());

      expect(result.current.place).toBeNull();
      expect(result.current.asked).toBe(true);
      expect(stored()).toEqual({ place: null, asked: true });
    });

    it("records that the prompt has been shown, without a place", () => {
      const { result } = renderHook(() => useArea());

      act(() => markAsked());

      expect(result.current.asked).toBe(true);
      expect(result.current.place).toBeNull();
    });

    it("leaves a saved place alone when recording that the prompt was shown", () => {
      const { result } = renderHook(() => useArea());
      act(() => result.current.setPlace(YOGYA));

      act(() => markAsked());

      expect(result.current.place).toEqual(YOGYA);
    });
  });

  describe("edge", () => {
    it("reads a place saved on an earlier visit", () => {
      window.localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify({ place: YOGYA, asked: true }));

      const { result } = renderHook(() => useArea());

      expect(result.current.place).toEqual(YOGYA);
      expect(result.current.asked).toBe(true);
    });

    it("reads a place saved before the prompt existed", () => {
      // The old shape was the area itself at the top level, with no `mode` and
      // no flag. A visitor who picked a province then must not lose it now.
      window.localStorage.setItem(
        AREA_STORAGE_KEY,
        JSON.stringify({ countryCode: "ID", country: "Indonesia", province: "DI Yogyakarta" }),
      );

      const { result } = renderHook(() => useArea());

      expect(result.current.place).toStrictEqual(YOGYA);
      expect(result.current.asked).toBe(false);
    });

    it("reads a whole country saved before the prompt existed", () => {
      window.localStorage.setItem(
        AREA_STORAGE_KEY,
        JSON.stringify({ countryCode: "MY", country: "Malaysia" }),
      );

      expect(parseStoredPlace(window.localStorage.getItem(AREA_STORAGE_KEY))).toStrictEqual({
        place: { mode: "area", countryCode: "MY", country: "Malaysia" },
        asked: false,
      });
    });

    it("removes the key entirely when clearing a place nobody was asked about", () => {
      window.localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify({ place: YOGYA, asked: false }));
      const { result } = renderHook(() => useArea());

      act(() => result.current.clearPlace());

      expect(window.localStorage.getItem(AREA_STORAGE_KEY)).toBeNull();
    });

    it("follows a change made in another tab", () => {
      const { result } = renderHook(() => useArea());

      act(() => {
        window.localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify({ place: YOGYA, asked: true }));
        window.dispatchEvent(new StorageEvent("storage", { key: AREA_STORAGE_KEY }));
      });

      expect(result.current.place).toEqual(YOGYA);
    });

    it("trims the province it reads", () => {
      expect(
        parseStoredPlace(JSON.stringify({ place: { ...YOGYA, province: "  DI Yogyakarta " }, asked: true })).place,
      ).toEqual(YOGYA);
    });

    it.each([
      ["missing", JSON.stringify(INDONESIA)],
      ["blank", JSON.stringify({ ...INDONESIA, province: "   " })],
      ["null", JSON.stringify({ ...INDONESIA, province: null })],
    ])("reads a whole country when the province is %s", (_label, raw) => {
      // Strict, so a blank province is dropped rather than kept as "" or undefined.
      expect(parseStoredPlace(raw).place).toStrictEqual(INDONESIA);
    });

    it("reads coordinates on the edges of the planet", () => {
      const edge = { mode: "nearby", lat: -90, lng: 180 };

      expect(parseStoredPlace(JSON.stringify({ place: edge, asked: true })).place).toStrictEqual(edge);
    });

    it("treats nothing stored as nothing chosen and nothing asked", () => {
      expect(parseStoredPlace(null)).toStrictEqual({ place: null, asked: false });
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
      ["a mode this app never wrote", JSON.stringify({ ...INDONESIA, mode: "gps" })],
    ])("ignores a stored value that is %s", (_label, raw) => {
      expect(parseStoredPlace(raw).place).toBeNull();
    });

    it.each([
      ["a latitude past the pole", { mode: "nearby", lat: 106.8, lng: -6.2 }],
      ["a longitude past the antimeridian", { mode: "nearby", lat: -6.2, lng: 181 }],
      ["coordinates that are text", { mode: "nearby", lat: "-6.2", lng: "106.8" }],
      ["a missing longitude", { mode: "nearby", lat: -6.2 }],
      ["a latitude that is not a number", { mode: "nearby", lat: null, lng: 106.8 }],
    ])("ignores coordinates with %s", (_label, place) => {
      // A swapped pair is the realistic corruption, and a latitude of 106 is
      // its only symptom. Read back, it would order the list from Antarctica.
      expect(parseStoredPlace(JSON.stringify({ place, asked: true })).place).toBeNull();
    });

    it("keeps the flag even when the place beside it cannot be read", () => {
      expect(parseStoredPlace(JSON.stringify({ place: { mode: "nearby" }, asked: true }))).toStrictEqual({
        place: null,
        asked: true,
      });
    });

    it("carries on without a place when storage refuses", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });

      const { result } = renderHook(() => useArea());

      expect(result.current.place).toBeNull();
      expect(result.current.asked).toBe(false);
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

  it("says Near you for coordinates, because naming them needs a geocoder", () => {
    expect(placeLabel(NEAR)).toBe("Near you");
  });
});
