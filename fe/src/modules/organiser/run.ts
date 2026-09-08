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
import type { PlannedCategory } from "./component/StepCategoryPlan";

export type RunStepKind = "document" | "event" | "category" | "open";

export interface RunStep {
  /** Stable across a re-plan, so what is already done stays done. */
  id: string;
  kind: RunStepKind;
  /** Shown in the list, in the organiser's words rather than the contract's. */
  label: string;
  /** Only on `category` steps: which distance this one adds. */
  code?: string;
}

export interface RunPlan {
  name: string;
  categories: PlannedCategory[];
  /**
   * False when there is no details file to publish, which happens only after
   * publishing has failed and the organiser chose to go on without one.
   */
  withDocument: boolean;
}

export function planRun({ name, categories, withDocument }: RunPlan): RunStep[] {
  const steps: RunStep[] = [];

  if (withDocument) {
    steps.push({ id: "document", kind: "document", label: "Publish the event details" });
  }

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

  steps.push({ id: "open", kind: "open", label: "Open for entries" });

  return steps;
}

/** The first step that has not landed yet, or undefined once they all have. */
export function nextStep(steps: RunStep[], done: string[]): RunStep | undefined {
  return steps.find((step) => !done.includes(step.id));
}
