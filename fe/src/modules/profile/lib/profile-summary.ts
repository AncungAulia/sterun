/**
 * The page's arithmetic, kept out of React so it can be tested on its own.
 *
 * Everything is derived from records already read. No number here comes from
 * our database: it is the count of things anyone can read off the chain.
 */
import type { SterunRecord } from "@sterunxyz/sdk";

export const PAGE_SIZE = 20;

/**
 * Newest entry first. Never by bib: a bib changed meaning at STE-54, and one
 * race's number compared with another's says nothing. Token id breaks a tie so
 * two entries in the same second keep one order between renders.
 */
export function newestFirst(records: readonly SterunRecord[]): SterunRecord[] {
  return [...records].sort((a, b) => {
    if (a.enteredAt !== b.enteredAt) return a.enteredAt > b.enteredAt ? -1 : 1;
    return b.tokenId - a.tokenId;
  });
}

export interface ProfileNumbers {
  races: number;
  /** Finished, with a time or without. A finish with no official time is still a finish. */
  finished: number;
  /** Unix seconds of the earliest entry, or null with no records. */
  firstEnteredAt: bigint | null;
}

export function profileNumbers(records: readonly SterunRecord[]): ProfileNumbers {
  let firstEnteredAt: bigint | null = null;
  for (const record of records) {
    if (firstEnteredAt === null || record.enteredAt < firstEnteredAt) firstEnteredAt = record.enteredAt;
  }
  return {
    races: records.length,
    finished: records.filter((record) => record.state === "Finished").length,
    firstEnteredAt,
  };
}

/** "Jul 2026", the month of the first race, in the reader's own timezone. */
export function formatFirstRace(seconds: bigint, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(Number(seconds) * 1000));
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** One page of records, 1-based, clamped so a stale page number never shows an empty list. */
export function pageOf<T>(items: readonly T[], page: number): { items: T[]; page: number } {
  const last = pageCount(items.length);
  const current = Math.min(Math.max(1, Math.floor(page) || 1), last);
  const start = (current - 1) * PAGE_SIZE;
  return { items: items.slice(start, start + PAGE_SIZE), page: current };
}

function dayParts(seconds: bigint, month: "short" | "long", timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month,
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(new Date(Number(seconds) * 1000));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  // Day first, the order the design writes dates in. en-US would put the month
  // first and en-GB spells September "Sept", so the parts are placed by hand.
  return `${part("day")} ${part("month")} ${part("year")}`;
}

/** "27 September 2026", for the line under a race's name. */
export function formatRaceDay(seconds: bigint, timeZone?: string): string {
  return dayParts(seconds, "long", timeZone);
}

/** "14 Aug 2026", for a date in a card's facts row. */
export function formatFactDay(seconds: bigint, timeZone?: string): string {
  return dayParts(seconds, "short", timeZone);
}
