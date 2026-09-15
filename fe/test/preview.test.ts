import { describe, expect, it } from "vitest";

import { EMPTY_ADD_ON, type PlannedAddOn } from "@/modules/organiser/addons";
import { EMPTY_CATEGORY, type PlannedCategory } from "@/modules/organiser/component/StepCategoryPlan";
import { previewEvent, type EventPreviewInput } from "@/modules/organiser/preview";

const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";

const TEN_K: PlannedCategory = {
  ...EMPTY_CATEGORY,
  code: " 10K ",
  km: "10",
  quota: "300",
  price: "25.5",
  startTime: "06:00",
};

const JERSEY: PlannedAddOn = {
  ...EMPTY_ADD_ON,
  name: "Event jersey",
  sized: true,
  sizes: [
    { label: "M", chest: "52", length: "70", stock: "20" },
    { label: "L", chest: "", length: "", stock: "10" },
  ],
  includedIn: ["10K"],
  kind: "extra",
  price: "50",
};

function input(overrides: Partial<EventPreviewInput> = {}): EventPreviewInput {
  return {
    name: "  Park Run  ",
    organiser: ORGANISER,
    startsAt: 1_790_000_000n,
    hash: "ab".repeat(32),
    plan: [TEN_K],
    addOns: [JERSEY],
    documentText: JSON.stringify({ description: "Two laps.\n\nBring water." }),
    ...overrides,
  };
}

describe("previewEvent", () => {
  describe("positive", () => {
    it("draws the event the run will create, already open", () => {
      // Open because opening entries is the run's last signature, and the page
      // runners meet is the one after it.
      const { event } = previewEvent(input())!;

      expect(event).toMatchObject({
        name: "Park Run",
        organiser: ORGANISER,
        startsAt: 1_790_000_000n,
        metadataHash: "ab".repeat(32),
        status: "Open",
      });
    });

    it("converts each distance the way the run writes it", () => {
      const { categories } = previewEvent(input())!;

      expect(categories).toEqual([
        {
          eventId: 0,
          categoryId: 0,
          code: "10K",
          distanceM: 10_000,
          quota: 300,
          enteredCount: 0,
          priceStroops: 255_000_000n,
          slotsLeft: 300,
        },
      ]);
    });

    it("makes one add-on row per size, each with its own stock and nothing sold", () => {
      const { addOns } = previewEvent(input())!;

      expect(addOns.map((row) => [row.code, row.priceStroops, row.unitsLeft])).toEqual([
        ["EVENT_JERSEY_M", 500_000_000n, 20],
        ["EVENT_JERSEY_L", 500_000_000n, 10],
      ]);
    });

    it("reads the document through the page's own parser, line breaks and all", () => {
      const { document } = previewEvent(input())!;

      expect(document.description).toBe("Two laps.\n\nBring water.");
    });
  });

  describe("edge", () => {
    it("charges nothing for an item that comes with the ticket, even if a price was typed", () => {
      const { addOns } = previewEvent(
        input({ addOns: [{ ...JERSEY, kind: "included", price: "50" }] }),
      )!;

      expect(addOns.every((row) => row.priceStroops === 0n)).toBe(true);
    });

    it("shows a free distance as free rather than failing on an empty fee", () => {
      const { categories } = previewEvent(input({ plan: [{ ...TEN_K, price: "" }] }))!;

      expect(categories[0]!.priceStroops).toBe(0n);
    });

    it("leaves out what the page would leave out", () => {
      // A key the page does not read must not appear in the preview either,
      // or the organiser approves something runners never see.
      const { document } = previewEvent(
        input({ documentText: JSON.stringify({ description: "Hi", surprise: "never shown" }) }),
      )!;

      expect(document).toEqual({ description: "Hi" });
    });
  });

  describe("negative", () => {
    it("has nothing to draw before the race has a start", () => {
      expect(previewEvent(input({ startsAt: null }))).toBeNull();
    });

    it("has nothing to draw before there is a document", () => {
      expect(previewEvent(input({ documentText: "" }))).toBeNull();
    });

    it("refuses a document the page could not read either", () => {
      expect(previewEvent(input({ documentText: "{not json" }))).toBeNull();
      expect(previewEvent(input({ documentText: "[1, 2]" }))).toBeNull();
    });
  });
});
