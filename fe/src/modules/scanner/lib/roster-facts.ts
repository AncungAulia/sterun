/**
 * The small facts the scanner screens print about a roster, as pure functions.
 *
 * Kept out of the components so the rules are tested without rendering: which
 * clock a time is read on, how a ledger number is grouped, and how a drift is
 * said in words a volunteer acts on.
 */
import type { StoredRoster } from "./scanner-store";

/**
 * "09:02", on this phone's clock and in its own timezone, which is the clock the
 * volunteer is looking at when they ask "is this download from this morning?".
 */
export function formatClock(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}

/** The distance label for a category id, or null when the chain gave none. */
export function distanceOf(roster: Pick<StoredRoster, "categories">, categoryId: number): string | null {
  return roster.categories.find((category) => category.categoryId === categoryId)?.code ?? null;
}

/**
 * How far off this phone's clock can be before codes start failing: the
 * tolerance, in seconds. 30 with today's frozen numbers, and deliberately NOT
 * the 90 the STE-18 handoff names.
 *
 * ±1 step is a 90-second window for a *code*, which is a different thing from
 * how wrong a *clock* may be. With the scanner d seconds fast, a current code is
 * checked against step floor((t + d) / 30). Up to 30 seconds that is always
 * within one step. From 31 to 59 it is two steps away for part of every half
 * minute, so some scans fail. From 60 every scan fails. A banner waiting for 90
 * would stay quiet over a desk that had already refused everyone.
 */
export function driftLimitSeconds(totp: StoredRoster["totp"]): number {
  return totp.toleranceSteps * totp.stepSeconds;
}

/**
 * The drift, the way a person says it: "4 minutes fast", "95 seconds slow".
 *
 * Seconds below two minutes, because "1 minute" for 95 seconds would sound
 * inside a 90-second tolerance that it is not. Whole minutes above, rounded,
 * because nobody sets a phone clock to the second.
 */
export function describeDrift(driftSeconds: number): string {
  const direction = driftSeconds > 0 ? "fast" : "slow";
  const size = Math.abs(driftSeconds);
  if (size < 120) return `${size} seconds ${direction}`;
  const minutes = Math.round(size / 60);
  return `${minutes} minutes ${direction}`;
}
