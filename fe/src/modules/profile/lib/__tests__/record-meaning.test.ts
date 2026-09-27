import { describe, expect, it } from "vitest";

import {
  CHIP_WORD,
  finishSlot,
  formatFinishTime,
  meaningOf,
} from "@/modules/profile/lib/record-meaning";

const base = { finishTimeS: null, claimedAt: null } as const;

describe("seven meanings from four states", () => {
  it("reads the plain ones straight from the state", () => {
    expect(meaningOf({ ...base, state: "Entered" }, "Open")).toEqual({ kind: "entered" });
    expect(meaningOf({ ...base, state: "RacepackClaimed", claimedAt: 1n }, "Closed")).toEqual({ kind: "collected" });
    expect(meaningOf({ state: "Finished", finishTimeS: 6729, claimedAt: 1n }, "Completed")).toEqual({
      kind: "finished",
      timeS: 6729,
    });
  });

  it("tells a finish with no official time from a timed one, and never makes it zero", () => {
    const meaning = meaningOf({ state: "Finished", finishTimeS: null, claimedAt: 1n }, "Completed");
    expect(meaning).toEqual({ kind: "finished-untimed" });
    expect(finishSlot(meaning)).toEqual({ value: "No official time", absent: true });
  });

  it("keeps a real zero as a time, since null and 0 are different answers", () => {
    expect(meaningOf({ state: "Finished", finishTimeS: 0, claimedAt: 1n }, "Completed")).toEqual({
      kind: "finished",
      timeS: 0,
    });
  });

  it("splits a Dnf on whether the race pack was ever collected", () => {
    expect(meaningOf({ state: "Dnf", finishTimeS: null, claimedAt: 1_790_000_000n }, "Completed")).toEqual({
      kind: "dnf",
    });
    expect(meaningOf({ state: "Dnf", finishTimeS: null, claimedAt: null }, "Completed")).toEqual({ kind: "dns" });
  });

  it("reads a cancelled race off the event, because no record is ever marked", () => {
    expect(meaningOf({ ...base, state: "Entered" }, "Cancelled")).toEqual({ kind: "cancelled" });
    expect(meaningOf({ ...base, state: "RacepackClaimed", claimedAt: 1n }, "Cancelled")).toEqual({
      kind: "cancelled",
    });
  });

  it("does not let a cancellation rewrite a result the chain already holds", () => {
    expect(meaningOf({ state: "Finished", finishTimeS: 3000, claimedAt: 1n }, "Cancelled").kind).toBe("finished");
    expect(meaningOf({ state: "Dnf", finishTimeS: null, claimedAt: null }, "Cancelled").kind).toBe("dns");
  });

  it("falls back to the record alone when the event could not be read", () => {
    expect(meaningOf({ ...base, state: "Entered" }, null)).toEqual({ kind: "entered" });
  });

  it("has a word for every meaning", () => {
    expect(CHIP_WORD).toEqual({
      entered: "Entered",
      collected: "Race pack collected",
      finished: "Finished",
      "finished-untimed": "Finished",
      dnf: "Did not finish",
      dns: "Did not start",
      cancelled: "Race cancelled",
    });
  });
});

describe("the finish time slot", () => {
  it("formats over and under an hour", () => {
    expect(formatFinishTime(6729)).toBe("1:52:09");
    expect(formatFinishTime(2883)).toBe("48:03");
    expect(formatFinishTime(3600)).toBe("1:00:00");
    expect(formatFinishTime(59)).toBe("0:59");
  });

  it("says why there is no time, in the time's place", () => {
    expect(finishSlot({ kind: "entered" })).toEqual({ value: "Not yet", absent: true });
    expect(finishSlot({ kind: "collected" })).toEqual({ value: "Not yet", absent: true });
    expect(finishSlot({ kind: "dnf" })).toEqual({ value: "None", absent: true });
    expect(finishSlot({ kind: "dns" })).toEqual({ value: "None", absent: true });
    expect(finishSlot({ kind: "cancelled" })).toEqual({ value: "The race did not take place", absent: true });
  });
});
