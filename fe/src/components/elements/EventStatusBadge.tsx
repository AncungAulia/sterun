/**
 * The event lifecycle, as a chip.
 *
 * Only `Open` accepts entries, and that is the single distinction the whole
 * directory turns on, so it is the only status that gets the positive tone. The
 * other four are all "you cannot enter this", and differ only in why:
 *
 *   Draft      the organiser has not opened it yet
 *   Closed     entries were open and are not any more, but the race is still on
 *   Completed  the race has been run and results published (terminal)
 *   Cancelled  the race is off (terminal) — contracts v2
 *
 * `Cancelled` borrows `Closed`'s tone for now, and those two are exactly the
 * pair a runner must not confuse, since one of them means the race is still on.
 * Since the shadcn migration this badge also has `destructive`, so giving
 * Cancelled a tone of its own is a design call still open rather than something
 * the palette forbids.
 *
 * Colour alone never carries that, which is why the status word is written out
 * and repeated in `data-status`.
 */
import { Badge } from "@/components/ui/badge";
import type { EventStatus } from "@sterun/sdk";

const VARIANTS = {
  Open: "success",
  Draft: "secondary",
  Closed: "warning",
  Completed: "accent",
  Cancelled: "warning",
} as const satisfies Record<EventStatus, string>;

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return (
    <Badge variant={VARIANTS[status]} data-status={status}>
      {status}
    </Badge>
  );
}
