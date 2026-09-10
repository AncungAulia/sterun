"use client";

/**
 * Where you are in a sequence of steps, and how much is left.
 *
 * A row of pills said which step was current and nothing else: not what had
 * already been done, not how many were left, not whether the thing you just
 * did stuck. A stepper answers all three at a glance, which matters more here
 * than in most wizards because the middle steps are irreversible and somebody
 * who loses their place cannot simply start again.
 *
 * Not a shadcn component: they do not ship one. Built from tokens like
 * everything else, and kept deliberately dumb, so it can be dropped into the
 * entry flow (STE-21) without carrying wizard logic with it.
 */
import { CheckIcon } from "lucide-react";

import { cn } from "@/utils/cn";

export interface StepperProps<T extends string> {
  steps: readonly { id: T; label: string }[];
  current: T;
}

export function Stepper<T extends string>({ steps, current }: StepperProps<T>) {
  const currentIndex = steps.findIndex((step) => step.id === current);

  return (
    <nav aria-label="Progress">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {steps.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;

          return (
            <li key={step.id} className="flex items-center gap-2">
              <span
                aria-current={active ? "step" : undefined}
                className="flex items-center gap-2"
              >
                <span
                  className={cn(
                    "numeric flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-medium",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary text-primary",
                    !done && !active && "border-border text-muted-foreground",
                  )}
                >
                  {done ? <CheckIcon className="size-4" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    active ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
                {/* Colour alone cannot carry this, and a screen reader reads
                    the list in order anyway, so the state is said in words. */}
                <span className="sr-only">
                  {done ? "completed" : active ? "current step" : "not started"}
                </span>
              </span>

              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn("h-px w-6", done ? "bg-primary" : "bg-border")}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
