/**
 * What the enter page shows before any form. The wallet gate is not here:
 * `EntryFlow` renders `WalletGate` around the whole page.
 */
import { describe, expect, it } from "vitest";

import type { EventSummary } from "@/lib/events";
import { entryGate } from "@/modules/entry/gate";
import type { EventStatus, SterunCategory, SterunRecord } from "@sterunxyz/sdk";

const EVENT_ID = 5;

function category(categoryId: number, slotsLeft: number, code = `C${categoryId}`): SterunCategory {
  return {
    eventId: EVENT_ID,
    categoryId,
    code,
    distanceM: 5000,
    quota: 10,
    enteredCount: 10 - slotsLeft,
    priceStroops: 0n,
    slotsLeft,
  };
}

function summary(status: EventStatus, categories: SterunCategory[]): EventSummary {
  return {
    event: {
      eventId: EVENT_ID,
      organiser: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
      name: "Jogja 10K",
      metadataHash: "a".repeat(64),
      uri: "",
      startsAt: 1_790_548_200n,
      status,
    },
    categories,
  };
}

function record(eventId: number, categoryId: number, bibNo = 0): SterunRecord {
  return {
    tokenId: 9,
    eventId,
    categoryId,
    bibNo,
    participantHash: "a".repeat(64),
    state: "Entered",
    enteredAt: 0n,
    claimedAt: null,
    finishTimeS: null,
    resultAt: null,
    addonIds: [],
  } as SterunRecord;
}

describe("entryGate", () => {
  it.each<EventStatus>(["Draft", "Closed", "Completed", "Cancelled"])(
    "is closed for a race that is %s",
    (status) => {
      expect(entryGate(summary(status, [category(0, 3)]), [], 0)).toEqual({ kind: "closed" });
    },
  );

  it("stops a wallet that already entered this race, on any distance", () => {
    const gate = entryGate(
      summary("Open", [category(0, 3, "5K"), category(1, 3, "10K")]),
      [record(EVENT_ID, 1, 4)],
      0,
    );
    expect(gate).toEqual({
      kind: "already-entered",
      record: record(EVENT_ID, 1, 4),
      distanceCode: "10K",
    });
  });

  it("shows an existing entry even after entries close, rather than 'closed'", () => {
    expect(entryGate(summary("Closed", [category(0, 3)]), [record(EVENT_ID, 0)], 0).kind).toBe(
      "already-entered",
    );
  });

  it("ignores records from other races", () => {
    expect(entryGate(summary("Open", [category(0, 3)]), [record(4, 0)], 0)).toEqual({
      kind: "open",
      categoryId: 0,
    });
  });

  it("opens on the requested distance", () => {
    expect(entryGate(summary("Open", [category(0, 3), category(1, 3)]), [], 1)).toEqual({
      kind: "open",
      categoryId: 1,
    });
  });

  it("says a requested full distance is sold out", () => {
    expect(entryGate(summary("Open", [category(0, 0), category(1, 2)]), [], 0)).toEqual({
      kind: "sold-out",
      categoryId: 0,
    });
  });

  it("picks the first distance with places when none is requested", () => {
    expect(entryGate(summary("Open", [category(0, 0), category(1, 2)]), [], null)).toEqual({
      kind: "open",
      categoryId: 1,
    });
  });

  it("treats an unknown distance id as not requested", () => {
    expect(entryGate(summary("Open", [category(0, 2)]), [], 7)).toEqual({
      kind: "open",
      categoryId: 0,
    });
  });

  it("has nowhere to go when every distance is full", () => {
    expect(entryGate(summary("Open", [category(0, 0)]), [], null)).toEqual({ kind: "no-distance" });
  });

  it("has nowhere to go when the race has no distances at all", () => {
    expect(entryGate(summary("Open", []), [], null)).toEqual({ kind: "no-distance" });
  });
});
