import { describe, expect, it } from "vitest";

import type { Area, Nearby } from "@/lib/area";
import {
  entriesLine,
  inArea,
  matchesSearch,
  pickFeatured,
  placeLine,
  priceLine,
  sortByDate,
  sortByPlace,
} from "@/modules/directory/browse";

import { SUSD, category, entry, metadata, summary } from "./fixtures/directory";

const NOW = 1_800_000_000n;
const DAY = 86_400n;
const YOGYA: Area = { mode: "area", countryCode: "ID", country: "Indonesia", province: "DI Yogyakarta" };

function ids(entries: { summary: { event: { eventId: number } } }[]) {
  return entries.map((item) => item.summary.event.eventId);
}

describe("pickFeatured", () => {
  it("takes open, upcoming races that have a poster, soonest first", () => {
    const later = entry(summary(1, { startsAt: NOW + 9n * DAY }), metadata());
    const sooner = entry(summary(2, { startsAt: NOW + 2n * DAY }), metadata());

    expect(ids(pickFeatured([later, sooner], NOW))).toEqual([2, 1]);
  });

  it("holds at most three", () => {
    const entries = [1, 2, 3, 4].map((id) =>
      entry(summary(id, { startsAt: NOW + BigInt(id) * DAY }), metadata()),
    );

    expect(ids(pickFeatured(entries, NOW))).toEqual([1, 2, 3]);
  });

  it("breaks a tie on the date by event id", () => {
    const b = entry(summary(8, { startsAt: NOW + DAY }), metadata());
    const a = entry(summary(3, { startsAt: NOW + DAY }), metadata());

    expect(ids(pickFeatured([b, a], NOW))).toEqual([3, 8]);
  });

  it("returns nothing when there are no races", () => {
    expect(pickFeatured([], NOW)).toEqual([]);
  });

  it.each([
    ["has no poster", entry(summary(1, { startsAt: NOW + DAY }), metadata({ posterUrl: undefined }))],
    ["has no proven document", entry(summary(1, { startsAt: NOW + DAY }), null)],
    ["is not open", entry(summary(1, { startsAt: NOW + DAY, status: "Closed" }), metadata())],
    ["has already run", entry(summary(1, { startsAt: NOW - DAY }), metadata())],
  ])("leaves out a race that %s", (_label, candidate) => {
    expect(pickFeatured([candidate], NOW)).toEqual([]);
  });
});

describe("inArea", () => {
  const INDONESIA: Area = { mode: "area", countryCode: "ID", country: "Indonesia" };

  function raceIn(location: NonNullable<Parameters<typeof metadata>[0]>["location"]) {
    return entry(summary(1), metadata({ location }));
  }

  describe("a province", () => {
    it("matches a race in the same country and province", () => {
      expect(inArea(entry(summary(1), metadata()), YOGYA)).toBe(true);
    });

    it("ignores case and surrounding spaces in the province", () => {
      expect(inArea(raceIn({ province: " di yogyakarta ", countryCode: "ID" }), YOGYA)).toBe(true);
    });

    it("ignores case and surrounding spaces in the country code", () => {
      expect(inArea(raceIn({ province: "DI Yogyakarta", countryCode: " id " }), YOGYA)).toBe(true);
    });

    it("does not match another province", () => {
      expect(inArea(raceIn({ province: "DKI Jakarta", countryCode: "ID" }), YOGYA)).toBe(false);
    });

    it("does not match a province of the same name in another country", () => {
      expect(inArea(raceIn({ province: "DI Yogyakarta", countryCode: "MY" }), YOGYA)).toBe(false);
    });

    it.each([
      ["no document", entry(summary(1), null)],
      ["no location", entry(summary(1), metadata({ location: undefined }))],
      ["no province", raceIn({ countryCode: "ID", city: "Sleman" })],
    ])("does not match a race with %s", (_label, race) => {
      expect(inArea(race, YOGYA)).toBe(false);
    });
  });

  describe("a whole country", () => {
    it.each([
      ["DI Yogyakarta", { province: "DI Yogyakarta", countryCode: "ID" }],
      ["DKI Jakarta", { province: "DKI Jakarta", countryCode: "ID" }],
      ["no province named", { countryCode: "ID", city: "Sleman" }],
    ])("matches a race in that country with %s", (_label, location) => {
      expect(inArea(raceIn(location), INDONESIA)).toBe(true);
    });

    it("ignores case in the country code", () => {
      expect(inArea(raceIn({ province: "Bali", countryCode: "id" }), INDONESIA)).toBe(true);
      expect(inArea(raceIn({ province: "Bali", countryCode: "ID" }), { ...INDONESIA, countryCode: "id" })).toBe(true);
    });

    it("does not match a race in another country", () => {
      expect(inArea(raceIn({ province: "Selangor", countryCode: "MY" }), INDONESIA)).toBe(false);
    });

    it.each([
      ["no document", entry(summary(1), null)],
      ["no location", entry(summary(1), metadata({ location: undefined }))],
      ["no country code", raceIn({ province: "DI Yogyakarta", city: "Sleman" })],
      ["a blank country code", raceIn({ province: "DI Yogyakarta", countryCode: "  " })],
    ])("does not match a race with %s", (_label, race) => {
      expect(inArea(race, INDONESIA)).toBe(false);
    });
  });
});

describe("matchesSearch", () => {
  const race = entry(summary(1, { name: "Elektro Dash 2026" }), metadata());

  it("matches everything on an empty query", () => {
    expect(matchesSearch(race, "   ")).toBe(true);
  });

  it.each([
    ["the name, in any case", "elektro"],
    ["the venue", "ft ugm"],
    ["the city", "Sleman"],
    ["the province", "yogyakarta"],
  ])("matches %s", (_label, query) => {
    expect(matchesSearch(race, query)).toBe(true);
  });

  it("does not match text that is nowhere on the race", () => {
    expect(matchesSearch(race, "bandung")).toBe(false);
  });

  it("cannot match a city when the document is not proven", () => {
    expect(matchesSearch(entry(summary(1, { name: "Elektro Dash" }), null), "sleman")).toBe(false);
  });
});

describe("sortByDate", () => {
  const past = entry(summary(1, { startsAt: NOW - 5n * DAY }));
  const recentPast = entry(summary(2, { startsAt: NOW - DAY }));
  const soon = entry(summary(3, { startsAt: NOW + DAY }));
  const later = entry(summary(4, { startsAt: NOW + 9n * DAY }));

  it("puts upcoming races soonest first, then past races most recent first", () => {
    expect(ids(sortByDate([past, later, recentPast, soon], "soonest", NOW))).toEqual([3, 4, 2, 1]);
  });

  it("puts upcoming races latest first, and still keeps past races below them", () => {
    expect(ids(sortByDate([past, later, recentPast, soon], "latest", NOW))).toEqual([4, 3, 2, 1]);
  });
});

describe("entriesLine", () => {
  it("counts entries left across distances", () => {
    const race = summary(1, {}, [category(0), category(1, { quota: 50, enteredCount: 20 })]);

    expect(entriesLine(race)).toBe("150 entries left");
  });

  it("says one entry, not one entries", () => {
    expect(entriesLine(summary(1, {}, [category(0, { quota: 5, enteredCount: 4 })]))).toBe("1 entry left");
  });

  it("says Sold out when every distance is full", () => {
    expect(entriesLine(summary(1, {}, [category(0, { quota: 5, enteredCount: 5 })]))).toBe("Sold out");
  });

  it("says nothing for a race without distances", () => {
    expect(entriesLine(summary(1))).toBeNull();
  });

  it("says nothing for a race that is not open", () => {
    expect(entriesLine(summary(1, { status: "Closed" }, [category(0)]))).toBeNull();
  });
});

describe("priceLine", () => {
  it("starts from the cheapest distance", () => {
    const categories = [category(0, { priceStroops: 40n * SUSD }), category(1, { priceStroops: 25n * SUSD })];

    expect(priceLine(categories)).toBe("From sUSD 25");
  });

  it("says Free when every distance is free", () => {
    expect(priceLine([category(0, { priceStroops: 0n }), category(1, { priceStroops: 0n })])).toBe("Free");
  });

  it("gives the range when only some distances are free", () => {
    const categories = [category(0, { priceStroops: 0n }), category(1, { priceStroops: 40n * SUSD })];

    expect(priceLine(categories)).toBe("Free to sUSD 40");
  });

  it("says nothing without distances", () => {
    expect(priceLine([])).toBeNull();
  });
});

describe("placeLine", () => {
  it("joins the venue and the city", () => {
    expect(placeLine(metadata())).toBe("FT UGM, Sleman");
  });

  it("does not repeat a city the venue already names", () => {
    expect(placeLine(metadata({ location: { name: "GBK, Jakarta", city: "Jakarta" } }))).toBe("GBK, Jakarta");
  });

  it("uses whichever of the two the document has", () => {
    expect(placeLine(metadata({ location: { city: "Sleman" } }))).toBe("Sleman");
    expect(placeLine(metadata({ location: { name: "FT UGM" } }))).toBe("FT UGM");
  });

  it("says nothing without a proven location", () => {
    expect(placeLine(null)).toBeNull();
    expect(placeLine(metadata({ location: undefined }))).toBeNull();
  });
});

const JAKARTA = {
  name: "Monas",
  city: "Jakarta Pusat",
  province: "DKI Jakarta",
  country: "Indonesia",
  countryCode: "ID",
};

/** A race in DI Yogyakarta, the province `YOGYA` names. */
function here(eventId: number, days: number) {
  return entry(summary(eventId, { startsAt: NOW + BigInt(days) * DAY }), metadata());
}

/** A race in Jakarta: the same country, another province. */
function away(eventId: number, days: number) {
  return entry(
    summary(eventId, { startsAt: NOW + BigInt(days) * DAY }),
    metadata({ location: JAKARTA }),
  );
}

describe("sortByPlace", () => {
  const all = [away(3, 0), here(2, 9), away(4, 5), here(1, 1)];

  it("keeps every race and leads with the chosen place, each group in date order", () => {
    expect(ids(sortByPlace(all, YOGYA, "soonest", NOW))).toEqual([1, 2, 3, 4]);
  });

  it("honours furthest date first inside both groups", () => {
    expect(ids(sortByPlace(all, YOGYA, "latest", NOW))).toEqual([2, 1, 4, 3]);
  });

  it("is exactly the date order when no place is chosen", () => {
    expect(ids(sortByPlace(all, null, "soonest", NOW))).toEqual(ids(sortByDate(all, "soonest", NOW)));
    expect(ids(sortByPlace(all, null, "latest", NOW))).toEqual(ids(sortByDate(all, "latest", NOW)));
  });

  it("never counts a race without a proven location as being in the place", () => {
    const unproven = entry(summary(5, { startsAt: NOW + 2n * DAY }), metadata({ location: undefined }));

    expect(ids(sortByPlace([unproven, here(2, 9)], YOGYA, "soonest", NOW))).toEqual([2, 5]);
  });

  it("still lists the races elsewhere when the place holds none", () => {
    expect(ids(sortByPlace([away(4, 5), away(3, 0)], YOGYA, "soonest", NOW))).toEqual([3, 4]);
  });

  // The place decides the order inside "still to come" and inside "already run",
  // never across the two. A race in the chosen place that happened last year is
  // still a race nobody can enter, so it belongs below next week's race
  // elsewhere.
  const mixed = [here(1, -3), away(2, -10), here(3, 20), away(4, 2), here(5, 40)];

  it("keeps a past race in the chosen place below every upcoming race", () => {
    expect(ids(sortByPlace(mixed, YOGYA, "soonest", NOW))).toEqual([3, 5, 4, 1, 2]);
  });

  it("keeps a past race in the chosen place below every upcoming race, furthest date first", () => {
    expect(ids(sortByPlace(mixed, YOGYA, "latest", NOW))).toEqual([5, 3, 4, 1, 2]);
  });
});

describe("pickFeatured with a chosen place", () => {
  it("leads with a race in the place even when one elsewhere is sooner", () => {
    expect(ids(pickFeatured([away(1, 1), here(2, 30)], NOW, { place: YOGYA }))).toEqual([2, 1]);
  });

  it("fills the rest of the row from elsewhere, soonest first", () => {
    expect(ids(pickFeatured([away(1, 9), away(2, 4), here(3, 30)], NOW, { place: YOGYA }))).toEqual([3, 2, 1]);
  });

  it("still holds at most three", () => {
    expect(ids(pickFeatured([here(1, 5), here(2, 6), away(3, 1), away(4, 2)], NOW, { place: YOGYA }))).toEqual([
      1, 2, 3,
    ]);
  });

  it("still leaves out a race that is closed, already run, or has no poster", () => {
    // Asserted against a row that does fill: an empty result is what any broken
    // call returns, so it proves nothing about which races were rejected.
    const closed = entry(summary(1, { startsAt: NOW + DAY, status: "Closed" }), metadata());
    const past = entry(summary(2, { startsAt: NOW - DAY }), metadata());
    const posterless = entry(summary(3, { startsAt: NOW + DAY }), metadata({ posterUrl: undefined }));

    expect(ids(pickFeatured([closed, past, posterless, here(4, 2), away(5, 1)], NOW, { place: YOGYA }))).toEqual([
      4, 5,
    ]);
  });

  it("orders by date alone when no place is chosen", () => {
    expect(ids(pickFeatured([away(1, 1), here(2, 30)], NOW, {}))).toEqual([1, 2]);
  });
});

describe("sortByPlace, from the visitor's own coordinates", () => {
  const AT_TUGU: Nearby = { mode: "nearby", lat: -7.7828, lng: 110.3671 };
  const YOGYAKARTA = { lat: -7.7828, lng: 110.3671 };
  const SEMARANG = { lat: -6.9667, lng: 110.4167 };
  const JAKARTA_PIN = { lat: -6.1754, lng: 106.8272 };

  /** A race whose document gives a venue pin, so its distance can be measured. */
  function pinned(eventId: number, days: number, pin: { lat: number; lng: number }) {
    return entry(
      summary(eventId, { startsAt: NOW + BigInt(days) * DAY }),
      metadata({ location: { ...JAKARTA, ...pin } }),
    );
  }

  /** A race with a proven document that carries no coordinates. */
  function unpinned(eventId: number, days: number) {
    return entry(summary(eventId, { startsAt: NOW + BigInt(days) * DAY }), metadata());
  }

  it("leads with the nearest race, whatever its date", () => {
    const races = [pinned(3, 1, JAKARTA_PIN), pinned(1, 20, YOGYAKARTA), pinned(2, 9, SEMARANG)];

    expect(ids(sortByPlace(races, AT_TUGU, "soonest", NOW))).toEqual([1, 2, 3]);
  });

  it("puts the races it cannot measure after the ones it can, in date order", () => {
    const races = [unpinned(5, 20), pinned(1, 30, JAKARTA_PIN), unpinned(6, 2)];

    expect(ids(sortByPlace(races, AT_TUGU, "soonest", NOW))).toEqual([1, 6, 5]);
  });

  it("keeps those unmeasured races in the drawer's order when it is reversed", () => {
    const races = [unpinned(5, 20), pinned(1, 30, JAKARTA_PIN), unpinned(6, 2)];

    expect(ids(sortByPlace(races, AT_TUGU, "latest", NOW))).toEqual([1, 5, 6]);
  });

  it("keeps a race already run below every upcoming race, however near it is", () => {
    // The date split is still the outer key. A race at the end of the street
    // that happened last month is not something anybody can enter.
    const races = [pinned(1, -3, YOGYAKARTA), pinned(2, 12, JAKARTA_PIN)];

    expect(ids(sortByPlace(races, AT_TUGU, "soonest", NOW))).toEqual([2, 1]);
  });

  it("orders the races already run by distance too", () => {
    const races = [pinned(1, -30, JAKARTA_PIN), pinned(2, -2, SEMARANG), pinned(3, 5, JAKARTA_PIN)];

    expect(ids(sortByPlace(races, AT_TUGU, "soonest", NOW))).toEqual([3, 2, 1]);
  });

  it("keeps the date order between two races the same distance away", () => {
    const races = [pinned(2, 20, SEMARANG), pinned(1, 4, SEMARANG)];

    expect(ids(sortByPlace(races, AT_TUGU, "soonest", NOW))).toEqual([1, 2]);
    expect(ids(sortByPlace(races, AT_TUGU, "latest", NOW))).toEqual([2, 1]);
  });

  it("measures across the antimeridian rather than round the planet", () => {
    const westOfTheLine = { lat: -16.5, lng: 179.5 };
    const eastOfTheLine = { lat: -16.5, lng: -179.5 };
    const atTheLine: Nearby = { mode: "nearby", lat: -16.5, lng: 179.9 };
    const races = [pinned(1, 5, JAKARTA_PIN), pinned(2, 9, eastOfTheLine), pinned(3, 12, westOfTheLine)];

    expect(ids(sortByPlace(races, atTheLine, "soonest", NOW))).toEqual([3, 2, 1]);
  });

  it("counts a race with only half a pin as unmeasurable", () => {
    // A document with a latitude and no longitude names no point at all, and
    // guessing the other half would rank it by a number nobody wrote.
    const half = entry(
      summary(5, { startsAt: NOW + DAY }),
      metadata({ location: { ...JAKARTA, lat: -7.78 } }),
    );

    expect(ids(sortByPlace([half, pinned(1, 30, JAKARTA_PIN)], AT_TUGU, "soonest", NOW))).toEqual([1, 5]);
  });

  it("still lists every race when none of them carries a pin", () => {
    expect(ids(sortByPlace([unpinned(2, 20), unpinned(1, 4)], AT_TUGU, "soonest", NOW))).toEqual([1, 2]);
  });

  it("leads the featured row with the nearest race", () => {
    const races = [pinned(1, 2, JAKARTA_PIN), pinned(2, 30, YOGYAKARTA), pinned(3, 9, SEMARANG)];

    expect(ids(pickFeatured(races, NOW, { place: AT_TUGU }))).toEqual([2, 3, 1]);
  });
});
