import { describe, expect, it } from "vitest";

import {
  DISTANCE_BUCKETS,
  NO_FILTERS,
  PRICE_BUCKETS,
  activeFilterCount,
  filterChips,
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
  const pricey = entry(summary(2, {}, [category(0, { priceStroops: 120n * SUSD })]), metadata());
  const closed = entry(summary(3, { status: "Closed" }, [category(0, { priceStroops: 0n })]), metadata());
  const available = { ...NO_FILTERS, availableOnly: true };

  it("lets everything through with no filters", () => {
    expect([free, pricey, closed].every((race) => matchesFilters(race, NO_FILTERS))).toBe(true);
  });

  it("keeps an open race that still has places when full and closed races are hidden", () => {
    expect(matchesFilters(free, available)).toBe(true);
  });

  it("keeps an open race whose other distances are full, as long as one has places", () => {
    const lastPlaces = entry(
      summary(4, {}, [category(0, { quota: 100, enteredCount: 100 }), category(1, { quota: 50, enteredCount: 49 })]),
      metadata(),
    );

    expect(matchesFilters(lastPlaces, available)).toBe(true);
  });

  it("hides a race that is not open for entry", () => {
    expect(matchesFilters(closed, available)).toBe(false);
    expect(matchesFilters(entry(summary(7, { status: "Draft" }, [category(0)])), available)).toBe(false);
  });

  it("hides an open race whose every distance is full", () => {
    const soldOut = entry(
      summary(4, {}, [category(0, { quota: 100, enteredCount: 100 }), category(1, { quota: 50, enteredCount: 50 })]),
      metadata(),
    );

    expect(matchesFilters(soldOut, available)).toBe(false);
    expect(matchesFilters(soldOut, NO_FILTERS)).toBe(true);
  });

  it("hides an open race with no distances, since there is nothing to enter", () => {
    const bare = entry(summary(8), metadata());

    expect(matchesFilters(bare, available)).toBe(false);
    expect(matchesFilters(bare, NO_FILTERS)).toBe(true);
  });

  it("treats options in one group as either-or", () => {
    const filters = { ...NO_FILTERS, prices: ["free", "100-up"] as PriceBucketId[] };

    expect(matchesFilters(free, filters)).toBe(true);
    expect(matchesFilters(pricey, filters)).toBe(true);
  });

  it("requires every group to hold", () => {
    expect(matchesFilters(closed, { ...NO_FILTERS, prices: ["free"] })).toBe(true);
    expect(matchesFilters(closed, { ...NO_FILTERS, prices: ["free"], availableOnly: true })).toBe(false);
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

describe("NO_FILTERS", () => {
  it("holds price, distance and availability, and nothing about location", () => {
    // The place is chosen in the header now, so a second location control
    // in the drawer could only disagree with it.
    expect(NO_FILTERS).toEqual({ prices: [], distances: [], availableOnly: false });
  });
});

describe("activeFilterCount", () => {
  it("counts every selected option and the availability switch", () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ prices: ["free", "under-25"], distances: ["5k"], availableOnly: true })).toBe(4);
    expect(activeFilterCount({ ...NO_FILTERS, availableOnly: true })).toBe(1);
  });
});

describe("filterChips", () => {
  const applied = {
    prices: ["free"] as PriceBucketId[],
    distances: ["over-21k"] as DistanceBucketId[],
    availableOnly: true,
  };

  it("names every applied filter", () => {
    expect(filterChips(applied).map((chip) => chip.label)).toEqual([
      "Free",
      "Over 21K",
      "Hide full and closed races",
    ]);
  });

  it("removes only the filter it belongs to", () => {
    const [price, distance, available] = filterChips(applied);

    expect(price?.remove(applied)).toEqual({ ...applied, prices: [] });
    expect(distance?.remove(applied)).toEqual({ ...applied, distances: [] });
    expect(available?.remove(applied)).toEqual({ ...applied, availableOnly: false });
  });

  it("has no chips when nothing is applied", () => {
    expect(filterChips(NO_FILTERS)).toEqual([]);
  });
});
