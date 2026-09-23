/**
 * The directory's decisions, as plain functions: which races are featured,
 * which are in the visitor's area, what a search matches, the order, and what a
 * card says.
 *
 * Out of the components so every rule is tested on its own, without a
 * QueryClient or a DOM, and so the page file stays a description of layout.
 */
import type { SterunCategory } from "@sterunxyz/sdk";

import type { Area, Place } from "@/lib/place/area";
import { entryRank, sortEvents, type EventSummary } from "@/lib/event/events";
import type { EventMetadata } from "@/lib/event/metadata";
import { formatPrice } from "@/utils/format";
import { haversineKm, type Coordinates } from "@/utils/geo";

/** One race as the directory holds it: the chain's facts and, when proven, its document. */
export interface DirectoryEntry {
  summary: EventSummary;
  /** The verified document. Null when it is missing, unproven, or still loading. */
  document: EventMetadata | null;
}

export type DateOrder = "soonest" | "latest";

/** One large card and two beside it. */
const FEATURED_LIMIT = 3;

function normalise(text: string | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

function compareBigint(a: bigint, b: bigint): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * The races in the chosen place, then the rest, each group keeping the order it
 * arrived in. With no place the list is returned untouched.
 *
 * A preference, never a filter: the place a visitor picked says what they want
 * to see first, not what they are allowed to see. It is applied after the
 * ordering rather than inside it, so a group's own order is whatever the caller
 * had already decided.
 */
function areaFirst(entries: readonly DirectoryEntry[], area: Area): DirectoryEntry[] {
  const here: DirectoryEntry[] = [];
  const elsewhere: DirectoryEntry[] = [];
  for (const item of entries) (inArea(item, area) ? here : elsewhere).push(item);
  return [...here, ...elsewhere];
}

/** The venue pin from a proven document, when it has one that is a real point. */
function coordinatesOf(entry: DirectoryEntry): Coordinates | null {
  const { lat, lng } = entry.document?.location ?? {};
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Nearest first, then every race whose document gives no pin.
 *
 * A race we cannot measure goes after the ones we can, keeping the order it
 * arrived in, which is the date order the caller had already settled. The
 * alternative, guessing a distance for it, would rank a race by a number nobody
 * put in the document. `sort` is stable, so two races the same distance away
 * keep their date order too.
 */
function nearestFirst(entries: readonly DirectoryEntry[], at: Coordinates): DirectoryEntry[] {
  const measured: { item: DirectoryEntry; km: number }[] = [];
  const unmeasured: DirectoryEntry[] = [];
  for (const item of entries) {
    const pin = coordinatesOf(item);
    if (pin) measured.push({ item, km: haversineKm(at, pin) });
    else unmeasured.push(item);
  }
  measured.sort((a, b) => a.km - b.km);
  return [...measured.map(({ item }) => item), ...unmeasured];
}

/**
 * The races the visitor is closest to, then the rest, each group keeping the
 * order it arrived in. With no place the list is returned untouched.
 *
 * "Closest" is whichever of the two answers there is: a province they named, or
 * the coordinates the browser gave. Both are the same kind of preference, never
 * a filter: the place a visitor has says what they want to see first, not what
 * they are allowed to see. It is applied after the ordering rather than inside
 * it, so a group's own order is whatever the caller had already decided.
 */
function leadWithPlace(entries: readonly DirectoryEntry[], place: Place | null): DirectoryEntry[] {
  if (!place) return [...entries];
  return place.mode === "nearby" ? nearestFirst(entries, place) : areaFirst(entries, place);
}

/**
 * Why a race is in the featured row, in the words the card prints (Ancung,
 * 2026-09-23).
 *
 * The row used to be three races chosen by one rule and labelled with nothing,
 * so a visitor could not tell why those three. Eventbrite says "Going fast" and
 * "Just added" for the same reason. Every rule here is read from the chain, so
 * no reason needs the index to be up, and none of them is a guess: a race is
 * either nearly full or it is not.
 *
 * Deliberately NOT here: anything about how fast entries are arriving. The
 * chain holds a total, not a history, so "trending" would need the index to
 * answer for every race on the page, which is a backend ticket rather than a
 * label.
 */
export type FeatureReason = "almost-full" | "closing-soon" | "just-added";

export const FEATURE_LABEL: Record<FeatureReason, string> = {
  "almost-full": "Almost full",
  "closing-soon": "Closing soon",
  "just-added": "Just added",
};

/** A tenth of the places left, at most. */
const ALMOST_FULL_SHARE = 0.1;
/** Race day inside a fortnight. Past that, "soon" is not what a runner reads it as. */
const CLOSING_SOON_S = 14n * 24n * 60n * 60n;

/**
 * At most one reason per card, strongest first: running out of places beats a
 * near date, and both beat being new, because the first two cost a runner
 * something if they wait and the third does not.
 *
 * `newestId` is the largest event id on the page. Ids are handed out in order
 * by the registry, so the largest is the most recently published race; there is
 * no created-at on chain to read instead.
 */
export function featureReason(
  entry: DirectoryEntry,
  nowS: bigint,
  newestId: number,
): FeatureReason | null {
  const { event, categories } = entry.summary;
  const quota = categories.reduce((total, category) => total + category.quota, 0);
  const left = categories.reduce((total, category) => total + category.slotsLeft, 0);
  if (quota > 0 && left > 0 && left <= quota * ALMOST_FULL_SHARE) return "almost-full";
  if (event.startsAt - nowS <= CLOSING_SOON_S) return "closing-soon";
  if (event.eventId === newestId) return "just-added";
  return null;
}

export interface FeaturedOptions {
  /** The chosen place. Races in it, or nearest to it, fill the row first. */
  place?: Place | null;
}

/**
 * The races worth a large poster: open for entry, still ahead, and with a
 * poster to show. Soonest first, because a race next week needs the space more
 * than one next year.
 *
 * A chosen place moves its own races to the front of that queue, so the row
 * leads with something the visitor can get to. It never empties the row: a
 * place with no races of its own still gets the soonest races anywhere, because
 * an empty row teaches nothing and a poster is the best thing on the page.
 */
export function pickFeatured(
  entries: readonly DirectoryEntry[],
  nowS: bigint,
  { place = null }: FeaturedOptions = {},
): DirectoryEntry[] {
  const candidates = entries
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
    );
  const queue = leadWithPlace(candidates, place);
  if (queue.length <= FEATURED_LIMIT) return queue;

  /*
    Three races that differ, rather than the three soonest, which on a busy
    month are three of the same thing. The lead is still whatever the ordering
    put first, since that is the race the visitor is most likely to want; the
    other two are taken to cover reasons the row does not have yet, and any
    slot left over falls back to the order it already had.
  */
  const newestId = queue.reduce((max, item) => Math.max(max, item.summary.event.eventId), -1);
  const picked = [queue[0] as DirectoryEntry];
  const taken = new Set([picked[0]?.summary.event.eventId]);
  const covered = new Set([featureReason(picked[0] as DirectoryEntry, nowS, newestId)]);

  for (const item of queue) {
    if (picked.length === FEATURED_LIMIT) break;
    if (taken.has(item.summary.event.eventId)) continue;
    const reason = featureReason(item, nowS, newestId);
    if (reason === null || covered.has(reason)) continue;
    picked.push(item);
    taken.add(item.summary.event.eventId);
    covered.add(reason);
  }

  for (const item of queue) {
    if (picked.length === FEATURED_LIMIT) break;
    if (taken.has(item.summary.event.eventId)) continue;
    picked.push(item);
    taken.add(item.summary.event.eventId);
  }

  return picked;
}

/**
 * Whether a race is in the place the visitor chose: a whole country, or one
 * province of it. A race whose document does not prove a country is in no place.
 *
 * By province rather than city: Sleman and the city of Yogyakarta are different
 * cities a short ride apart, and somebody who picked one wants the other.
 * Country codes ignore case because organisers type them into their documents,
 * and "id" is still Indonesia.
 */
export function inArea(entry: DirectoryEntry, area: Area): boolean {
  const location = entry.document?.location;
  const countryCode = normalise(location?.countryCode);
  if (!countryCode || countryCode !== normalise(area.countryCode)) return false;
  const province = normalise(area.province);
  return !province || normalise(location?.province) === province;
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

/** The three groups `entryRank` sorts into, in the order they are shown. */
const RANKS = [0, 1, 2] as const;

/**
 * Races in date order, inside the groups `entryRank` puts them in: enterable
 * first, then still to come, then what is over.
 *
 * The groups are never mixed, whichever date order the drawer asked for.
 * "Furthest date first" is a question about races you can still enter, so it
 * reverses each group from the inside and races already run stay most recent
 * first.
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
      ? RANKS.flatMap((rank) => {
          const group = sorted.filter((item) => entryRank(item, nowS) === rank);
          // Only what is still ahead reverses: "latest" on races that have
          // already run would bury the most recent one at the bottom.
          return rank === 2 ? group : group.reverse();
        })
      : sorted;
  return ordered.flatMap((item) => bySummary.get(item) ?? []);
}

/**
 * The whole list: enterable races first, then the rest still to come, then what
 * is over, and inside each group the races in the chosen place, or nearest to
 * the visitor, leading.
 *
 * The place sorts rather than filters (Revision 3 of the directory spec): a
 * visitor who picked Yogyakarta wants those races first, but hiding the rest
 * makes the page lie about how many races exist, and there are not yet enough
 * of them for any place to fill a screen on its own.
 *
 * The place is the *inner* key, never the outer one. Applied to the whole list
 * it would promote last year's Yogyakarta race above next week's Jakarta one,
 * which puts a race nobody can enter at the top of the page. "Can I still enter
 * this?" outranks "is it near me?", so the groups decide the order and the place
 * only decides it within them. Within each group the date order the drawer asked
 * for still applies. No place chosen means that order alone.
 *
 * Coordinates take the same shape, one level down: inside each group the races
 * are nearest first, and the ones whose document carries no pin follow in the
 * date order they already had. A real distance is a finer key than "in this
 * province or not", but it is not a stronger claim than "can I still enter
 * this?", so it does not get to reorder the groups either.
 */
export function sortByPlace(
  entries: readonly DirectoryEntry[],
  place: Place | null,
  order: DateOrder,
  nowS: bigint,
): DirectoryEntry[] {
  const sorted = sortByDate(entries, order, nowS);
  if (!place) return sorted;
  return RANKS.flatMap((rank) =>
    leadWithPlace(
      sorted.filter((item) => entryRank(item.summary, nowS) === rank),
      place,
    ),
  );
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

/**
 * Everything the public directory is allowed to list.
 *
 * A race reaches the chain one transaction before its distances do, and its
 * entries are opened by a later one still. In between it is a real event with a
 * real id and nothing anybody can do with it, and until now the grid listed it:
 * only `pickFeatured` and the "hide full races" filter ever looked at status.
 *
 * Applied where the summaries enter the page rather than inside the filters, so
 * that search, ordering and the featured row all see the same list. A filter
 * can be switched off; this cannot.
 *
 * Closed, Completed and Cancelled all stay. Somebody who paid has a reason to
 * find the page again, and a cancelled race is exactly the one a runner most
 * needs to be able to reach.
 */
export function publicEvents(summaries: readonly EventSummary[]): EventSummary[] {
  return summaries.filter(({ event }) => event.status !== "Draft");
}
