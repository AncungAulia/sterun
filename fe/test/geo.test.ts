import { describe, expect, it } from "vitest";

import { mapsLink, parseCoordinates } from "@/utils/geo";

describe("parseCoordinates", () => {
  describe("positive", () => {
    it("reads the pin out of a shared Google Maps link", () => {
      // The `@lat,lng,zoom` form, which is what the address bar shows after
      // dropping a pin. Parsing what somebody already has beats making them
      // find two numbers and type them into separate boxes.
      expect(
        parseCoordinates("https://www.google.com/maps/@-6.2185,106.8026,17z"),
      ).toEqual({ lat: -6.2185, lng: 106.8026 });
    });

    it("reads a place link with the pin after the place name", () => {
      expect(
        parseCoordinates(
          "https://www.google.com/maps/place/Gelora+Bung+Karno/@-6.2185,106.8026,17z/data=!3m1",
        ),
      ).toEqual({ lat: -6.2185, lng: 106.8026 });
    });

    it("reads the ?q= form", () => {
      expect(parseCoordinates("https://maps.google.com/?q=-6.2185,106.8026")).toEqual({
        lat: -6.2185,
        lng: 106.8026,
      });
    });

    it("reads coordinates pasted on their own", () => {
      expect(parseCoordinates("-6.2185, 106.8026")).toEqual({ lat: -6.2185, lng: 106.8026 });
    });

    it("reads a positive pair, north and east of zero", () => {
      expect(parseCoordinates("51.5007, -0.1246")).toEqual({ lat: 51.5007, lng: -0.1246 });
    });
  });

  describe("negative", () => {
    it("returns nothing for a link with no pin in it", () => {
      // A short link (maps.app.goo.gl) carries no coordinates until it is
      // followed, and following it from the browser is blocked cross origin.
      expect(parseCoordinates("https://maps.app.goo.gl/abc123")).toBeNull();
    });

    it("returns nothing for empty input", () => {
      expect(parseCoordinates("")).toBeNull();
      expect(parseCoordinates("   ")).toBeNull();
    });

    it("refuses a pair outside the range the planet has", () => {
      // 106,-6 reversed by hand is the classic mistake, and a latitude of 106
      // is the only sign of it available.
      expect(parseCoordinates("106.8026, -6.2185")).toBeNull();
    });

    it("is not fooled by numbers that are not a coordinate pair", () => {
      expect(parseCoordinates("https://example.test/events/2026")).toBeNull();
    });
  });
});

describe("mapsLink", () => {
  it("builds a link anybody can open, without an API key", () => {
    expect(mapsLink({ lat: -6.2185, lng: 106.8026 })).toBe(
      "https://www.google.com/maps?q=-6.2185,106.8026",
    );
  });
});
