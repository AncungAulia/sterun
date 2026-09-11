/**
 * The directory's decisions, as plain functions: which races are featured,
 * which are in the visitor's area, what a search matches, the order, and what a
 * card says.
 *
 * Out of the components so every rule is tested on its own, without a
 * QueryClient or a DOM, and so the page file stays a description of layout.
 */
import type { SterunCategory } from "@sterunxyz/sdk";

import type { Area } from "@/lib/area";
import { sortEvents, type EventSummary } from "@/lib/events";
import type { EventMetadata } from "@/lib/metadata";
import { formatPrice } from "@/utils/format";

/** One race as the directory holds it: the chain's facts and, when proven, its document. */
export interface DirectoryEntry {
  summary: EventSummary;
  /** The verified document. Null when it is missing, unproven, or still loading. */
  document: EventMetadata | null;
}

export type DateOrder = "soonest" | "latest";

/** One large card and two beside it. */
export const FEATURED_LIMIT = 3;

function normalise(text: string | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

function compareBigint(a: bigint, b: bigint): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * The races worth a large poster: open for entry, still ahead, and with a
 * poster to show. Soonest first, because a race next week needs the space more
 * than one next year.
 */
export function pickFeatured(
  entries: readonly DirectoryEntry[],
  nowS: bigint,
  limit = FEATURED_LIMIT,
): DirectoryEntry[] {
  return entries
    .filter(
      ({ summary, document }) =>
        Boolean(document?.posterUrl) &&
        summary.event.status === "Open" &&
        summary.event.startsAt >= nowS,
    )
    .sort(
      (a, b) =>
        compareBigint(a.summary.event.startsAt, b.summary.event.startsAt) ||
        a.summary.event.eventId - b.summary.event.eventId,
    )
    .slice(0, limit);
}

/**
 * Whether a race is in the visitor's chosen area.
 *
 * By province rather than city: Sleman and the city of Yogyakarta are different
 * cities a short ride apart, and somebody who picked one wants the other.
 */
export function inArea(entry: DirectoryEntry, area: Area): boolean {
  const location = entry.document?.location;
  if (!location?.countryCode || !location.province) return false;
  return (
    location.countryCode === area.countryCode &&
    normalise(location.province) === normalise(area.province)
  );
}

/** A case-insensitive match on the race name, venue, city and province. */
export function matchesSearch(entry: DirectoryEntry, query: string): boolean {
  const needle = normalise(query);
  if (!needle) return true;
  const location = entry.document?.location;
  return [entry.summary.event.name, location?.name, location?.city, location?.province].some(
    (field) => normalise(field).includes(needle),
  );
}

/**
 * Races in date order. Upcoming ones always come first, and races already run
 * stay below them most recent first whichever way the upcoming ones go: "latest
 * first" is a question about races you can still enter.
 */
export function sortByDate(
  entries: readonly DirectoryEntry[],
  order: DateOrder,
  nowS: bigint,
): DirectoryEntry[] {
  const bySummary = new Map(entries.map((item) => [item.summary, item]));
  const sorted = sortEvents(
    entries.map((item) => item.summary),
    nowS,
  );
  const ordered =
    order === "latest"
      ? [
          ...sorted.filter((item) => item.event.startsAt >= nowS).reverse(),
          ...sorted.filter((item) => item.event.startsAt < nowS),
        ]
      : sorted;
  return ordered.flatMap((item) => bySummary.get(item) ?? []);
}

/** "500 entries left", "1 entry left" or "Sold out". Only for a race open for entry. */
export function entriesLine(summary: EventSummary): string | null {
  if (summary.event.status !== "Open" || summary.categories.length === 0) return null;
  const left = summary.categories.reduce((total, category) => total + category.slotsLeft, 0);
  if (left === 0) return "Sold out";
  return `${left} ${left === 1 ? "entry" : "entries"} left`;
}

/**
 * What entering costs, read from the cheapest distance: "From sUSD 25", "Free",
 * or "Free to sUSD 40" when some distances are free and some are not. A bare
 * "Free" there would promise a free marathon.
 */
export function priceLine(categories: readonly SterunCategory[]): string | null {
  if (categories.length === 0) return null;
  const prices = categories.map((category) => category.priceStroops);
  const lowest = prices.reduce((min, price) => (price < min ? price : min));
  const highest = prices.reduce((max, price) => (price > max ? price : max));
  if (highest === 0n) return "Free";
  if (lowest === 0n) return `Free to ${formatPrice(highest)}`;
  return `From ${formatPrice(lowest)}`;
}

/** "FT UGM, Sleman", from whichever of the venue and city the document has. */
export function placeLine(document: EventMetadata | null): string | null {
  const name = document?.location?.name?.trim();
  const city = document?.location?.city?.trim();
  if (name && city) return normalise(name).includes(normalise(city)) ? name : `${name}, ${city}`;
  return name || city || null;
}
