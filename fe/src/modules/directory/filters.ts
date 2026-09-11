/**
 * The filter drawer's model: the buckets, what each matches, and the chips
 * that show what is applied.
 *
 * Price and distance are judged on the same distance, never on the race as a
 * whole. A race with a free 5K and a sUSD 60 marathon is not "a free marathon",
 * and checking the two filters separately would say it is.
 *
 * Location is not here. The place is chosen in the page header, and a second
 * location control in the drawer could only disagree with it.
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

/** One string for the checkbox and its chip, so the two always read the same. */
export const AVAILABLE_ONLY_LABEL = "Hide full and closed races";

export interface Filters {
  prices: PriceBucketId[];
  distances: DistanceBucketId[];
  /** Only races someone could enter right now: `Open`, with places left. */
  availableOnly: boolean;
}

export const NO_FILTERS: Filters = { prices: [], distances: [], availableOnly: false };

export function activeFilterCount(filters: Filters): number {
  return filters.prices.length + filters.distances.length + (filters.availableOnly ? 1 : 0);
}

/**
 * Open and not sold out. "Open" alone would keep races whose card says "Sold
 * out", which is exactly what someone hiding full races does not want to see.
 * Places are summed the way the card sums them, so the two never disagree, and
 * a race with no distances yet has nothing to enter, so it is hidden too.
 */
function canBeEntered({ summary }: DirectoryEntry): boolean {
  if (summary.event.status !== "Open") return false;
  return summary.categories.reduce((total, category) => total + category.slotsLeft, 0) > 0;
}

/** Options within a group are either-or; groups must all hold. */
export function matchesFilters(entry: DirectoryEntry, filters: Filters): boolean {
  if (filters.availableOnly && !canBeEntered(entry)) return false;

  if (filters.prices.length === 0 && filters.distances.length === 0) return true;

  const prices = PRICE_BUCKETS.filter((bucket) => filters.prices.includes(bucket.id));
  const distances = DISTANCE_BUCKETS.filter((bucket) => filters.distances.includes(bucket.id));
  return entry.summary.categories.some(
    (category) =>
      (prices.length === 0 || prices.some((bucket) => bucket.matches(category.priceStroops))) &&
      (distances.length === 0 || distances.some((bucket) => bucket.matches(category.distanceM))),
  );
}

export interface FilterChip {
  id: string;
  label: string;
  remove: (filters: Filters) => Filters;
}

export function filterChips(filters: Filters): FilterChip[] {
  return [
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
    ...(filters.availableOnly
      ? [
          {
            id: "available-only",
            label: AVAILABLE_ONLY_LABEL,
            remove: (current: Filters) => ({ ...current, availableOnly: false }),
          },
        ]
      : []),
  ];
}
