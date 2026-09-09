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
 * `Cancelled` shares `Closed`'s tone because the palette has four tones and
 * this is the fourth "not open" state — and the two are exactly the pair a
 * runner must not confuse, since one means the race is still on. That is a
 * reason to give Cancelled its own treatment, not a reason to think colour is
 * carrying the meaning; see the note below.
 *
 * Colour alone never carries that, which is why the status word is written out
 * and repeated in `data-status`.
 */
import { Badge, type BadgeTone } from "./Badge";
import type { EventStatus } from "@sterun/sdk";

const TONES: Record<EventStatus, BadgeTone> = {
  Open: "positive",
  Draft: "muted",
  Closed: "caution",
  Completed: "neutral",
  Cancelled: "caution",
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return (
    <Badge tone={TONES[status]} dataStatus={status}>
      {status}
    </Badge>
  );
}
