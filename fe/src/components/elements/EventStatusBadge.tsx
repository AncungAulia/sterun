/**
 * The event lifecycle, as a chip.
 *
 * Only `Open` accepts entries, and that is the single distinction the whole
 * directory turns on, so it is the only status that gets the positive tone. The
 * other three are all "you cannot enter this", and differ only in why:
 *
 *   Draft      the organiser has not opened it yet
 *   Closed     entries were open and are not any more
 *   Completed  the race has been run and results published (terminal)
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
} as const satisfies Record<EventStatus, string>;

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return (
    <Badge variant={VARIANTS[status]} data-status={status}>
      {status}
    </Badge>
  );
}
