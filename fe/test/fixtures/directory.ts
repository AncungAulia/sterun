/**
 * Builders shared by the directory's tests. Not a test file itself: vitest only
 * collects `*.test.ts(x)`.
 */
import type { EventStatus, SterunCategory, SterunEvent } from "@sterunxyz/sdk";

import type { EventSummary } from "@/lib/events";
import type { EventMetadata } from "@/lib/metadata";

/** Stroops in one sUSD. */
export const SUSD = 10_000_000n;

const DAY_S = 86_400n;

/** Unix seconds whole days from the real clock, so "upcoming" holds whenever the suite runs. */
export function daysFromNow(days: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000)) + BigInt(days) * DAY_S;
}

export function summary(
  eventId: number,
  overrides: Partial<SterunEvent> = {},
  categories: SterunCategory[] = [],
): EventSummary {
  return {
    event: {
      eventId,
      organiser: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
      name: `Jakarta Marathon ${eventId}`,
      metadataHash: "a".repeat(64),
      uri: "",
      startsAt: daysFromNow(30),
      status: "Open" as EventStatus,
      ...overrides,
    },
    categories,
  };
}

export function category(categoryId: number, overrides: Partial<SterunCategory> = {}): SterunCategory {
  const quota = overrides.quota ?? 300;
  const enteredCount = overrides.enteredCount ?? 180;
  return {
    eventId: 0,
    categoryId,
    code: "10K",
    distanceM: 10_000,
    quota,
    enteredCount,
    priceStroops: 25n * SUSD,
    slotsLeft: quota - enteredCount,
    ...overrides,
  };
}

export function metadata(overrides: Partial<EventMetadata> = {}): EventMetadata {
  return {
    posterUrl: "https://files.test/poster.jpg",
    location: {
      name: "FT UGM",
      city: "Sleman",
      province: "DI Yogyakarta",
      country: "Indonesia",
      countryCode: "ID",
    },
    ...overrides,
  };
}

export function entry(eventSummary: EventSummary, document: EventMetadata | null = null) {
  return { summary: eventSummary, document };
}
