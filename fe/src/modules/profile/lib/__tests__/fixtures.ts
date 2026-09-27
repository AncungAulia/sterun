/**
 * Records and races for the profile tests, one per meaning the page draws.
 * Shaped exactly like what `@sterunxyz/sdk` returns, so the document test and
 * the page tests share one set of facts.
 */
import type { SterunCategory, SterunEvent, SterunRecord } from "@sterunxyz/sdk";

import type { EventSummary } from "@/lib/event/events";

export const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const ORGANISER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

export function event(eventId: number, name: string, status: SterunEvent["status"], startsAt: bigint): SterunEvent {
  return {
    eventId,
    organiser: ORGANISER,
    name,
    metadataHash: "a".repeat(64),
    uri: `https://files.sterun.xyz/events/${eventId}.json`,
    startsAt,
    status,
  };
}

export function category(eventId: number, categoryId: number, code: string, distanceM: number): SterunCategory {
  return {
    eventId,
    categoryId,
    code,
    distanceM,
    quota: 500,
    enteredCount: 100,
    priceStroops: 250_000_000n,
    slotsLeft: 400,
  };
}

export function summary(ev: SterunEvent, categories: SterunCategory[]): EventSummary {
  return { event: ev, categories };
}

export function record(overrides: Partial<SterunRecord> & Pick<SterunRecord, "tokenId" | "eventId">): SterunRecord {
  return {
    categoryId: 0,
    bibNo: 128,
    participantHash: "b".repeat(64),
    state: "Entered",
    enteredAt: 1_788_000_000n,
    claimedAt: null,
    finishTimeS: null,
    resultAt: null,
    addonIds: [],
    ...overrides,
  };
}
