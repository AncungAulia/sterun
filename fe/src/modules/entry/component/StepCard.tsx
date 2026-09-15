/**
 * One card of an entry step: a heading, an optional line or action beside it,
 * and the content.
 *
 * A `region` named by its own heading, so a screen reader can jump between
 * "Distance", "Race pack" and "Emergency contact" the way a sighted runner
 * scans the cards. Shared by every step so the cards cannot drift apart.
 */
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

export function StepCard({
  id,
  title,
  hint,
  action,
  children,
}: {
  /** Also what a Continue that finds a problem scrolls to. */
  id: string;
  title: string;
  /** Only what the runner needs to fill this card in (fe/CLAUDE.md, hints). */
  hint?: string;
  /** One control on the heading's line, such as the review step's Edit. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card id={id} role="region" aria-labelledby={`${id}-title`} className="gap-4 p-5">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={`${id}-title`} className="heading-strong text-lg text-ink">
            {title}
          </h2>
          {action}
        </div>
        {hint ? <p className="mt-1 text-sm text-n-500">{hint}</p> : null}
      </div>
      {children}
    </Card>
  );
}
