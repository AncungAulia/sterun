import { describe, expect, it } from "vitest";

import { mapsLink, parseCoordinates } from "@/utils/geo";

describe("parseCoordinates", () => {
  describe("positive", () => {
    it("prefers the pinned place over the centre of the map view", () => {
      // The bug Ancung hit: `@` is where the map happened to be sitting, and it
      // moves with every pan and zoom. The place's own point is in `data=`, and
      // the two are about 40 m apart in this very link.
      expect(
        parseCoordinates(
          "https://www.google.com/maps/place/Faculty+of+Engineering+UGM/@-7.7656,110.3718,17z/data=!3m1!4b1!4m6!3m5!1s0x2e7a5978!8m2!3d-7.76539!4d110.37254!16s%2Fg%2F11abc",
        ),
      ).toEqual({ lat: -7.76539, lng: 110.37254 });
    });

    it("reads the place pin when it carries no !8m2 group", () => {
      expect(
        parseCoordinates(
          "https://www.google.com/maps/place/Gelora+Bung+Karno/@-6.21,106.8,17z/data=!4m2!3d-6.2185!4d106.8026",
        ),
      ).toEqual({ lat: -6.2185, lng: 106.8026 });
    });

    it("falls back to ?q= when there is no place pin", () => {
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

    it("still reads a link that carries only the map view", () => {
      // The `@lat,lng,zoom` form on its own is the last thing tried, and a
      // rough point beats no point: without one the wizard cannot continue.
      expect(parseCoordinates("https://www.google.com/maps/@-6.2185,106.8026,17z")).toEqual({
        lat: -6.2185,
        lng: 106.8026,
      });
    });

    it("prefers an explicit ?q= over the map view in the same link", () => {
      expect(
        parseCoordinates("https://www.google.com/maps/@-6.21,106.8,17z?q=-6.2185,106.8026"),
      ).toEqual({ lat: -6.2185, lng: 106.8026 });
    });

    it("keeps the order all the way down: place pin, then ?q=, then @", () => {
      const link =
        "https://www.google.com/maps/place/X/@-1.1,101.1,17z/data=!8m2!3d-3.3!4d103.3?q=-2.2,102.2";
      expect(parseCoordinates(link)).toEqual({ lat: -3.3, lng: 103.3 });
      expect(parseCoordinates(link.replace("!8m2!3d-3.3!4d103.3", "!3m1"))).toEqual({
        lat: -2.2,
        lng: 102.2,
      });
      expect(
        parseCoordinates(
          link.replace("!8m2!3d-3.3!4d103.3", "!3m1").replace("?q=-2.2,102.2", ""),
        ),
      ).toEqual({ lat: -1.1, lng: 101.1 });
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

    it("refuses a place pin whose numbers are swapped", () => {
      // The same reversal, this time inside `data=`. A latitude of 110 is not a
      // place on this planet, so it is rejected rather than saved.
      expect(
        parseCoordinates("https://www.google.com/maps/place/X/data=!8m2!3d110.37254!4d-7.76539"),
      ).toBeNull();
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
