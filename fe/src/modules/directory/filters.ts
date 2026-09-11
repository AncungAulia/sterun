/**
 * The filter drawer's model: the buckets, what each matches, the location
 * options, and the chips that show what is applied.
 *
 * Price and distance are judged on the same distance, never on the race as a
 * whole. A race with a free 5K and a sUSD 60 marathon is not "a free marathon",
 * and checking the two filters separately would say it is.
 */
import { STROOPS_PER_UNIT } from "@sterunxyz/sdk";

import type { DirectoryEntry } from "./browse";

export type PriceBucketId = "free" | "under-25" | "25-50" | "50-100" | "100-up";
export type DistanceBucketId = "5k" | "10k" | "21k" | "over-21k";

interface Bucket<Id extends string, Value> {
  id: Id;
  label: string;
  matches: (value: Value) => boolean;
}

const UNIT = STROOPS_PER_UNIT;

/**
 * Lower bound inclusive, upper bound exclusive: a sUSD 50 race is in "sUSD 50
 * to 100". Fixed buckets rather than a slider, because across a few dozen races
 * a slider mostly lands on empty ranges. Testnet prices run from free to sUSD
 * 50; retune these here once mainnet prices are known.
 */
export const PRICE_BUCKETS: readonly Bucket<PriceBucketId, bigint>[] = [
  { id: "free", label: "Free", matches: (price) => price === 0n },
  { id: "under-25", label: "Under sUSD 25", matches: (price) => price > 0n && price < 25n * UNIT },
  { id: "25-50", label: "sUSD 25 to 50", matches: (price) => price >= 25n * UNIT && price < 50n * UNIT },
  { id: "50-100", label: "sUSD 50 to 100", matches: (price) => price >= 50n * UNIT && price < 100n * UNIT },
  { id: "100-up", label: "sUSD 100 and up", matches: (price) => price >= 100n * UNIT },
];

/**
 * A half marathon is 21,097.5 m and gets typed as 21097, 21098 or 21100, so the
 * boundary sits at 21,100 to keep every spelling of it in "11K to 21K".
 */
const HALF_MARATHON_M = 21_100;

export const DISTANCE_BUCKETS: readonly Bucket<DistanceBucketId, number>[] = [
  { id: "5k", label: "5K and under", matches: (metres) => metres <= 5_000 },
  { id: "10k", label: "6K to 10K", matches: (metres) => metres > 5_000 && metres <= 10_000 },
  { id: "21k", label: "11K to 21K", matches: (metres) => metres > 10_000 && metres <= HALF_MARATHON_M },
  { id: "over-21k", label: "Over 21K", matches: (metres) => metres > HALF_MARATHON_M },
];

export interface Filters {
  /** Location keys, `${countryCode}|${province}`. */
  locations: string[];
  prices: PriceBucketId[];
  distances: DistanceBucketId[];
  openOnly: boolean;
}

export const NO_FILTERS: Filters = { locations: [], prices: [], distances: [], openOnly: false };

export function activeFilterCount(filters: Filters): number {
  return (
    filters.locations.length +
    filters.prices.length +
    filters.distances.length +
    (filters.openOnly ? 1 : 0)
  );
}

/** `"ID|DI Yogyakarta"`, or null for a race whose proven document names no province. */
export function locationKey(entry: DirectoryEntry): string | null {
  const location = entry.document?.location;
  const province = location?.province?.trim();
  if (!location?.countryCode || !province) return null;
  return `${location.countryCode}|${province}`;
}

/** Options within a group are either-or; groups must all hold. */
export function matchesFilters(entry: DirectoryEntry, filters: Filters): boolean {
  const { summary } = entry;
  if (filters.openOnly && summary.event.status !== "Open") return false;

  if (filters.locations.length > 0) {
    const key = locationKey(entry);
    if (key === null || !filters.locations.includes(key)) return false;
  }

  if (filters.prices.length === 0 && filters.distances.length === 0) return true;

  const prices = PRICE_BUCKETS.filter((bucket) => filters.prices.includes(bucket.id));
  const distances = DISTANCE_BUCKETS.filter((bucket) => filters.distances.includes(bucket.id));
  return summary.categories.some(
    (category) =>
      (prices.length === 0 || prices.some((bucket) => bucket.matches(category.priceStroops))) &&
      (distances.length === 0 || distances.some((bucket) => bucket.matches(category.distanceM))),
  );
}

export interface LocationOption {
  key: string;
  province: string;
  count: number;
}

export interface LocationGroup {
  countryCode: string;
  country: string;
  options: LocationOption[];
}

function totalOf(group: LocationGroup): number {
  return group.options.reduce((sum, option) => sum + option.count, 0);
}

/**
 * The provinces that have races, with how many, grouped by country.
 *
 * Built from the races themselves, so no option can lead to an empty list. The
 * visitor's own country comes first when they have chosen an area; otherwise
 * the country with the most races does. The country name is the document's
 * own, so the directory never loads the places dataset for it.
 */
export function locationGroups(
  entries: readonly DirectoryEntry[],
  preferredCountry?: string,
): LocationGroup[] {
  const byCountry = new Map<string, { country: string; counts: Map<string, number> }>();

  for (const item of entries) {
    const key = locationKey(item);
    const location = item.document?.location;
    if (key === null || !location?.countryCode) continue;
    const province = key.slice(location.countryCode.length + 1);
    const group = byCountry.get(location.countryCode) ?? {
      country: location.country?.trim() || location.countryCode,
      counts: new Map<string, number>(),
    };
    group.counts.set(province, (group.counts.get(province) ?? 0) + 1);
    byCountry.set(location.countryCode, group);
  }

  const groups: LocationGroup[] = [...byCountry.entries()].map(([countryCode, group]) => ({
    countryCode,
    country: group.country,
    options: [...group.counts.entries()]
      .map(([province, count]) => ({ key: `${countryCode}|${province}`, province, count }))
      .sort((a, b) => b.count - a.count || a.province.localeCompare(b.province)),
  }));

  return groups.sort((a, b) => {
    if (a.countryCode === preferredCountry) return -1;
    if (b.countryCode === preferredCountry) return 1;
    return totalOf(b) - totalOf(a) || a.country.localeCompare(b.country);
  });
}

export interface FilterChip {
  id: string;
  label: string;
  remove: (filters: Filters) => Filters;
}

export function filterChips(filters: Filters): FilterChip[] {
  return [
    ...filters.locations.map((key) => ({
      id: `location:${key}`,
      label: key.slice(key.indexOf("|") + 1),
      remove: (current: Filters) => ({ ...current, locations: current.locations.filter((item) => item !== key) }),
    })),
    ...filters.prices.map((id) => ({
      id: `price:${id}`,
      label: PRICE_BUCKETS.find((bucket) => bucket.id === id)?.label ?? id,
      remove: (current: Filters) => ({ ...current, prices: current.prices.filter((item) => item !== id) }),
    })),
    ...filters.distances.map((id) => ({
      id: `distance:${id}`,
      label: DISTANCE_BUCKETS.find((bucket) => bucket.id === id)?.label ?? id,
      remove: (current: Filters) => ({ ...current, distances: current.distances.filter((item) => item !== id) }),
    })),
    ...(filters.openOnly
      ? [{ id: "open-only", label: "Open for entry only", remove: (current: Filters) => ({ ...current, openOnly: false }) }]
      : []),
  ];
}
