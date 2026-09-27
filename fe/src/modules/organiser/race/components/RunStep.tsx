/**
 * One line of a run: a numbered circle that becomes a tick, a spinner or a
 * cross, the step's name, and what is happening to it right now.
 *
 * Drawn the same way wherever a dialog walks an organiser through signatures,
 * so two runs in the same console cannot disagree about what "done" looks like.
 * Extracted from `AddPlacesDialog` on 2026-09-24, when moving the registration
 * close date became the second run with the same shape.
 */
import { CheckIcon, CircleAlertIcon, LoaderCircleIcon } from "lucide-react";

import { cn } from "@/utils/cn";

export type RunStepState = "done" | "running" | "waiting" | "failed";

export function RunStep({
  number,
  state,
  label,
  detail,
}: {
  number: number;
  state: RunStepState;
  label: string;
  /** What it is waiting for, or why it failed. */
  detail?: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "numeric mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-sm",
          state === "done" && "bg-success text-paper",
          state === "running" && "text-teal-500",
          state === "waiting" && "border border-n-300 text-n-500",
          state === "failed" && "bg-danger text-paper",
        )}
      >
        {state === "done" ? <CheckIcon className="size-4" /> : null}
        {state === "running" ? <LoaderCircleIcon className="size-5 animate-spin" /> : null}
        {state === "waiting" ? number : null}
        {state === "failed" ? <CircleAlertIcon className="size-4" /> : null}
      </span>
      <div>
        <p className="text-base text-ink">{label}</p>
        {detail ? (
          <p
            role={state === "failed" ? "alert" : undefined}
            className={cn("text-sm", state === "failed" ? "text-danger" : "text-n-500")}
          >
            {detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}
