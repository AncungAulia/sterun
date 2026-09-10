/**
 * The event lifecycle, as a chip.
 *
 * Only `Open` accepts entries, and that is the single distinction the whole
 * directory turns on, so it is the only status that gets the positive tone. The
 * other four are all "you cannot enter this", and differ only in why:
 *
 *   Draft      the organiser has not opened it yet — outline, the faintest
 *   Closed     entries are shut, but the race is still on — filled grey
 *   Completed  the race has been run and results published (terminal)
 *   Cancelled  the race is off (terminal) — contracts v2
 *
 * Two pairs have to stay apart, and neither is about looking nice:
 *
 * `Draft` and `Closed` are both grey because nothing is wrong in either, but
 * they point opposite ways in time — Draft is "not yet", Closed is "no longer".
 * Outline against filled keeps that readable without spending a hue on a state
 * a runner can do nothing about.
 *
 * `Closed` and `Cancelled` are the pair a runner must not confuse, because one
 * of them still has a race at the end of it. Cancelled is the only status that
 * gets the destructive tone; it is the only one that is genuinely bad news.
 *
 * Colour alone never carries any of that, which is why the status word is
 * written out and repeated in `data-status`.
 */
import { Badge } from "@/components/ui/badge";
import type { EventStatus } from "@sterunxyz/sdk";

const VARIANTS = {
  Open: "success",
  Draft: "outline",
  Closed: "muted",
  Completed: "accent",
  Cancelled: "destructive",
} as const satisfies Record<EventStatus, string>;

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return (
    <Badge variant={VARIANTS[status]} data-status={status}>
      {status}
    </Badge>
  );
}
