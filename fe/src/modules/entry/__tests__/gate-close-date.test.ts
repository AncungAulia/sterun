import { describe, expect, it } from "vitest";

import { entryGate } from "../lib/gate";
import type { EventSummary } from "@/lib/event/events";
import type { SterunRecord } from "@sterunxyz/sdk";

const NOW = 1_790_000_000n;

const summary = {
  event: { eventId: 3, name: "Merdeka Run 2026", status: "Open", startsAt: NOW + 2_000_000n },
  categories: [{ categoryId: 0, code: "10K", slotsLeft: 12, quota: 100, enteredCount: 88 }],
} as unknown as EventSummary;

const noRecords: SterunRecord[] = [];

describe("entryGate and the registration close date", () => {
  describe("positive", () => {
    it("lets a runner in while the date is still ahead", () => {
      const gate = entryGate(summary, noRecords, 0, { closesAt: NOW + 100n, nowS: NOW });

      expect(gate.kind).toBe("open");
    });

    it("keeps a race with no date behaving exactly as before", () => {
      // Every race published before the contract could hold one.
      expect(entryGate(summary, noRecords, 0, { closesAt: null, nowS: NOW }).kind).toBe("open");
      expect(entryGate(summary, noRecords, 0).kind).toBe("open");
    });
  });

  describe("negative", () => {
    it("tells a date that passed apart from an organiser closing entries", () => {
      const byDate = entryGate(summary, noRecords, 0, { closesAt: NOW - 1n, nowS: NOW });
      expect(byDate).toEqual({ kind: "registration-over", closesAt: NOW - 1n });

      const byHand = entryGate(
        { ...summary, event: { ...summary.event, status: "Closed" } } as EventSummary,
        noRecords,
        0,
        { closesAt: NOW + 100n, nowS: NOW },
      );
      expect(byHand.kind).toBe("closed");
    });

    it("checks the status first, exactly as the contract does", () => {
      // A cancelled race whose date has also passed is cancelled, not late.
      const gate = entryGate(
        { ...summary, event: { ...summary.event, status: "Cancelled" } } as EventSummary,
        noRecords,
        0,
        { closesAt: NOW - 1n, nowS: NOW },
      );

      expect(gate.kind).toBe("closed");
    });

    it("waits for a clock rather than guessing on the first render", () => {
      const gate = entryGate(summary, noRecords, 0, { closesAt: NOW - 1n, nowS: undefined });

      expect(gate.kind).toBe("open");
    });

    it("closes at the moment itself, not a second later", () => {
      expect(entryGate(summary, noRecords, 0, { closesAt: NOW, nowS: NOW }).kind).toBe(
        "registration-over",
      );
    });
  });
});
