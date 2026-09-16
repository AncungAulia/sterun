/**
 * Which lifecycle move a race offers from its header, if any.
 *
 * One button, never a menu: the header holds one action (ConsoleHeader). The
 * words are written here, next to the rule that picks them, so a test can hold
 * the one sentence that costs something: once entries open, a race can never
 * return to not open. That is the contract's rule, and it is stated in the
 * dialog itself because a warning with a cost does not go in a tooltip.
 *
 * Completing a race belongs with results (STE-44), and cancelling is a
 * separate, destructive decision nobody has designed yet, so neither is here.
 */
import type { EventStatus } from "@sterunxyz/sdk";

export interface StatusMove {
  to: "Open" | "Closed";
  label: string;
  title: string;
  body: string;
  confirm: string;
}

const OPEN: StatusMove = {
  to: "Open",
  label: "Open entries",
  title: "Open entries?",
  body: "Runners can find this race and enter it from now on. Once entries have opened, this race can never go back to not open. You can still close entries later.",
  confirm: "Sign and open",
};

const CLOSE: StatusMove = {
  to: "Closed",
  label: "Close entries",
  title: "Close entries?",
  body: "Nobody new can enter until you open entries again. Everyone who has entered keeps their place.",
  confirm: "Sign and close",
};

const REOPEN: StatusMove = {
  to: "Open",
  label: "Reopen entries",
  title: "Reopen entries?",
  body: "Runners can enter again until the race is full or you close entries.",
  confirm: "Sign and reopen",
};

export function statusAction(
  status: EventStatus,
  startsAt: bigint,
  nowS: bigint | undefined,
): StatusMove | null {
  const hasRun = nowS !== undefined && startsAt <= nowS;
  switch (status) {
    case "Draft":
      return hasRun ? null : OPEN;
    case "Open":
      return CLOSE;
    case "Closed":
      // Reopening needs to know the race has not run, so it waits for a clock.
      return nowS !== undefined && !hasRun ? REOPEN : null;
    default:
      return null;
  }
}
