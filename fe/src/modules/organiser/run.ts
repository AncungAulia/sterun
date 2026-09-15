/**
 * Every signature creating an event will ask for, worked out before the first
 * one is asked for.
 *
 * ## Why this list is shown up front
 *
 * Creating an event is not one save. The details file is uploaded under a
 * signature, `create_event` is another, each distance is an `add_category` of
 * its own, and opening entries is a fourth kind. A three distance race is six
 * wallet prompts.
 *
 * That number cannot be reduced. One transaction carries one contract call, the
 * contract has no batch entry point, and `add_category` needs the event id that
 * only exists once `create_event` has landed. Wallets have no "approve six"
 * either.
 *
 * What can be fixed is the surprise. Six prompts nobody mentioned feels like
 * something has gone wrong and is being retried; six prompts you were shown as
 * a numbered list, ticking off as they land, is a task with a visible end. So
 * the run is planned here, rendered before anything is signed, and then walked.
 *
 * Kept apart from the component because the order is the part that must not
 * drift: the document is hashed by `create_event`, so it has to be online
 * first, and nothing can be added to an event that does not exist yet.
 */
import { addOnUnits, type PlannedAddOn } from "./addons";
import type { PlannedCategory } from "./component/StepCategoryPlan";

export type RunStepKind = "document" | "event" | "category" | "addon" | "open";

export interface RunStep {
  /** Stable across a re-plan, so what is already done stays done. */
  id: string;
  kind: RunStepKind;
  /** Shown in the list, in the organiser's words rather than the contract's. */
  label: string;
  /** On `category` and `addon` steps: the code this one writes. */
  code?: string;
}

export interface RunPlan {
  name: string;
  categories: PlannedCategory[];
  addOns: PlannedAddOn[];
}

export function planRun({ name, categories, addOns }: RunPlan): RunStep[] {
  const steps: RunStep[] = [];

  /**
   * Always first, and never optional. An event created without one has a page
   * with no poster, no location and no schedule, for ever: the hash is
   * committed by `create_event` and there is no `update_event`. When publishing
   * fails the answer is to host the file somewhere else, not to go on without
   * it.
   */
  steps.push({ id: "document", kind: "document", label: "Publish the event details" });

  steps.push({
    id: "event",
    kind: "event",
    // The name is in the label because it is the one thing here that can never
    // be corrected, and this is the last screen before it is fixed forever.
    label: name.trim() ? `Create "${name.trim()}"` : "Create the event",
  });

  for (const category of categories) {
    const code = category.code.trim();
    steps.push({
      id: `category:${code}`,
      kind: "category",
      label: `Add the ${code}`,
      code,
    });
  }

  /**
   * After the distances and before opening, and both halves of that matter.
   *
   * After, because an add-on is worth nothing without a race to attach it to
   * and the organiser reads the list top to bottom. Before opening, because
   * `reserve_addon` requires the event to be `Open`: anything added afterwards
   * is a thing the earliest entrants were never offered, and entries are the
   * one part of this that cannot be replayed.
   *
   * One step per size, not per item. The contract holds a quota per add-on, so
   * `EVENT_JERSEY_M` is its own row with its own stock, which is the only way
   * a sold-out size can be true.
   */
  for (const unit of addOnUnits(addOns)) {
    steps.push({
      id: `addon:${unit.code}`,
      kind: "addon",
      label: `Add the ${unit.label}`,
      code: unit.code,
    });
  }

  steps.push({ id: "open", kind: "open", label: "Open for entries" });

  return steps;
}

/** The first step that has not landed yet, or undefined once they all have. */
export function nextStep(steps: RunStep[], done: string[]): RunStep | undefined {
  return steps.find((step) => !done.includes(step.id));
}
