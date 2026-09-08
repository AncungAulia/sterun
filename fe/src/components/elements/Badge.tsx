/**
 * A small status chip. Every value comes from a token in app/tokens.css.
 *
 * The tones map to meaning rather than to colour: `positive` is a state a
 * visitor can act on, `neutral` is inert, `caution` is something that needs
 * reading before it is trusted.
 */
import type { ReactNode } from "react";

export type BadgeTone = "positive" | "neutral" | "muted" | "caution";

const TONES: Record<BadgeTone, string> = {
  positive: "bg-success-surface text-success border-success-border",
  neutral: "bg-teal-50 text-teal-700 border-teal-200",
  muted: "bg-n-100 text-n-600 border-n-200",
  caution: "bg-warning-surface text-warning border-warning-border",
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  /** Copied to `data-status` so tests and scripts can find a state by name. */
  dataStatus?: string;
}

export function Badge({ tone = "muted", children, className = "", dataStatus }: BadgeProps) {
  return (
    <span
      data-status={dataStatus}
      className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
