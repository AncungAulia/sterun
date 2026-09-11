import { describe, expect, it } from "vitest";

import {
  DISTANCE_BUCKETS,
  NO_FILTERS,
  PRICE_BUCKETS,
  activeFilterCount,
  filterChips,
  locationGroups,
  matchesFilters,
  type DistanceBucketId,
  type PriceBucketId,
} from "@/modules/directory/filters";

import { SUSD, category, entry, metadata, summary } from "./fixtures/directory";

function priceBucket(id: PriceBucketId) {
  const bucket = PRICE_BUCKETS.find((item) => item.id === id);
  if (!bucket) throw new Error(`no price bucket ${id}`);
  return bucket;
}

function distanceBucket(id: DistanceBucketId) {
  const bucket = DISTANCE_BUCKETS.find((item) => item.id === id);
  if (!bucket) throw new Error(`no distance bucket ${id}`);
  return bucket;
}

const JAKARTA = { name: "GBK", city: "Jakarta Pusat", province: "DKI Jakarta", country: "Indonesia", countryCode: "ID" };
const SELANGOR = { name: "Shah Alam", city: "Shah Alam", province: "Selangor", country: "Malaysia", countryCode: "MY" };

describe("PRICE_BUCKETS", () => {
  it.each([
    ["free", 0n, true],
    ["free", 1n, false],
    ["under-25", 1n, true],
    ["under-25", 25n * SUSD - 1n, true],
    ["under-25", 25n * SUSD, false],
    ["25-50", 25n * SUSD, true],
    ["25-50", 50n * SUSD, false],
    ["50-100", 50n * SUSD, true],
    ["50-100", 100n * SUSD, false],
    ["100-up", 100n * SUSD, true],
  ] as const)("%s holds %s stroops: %s", (id, price, expected) => {
    expect(priceBucket(id).matches(price)).toBe(expected);
  });

  it("puts every price in exactly one bucket", () => {
    for (const price of [0n, 1n, 24n * SUSD, 25n * SUSD, 49n * SUSD, 50n * SUSD, 99n * SUSD, 100n * SUSD, 900n * SUSD]) {
      expect(PRICE_BUCKETS.filter((bucket) => bucket.matches(price))).toHaveLength(1);
    }
  });

  it("labels buckets without a dash", () => {
    for (const bucket of [...PRICE_BUCKETS, ...DISTANCE_BUCKETS]) {
      expect(bucket.label).not.toMatch(/[—–]/);
    }
  });
});

describe("DISTANCE_BUCKETS", () => {
  it.each([
    ["5k", 5_000, true],
    ["5k", 5_001, false],
    ["10k", 5_001, true],
    ["10k", 10_000, true],
    ["21k", 10_001, true],
    ["21k", 21_097, true],
    ["21k", 21_100, true],
    ["over-21k", 21_101, true],
    ["over-21k", 42_195, true],
  ] as const)("%s holds %s m: %s", (id, metres, expected) => {
    expect(distanceBucket(id).matches(metres)).toBe(expected);
  });

  it("puts every distance in exactly one bucket", () => {
    for (const metres of [1_000, 5_000, 7_000, 10_000, 15_000, 21_098, 30_000, 42_195]) {
      expect(DISTANCE_BUCKETS.filter((bucket) => bucket.matches(metres))).toHaveLength(1);
    }
  });
});

describe("matchesFilters", () => {
  const free = entry(summary(1, {}, [category(0, { priceStroops: 0n })]), metadata());
  const pricey = entry(summary(2, {}, [category(0, { priceStroops: 120n * SUSD })]), metadata({ location: JAKARTA }));
  const closed = entry(summary(3, { status: "Closed" }, [category(0, { priceStroops: 0n })]), metadata());

  it("lets everything through with no filters", () => {
    expect([free, pricey, closed].every((race) => matchesFilters(race, NO_FILTERS))).toBe(true);
  });

  it("keeps only races open for entry", () => {
    expect(matchesFilters(closed, { ...NO_FILTERS, openOnly: true })).toBe(false);
    expect(matchesFilters(free, { ...NO_FILTERS, openOnly: true })).toBe(true);
  });

  it("keeps only races in a selected province", () => {
    const filters = { ...NO_FILTERS, locations: ["ID|DKI Jakarta"] };

    expect(matchesFilters(pricey, filters)).toBe(true);
    expect(matchesFilters(free, filters)).toBe(false);
  });

  it("leaves out a race without a location once a location is selected", () => {
    const unplaced = entry(summary(4, {}, [category(0)]), null);

    expect(matchesFilters(unplaced, { ...NO_FILTERS, locations: ["ID|DKI Jakarta"] })).toBe(false);
    expect(matchesFilters(unplaced, NO_FILTERS)).toBe(true);
  });

  it("treats options in one group as either-or", () => {
    const filters = { ...NO_FILTERS, prices: ["free", "100-up"] as PriceBucketId[] };

    expect(matchesFilters(free, filters)).toBe(true);
    expect(matchesFilters(pricey, filters)).toBe(true);
  });

  it("requires every group to hold", () => {
    expect(matchesFilters(closed, { ...NO_FILTERS, prices: ["free"], openOnly: true })).toBe(false);
  });

  it("judges price and distance on the same distance", () => {
    // A free 5K and a sUSD 60 marathon is not a free marathon.
    const mixed = entry(
      summary(5, {}, [
        category(0, { distanceM: 5_000, priceStroops: 0n }),
        category(1, { distanceM: 42_195, priceStroops: 60n * SUSD }),
      ]),
      metadata(),
    );

    expect(matchesFilters(mixed, { ...NO_FILTERS, prices: ["free"], distances: ["over-21k"] })).toBe(false);
    expect(matchesFilters(mixed, { ...NO_FILTERS, prices: ["50-100"], distances: ["over-21k"] })).toBe(true);
  });

  it("leaves out a race without distances once price or distance is filtered", () => {
    const bare = entry(summary(6), metadata());

    expect(matchesFilters(bare, { ...NO_FILTERS, prices: ["free"] })).toBe(false);
  });
});

describe("activeFilterCount", () => {
  it("counts every selected option and the open-only switch", () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(
      activeFilterCount({ locations: ["ID|Bali"], prices: ["free", "under-25"], distances: ["5k"], openOnly: true }),
    ).toBe(5);
  });
});

describe("locationGroups", () => {
  const yogyaA = entry(summary(1), metadata());
  const yogyaB = entry(summary(2), metadata());
  const jakarta = entry(summary(3), metadata({ location: JAKARTA }));
  const selangor = entry(summary(4), metadata({ location: SELANGOR }));
  const unplaced = entry(summary(5), null);

  it("lists provinces that have races, with how many, most first", () => {
    const [indonesia] = locationGroups([jakarta, yogyaA, yogyaB, unplaced]);

    expect(indonesia).toEqual({
      countryCode: "ID",
      country: "Indonesia",
      options: [
        { key: "ID|DI Yogyakarta", province: "DI Yogyakarta", count: 2 },
        { key: "ID|DKI Jakarta", province: "DKI Jakarta", count: 1 },
      ],
    });
  });

  it("puts the country with the most races first", () => {
    expect(locationGroups([selangor, yogyaA, yogyaB]).map((group) => group.countryCode)).toEqual(["ID", "MY"]);
  });

  it("puts the visitor's own country first", () => {
    expect(locationGroups([selangor, yogyaA, yogyaB], "MY").map((group) => group.countryCode)).toEqual(["MY", "ID"]);
  });

  it("is empty when no race has a location", () => {
    expect(locationGroups([unplaced])).toEqual([]);
  });
});

describe("filterChips", () => {
  const applied = {
    locations: ["ID|DI Yogyakarta"],
    prices: ["free"] as PriceBucketId[],
    distances: ["over-21k"] as DistanceBucketId[],
    openOnly: true,
  };

  it("names every applied filter", () => {
    expect(filterChips(applied).map((chip) => chip.label)).toEqual([
      "DI Yogyakarta",
      "Free",
      "Over 21K",
      "Open for entry only",
    ]);
  });

  it("removes only the filter it belongs to", () => {
    const [location, price, distance, open] = filterChips(applied);

    expect(location?.remove(applied).locations).toEqual([]);
    expect(price?.remove(applied)).toEqual({ ...applied, prices: [] });
    expect(distance?.remove(applied).distances).toEqual([]);
    expect(open?.remove(applied).openOnly).toBe(false);
  });

  it("has no chips when nothing is applied", () => {
    expect(filterChips(NO_FILTERS)).toEqual([]);
  });
});
