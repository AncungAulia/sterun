/**
 * The one thing that interrupts.
 *
 * A race days away with nobody able to check runners in is not discovered until
 * people are queuing at the gate, so it does not wait for somebody to click the
 * bell. Everything else does.
 *
 * The measure of whether this rule is still honest is how often it fires: if an
 * organiser sees this more than about once a week, it has stopped meaning
 * anything and the condition in `needs.ts` should be narrowed, not the colour
 * changed.
 *
 * It prints `eventName` and `detail` as they were built rather than taking them
 * apart: a race is free to have a hyphen in its name, and a banner that sliced
 * on punctuation would quietly lose half its sentence the day one does.
 */
import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";

import type { Need } from "../lib/needs";

export function UrgentBanner({ need }: { need: Need }) {
  return (
    <div
      role="note"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-warning-border bg-warning-surface px-4 py-3"
    >
      <TriangleAlertIcon aria-hidden className="size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 text-sm text-warning">
        <strong className="font-semibold">{need.eventName}</strong> {need.detail}
      </p>
      <Link
        href={need.href}
        className="ml-auto shrink-0 rounded-md border border-warning-border bg-paper px-3.5 py-2 text-sm font-medium text-warning"
      >
        {need.action}
      </Link>
    </div>
  );
}
