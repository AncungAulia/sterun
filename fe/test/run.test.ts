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

describe("planRun", () => {
  describe("positive", () => {
    it("names every signature, in the order they have to happen", () => {
      // The order is forced, not chosen: the file is hashed by create_event so
      // it has to be online first, and nothing can be added to an event that
      // does not exist yet.
      const steps = planRun({
        name: "Jakarta Sunrise 10K",
        categories: [category("5K"), category("10K")],
        withDocument: true,
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
      const one = planRun({ name: "A", categories: [category("5K")], withDocument: true });
      const three = planRun({
        name: "A",
        categories: [category("5K"), category("10K"), category("21K")],
        withDocument: true,
      });

      expect(three.length - one.length).toBe(2);
    });
  });

  describe("negative", () => {
    it("drops the publish step when there is no document to publish", () => {
      // Only reachable after publishing has failed and the organiser chose to
      // go on without one. The event still works; its page just has nothing on
      // it, and that cannot be fixed later.
      const steps = planRun({ name: "A", categories: [category("5K")], withDocument: false });

      expect(labels(steps)).toEqual(['Create "A"', "Add the 5K", "Open for entries"]);
    });
  });

  describe("edge", () => {
    it("still describes the event before its name has been typed", () => {
      // The review step is reached with a name, but the plan is derived on
      // every render, so it has to read sensibly halfway through one.
      const steps = planRun({ name: "  ", categories: [], withDocument: true });

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
      const args = { name: "A", categories: [category("5K"), category("10K")], withDocument: true };

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
    withDocument: true,
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
