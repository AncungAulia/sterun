import { describe, expect, it } from "vitest";

import { EMPTY_CATEGORY, type PlannedCategory } from "@/modules/organiser/component/StepCategoryPlan";
import { nextStep, planRun } from "@/modules/organiser/run";

const category = (code: string): PlannedCategory => ({
  ...EMPTY_CATEGORY,
  code,
  km: "10",
  quota: "200",
  startTime: "06:00",
});

const labels = (steps: { label: string }[]) => steps.map((step) => step.label);

const addOn = (name: string, sizes: string[] = []) => ({
  name,
  photoUrl: "",
  sized: sizes.length > 0,
  sizes: sizes.map((label) => ({ label, chest: "", length: "", stock: "10" })),
  includedIn: ["10K"],
  kind: "included" as const,
  price: "",
  stock: "100",
});

describe("planRun", () => {
  describe("positive", () => {
    it("names every signature, in the order they have to happen", () => {
      // The order is forced, not chosen: the file is hashed by create_event so
      // it has to be online first, and nothing can be added to an event that
      // does not exist yet.
      const steps = planRun({
        name: "Jakarta Sunrise 10K",
        categories: [category("5K"), category("10K")],
        addOns: [],
      });

      expect(labels(steps)).toEqual([
        "Publish the event details",
        'Create "Jakarta Sunrise 10K"',
        "Add the 5K",
        "Add the 10K",
        "Open for entries",
      ]);
    });

    it("grows by exactly one signature per distance", () => {
      const one = planRun({ name: "A", categories: [category("5K")] , addOns: []});
      const three = planRun({
        name: "A",
        categories: [category("5K"), category("10K"), category("21K")],
        addOns: [],
      });

      expect(three.length - one.length).toBe(2);
    });
  });

  describe("negative", () => {
    it("always publishes the details, with no way to opt out", () => {
      // An event created without a document has a page with no poster, no
      // location and no schedule, permanently: the hash is committed by
      // create_event and there is no update_event. When publishing fails the
      // answer is to host the file elsewhere, not to go on without one.
      const steps = planRun({ name: "A", categories: [category("5K")] , addOns: []});

      expect(labels(steps)[0]).toBe("Publish the event details");
    });
  });

  describe("edge", () => {
    it("still describes the event before its name has been typed", () => {
      // The review step is reached with a name, but the plan is derived on
      // every render, so it has to read sensibly halfway through one.
      const steps = planRun({ name: "  ", categories: [] , addOns: []});

      expect(labels(steps)).toEqual([
        "Publish the event details",
        "Create the event",
        "Open for entries",
      ]);
    });

    it("keeps step ids stable when the plan is rebuilt", () => {
      // What is already signed is tracked by id. If ids moved when the list was
      // recomputed, a resumed run would repeat a transaction that has landed
      // and cannot be undone.
      const args = { name: "A", categories: [category("5K"), category("10K")], addOns: [] };

      expect(planRun(args).map((step) => step.id)).toEqual(
        planRun(args).map((step) => step.id),
      );
      expect(planRun(args).map((step) => step.id)).toEqual([
        "document",
        "event",
        "category:5K",
        "category:10K",
        "open",
      ]);
    });
  });
});

describe("nextStep", () => {
  const steps = planRun({
    name: "A",
    categories: [category("5K"), category("10K")],
        addOns: [],
  });

  it("resumes at the first thing that has not landed", () => {
    expect(nextStep(steps, ["document", "event"])?.id).toBe("category:5K");
  });

  it("skips nothing when a later step somehow landed first", () => {
    // Defensive: the loop walks in order, but a resumed run must never step
    // over something unsigned just because the id after it is ticked.
    expect(nextStep(steps, ["open"])?.id).toBe("document");
  });

  it("is undefined once the whole run is done", () => {
    expect(nextStep(steps, steps.map((step) => step.id))).toBeUndefined();
  });
});

describe("planRun with add-ons", () => {
  describe("positive", () => {
    it("signs one add-on per size, not one per item", () => {
      // The contract keeps a quota per add-on, so a size has to be its own row
      // or "M is sold out" cannot be true.
      const steps = planRun({
        name: "A",
        categories: [category("10K")],
        addOns: [addOn("Event jersey", ["S", "M"])],
      });

      expect(steps.map((step) => step.id)).toEqual([
        "document",
        "event",
        "category:10K",
        "addon:EVENT_JERSEY_S",
        "addon:EVENT_JERSEY_M",
        "open",
      ]);
    });

    it("puts them after the distances and before opening", () => {
      // Before opening because `reserve_addon` requires Open: anything added
      // afterwards was never offered to the earliest entrants, and entries are
      // the one part of this that cannot be replayed.
      const steps = planRun({
        name: "A",
        categories: [category("10K")],
        addOns: [addOn("Tumbler")],
      });
      const ids = steps.map((step) => step.id);

      expect(ids.indexOf("addon:TUMBLER")).toBeGreaterThan(ids.indexOf("category:10K"));
      expect(ids.indexOf("addon:TUMBLER")).toBeLessThan(ids.indexOf("open"));
    });

    it("names the size in the label, because that is what gets signed", () => {
      const steps = planRun({
        name: "A",
        categories: [category("10K")],
        addOns: [addOn("Event jersey", ["M"])],
      });

      expect(steps.find((step) => step.id === "addon:EVENT_JERSEY_M")?.label).toBe(
        "Add the Event jersey M",
      );
    });
  });

  describe("edge", () => {
    it("adds no step at all when there is nothing in the race pack", () => {
      const steps = planRun({ name: "A", categories: [category("10K")], addOns: [] });

      expect(steps.some((step) => step.kind === "addon")).toBe(false);
    });

    it("skips a size nobody labelled, so no signature is spent on it", () => {
      const steps = planRun({
        name: "A",
        categories: [category("10K")],
        addOns: [addOn("Event jersey", ["M", ""])],
      });

      expect(steps.filter((step) => step.kind === "addon")).toHaveLength(1);
    });
  });
});
