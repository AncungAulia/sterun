import { describe, expect, it } from "vitest";

import {
  entriesLine,
  inArea,
  matchesSearch,
  pickFeatured,
  placeLine,
  priceLine,
  sortByDate,
} from "@/modules/directory/browse";

import { SUSD, category, entry, metadata, summary } from "./fixtures/directory";

const NOW = 1_800_000_000n;
const DAY = 86_400n;
const YOGYA = { countryCode: "ID", country: "Indonesia", province: "DI Yogyakarta" };

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
  it("matches a race in the same country and province", () => {
    expect(inArea(entry(summary(1), metadata()), YOGYA)).toBe(true);
  });

  it("ignores case and surrounding spaces in the province", () => {
    const race = entry(summary(1), metadata({ location: { province: " di yogyakarta ", countryCode: "ID" } }));

    expect(inArea(race, YOGYA)).toBe(true);
  });

  it("does not match another province", () => {
    const race = entry(summary(1), metadata({ location: { province: "DKI Jakarta", countryCode: "ID" } }));

    expect(inArea(race, YOGYA)).toBe(false);
  });

  it("does not match a province of the same name in another country", () => {
    const race = entry(summary(1), metadata({ location: { province: "DI Yogyakarta", countryCode: "MY" } }));

    expect(inArea(race, YOGYA)).toBe(false);
  });

  it.each([
    ["no document", entry(summary(1), null)],
    ["no location", entry(summary(1), metadata({ location: undefined }))],
    ["no province", entry(summary(1), metadata({ location: { countryCode: "ID", city: "Sleman" } }))],
  ])("does not match a race with %s", (_label, race) => {
    expect(inArea(race, YOGYA)).toBe(false);
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
