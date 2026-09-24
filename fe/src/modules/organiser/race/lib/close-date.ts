/**
 * The registration close date, as the console reasons about it (STE-69).
 *
 * The contract has enforced one since STE-46: past it, `enter` refuses with
 * `RegistrationClosed(20)` even while the race's status is still `Open`. Two
 * dates are therefore in play and they are **not** the same thing:
 *
 * - the **document's** registration window, hashed into the race when it was
 *   published, which is what runners were promised, and
 * - the **chain's** close date, which is what actually refuses an entry.
 *
 * Everything here is about the second one. Where the two disagree, the screen
 * shows the chain's, because that is the one that decides.
 *
 * Pure, outside React, so the bounds and the sentence can be tested without a
 * wallet.
 */
import type { EventStatus } from "@sterunxyz/sdk";

import type { EventMetadata } from "@/lib/event/metadata";

/** What the header offers on this race, in the order it offers it. */
export type RaceAction = "open" | "reopen" | "close" | "addPlaces" | "closeDate";

export interface HeaderPlan {
  /** The one button. `null` on a race nothing can be done to. */
  primary: RaceAction | null;
  /** Behind the menu, in this order. Empty means no menu at all. */
  menu: RaceAction[];
}

/**
 * Which action leads, and which fold into the menu.
 *
 * The console's rule is one action per tab, and until now this header carried
 * two (STE-57). A third would have made the exception the rule, so they fold
 * into one button and a menu, and **which one leads depends on the race**:
 *
 * - **Draft** exists to be opened, and nothing else is urgent.
 * - **Open** leads with adding places, because a sold-out distance is money not
 *   being taken right now. Closing and the date are both rarer and neither is
 *   losing anybody anything this minute.
 * - **Closed with a date that has passed** leads with the date, because that is
 *   the only thing that lets anybody enter again. Reopening the status alone
 *   changes a word and nothing else, which is the worst kind of button: it
 *   succeeds and does not work.
 * - **Closed by hand** leads with reopening, which is the move that matches.
 * - **Completed** and **Cancelled** are terminal on chain, so they get nothing.
 *   A header full of buttons that all revert is worse than an empty one.
 */
export function headerPlan(
  status: EventStatus,
  closesAt: bigint | null,
  nowS: bigint | undefined,
): HeaderPlan {
  if (status === "Completed" || status === "Cancelled") return { primary: null, menu: [] };
  if (status === "Draft") return { primary: "open", menu: ["closeDate"] };
  if (status === "Open") return { primary: "addPlaces", menu: ["closeDate", "close"] };

  // Closed. The date decides which of the two ways back leads.
  return datePassed(closesAt, nowS)
    ? { primary: "closeDate", menu: ["addPlaces", "reopen"] }
    : { primary: "reopen", menu: ["addPlaces", "closeDate"] };
}

/** True only when there is a date and it is behind us. No date is not "passed". */
export function datePassed(closesAt: bigint | null, nowS: bigint | undefined): boolean {
  if (closesAt === null || nowS === undefined) return false;
  return closesAt <= nowS;
}

/**
 * The last moment a closing date may sit at, and why.
 *
 * **Race pack collection is the real bound where the document names one.**
 * Handing packs out while entries are still open means somebody paying for a
 * race whose pack has already gone out, and no desk can undo that. Where the
 * document has no race pack window, race day itself is the bound: entries after
 * the gun are not entries.
 */
export interface CloseDateBound {
  /** Unix seconds. */
  latest: number;
  /** What that bound is, for the sentence under the field. */
  reason: "racepack" | "raceDay";
}

export function closeDateBound(
  startsAt: bigint,
  metadata: EventMetadata | null,
): CloseDateBound {
  const raceDay = Number(startsAt);
  const packStart = metadata?.schedule
    ?.filter((phase) => (phase.phase ?? "").toLowerCase().includes("racepack"))
    .map((phase) => (phase.startsAt ? Date.parse(phase.startsAt) : Number.NaN))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b)[0];

  if (packStart !== undefined) {
    const seconds = Math.floor(packStart / 1000);
    // A document whose race pack window sits after race day is not a reason to
    // widen the bound; race day still ends entries.
    if (seconds < raceDay) return { latest: seconds, reason: "racepack" };
  }
  return { latest: raceDay, reason: "raceDay" };
}

/**
 * The sentence runners read. Written from the two dates and never typed, so
 * what is published always matches what changed.
 *
 * It names both dates rather than saying "extended" or "brought forward": the
 * reader sees the direction for themselves, and one word cannot be wrong for
 * the case it was not written for.
 */
export function closeDateSentence(
  raceName: string,
  previous: bigint | null,
  next: Date,
  format: (date: Date) => string,
): string {
  const to = format(next);
  if (previous === null) {
    return `Entries for ${raceName} close on ${to}.`;
  }
  const from = format(new Date(Number(previous) * 1000));
  return `Entries for ${raceName} now close on ${to} instead of ${from}.`;
}

/** What is wrong with a chosen date, or null. One sentence, for under the field. */
export function closeDateProblem(
  next: Date | null,
  bound: CloseDateBound,
  format: (date: Date) => string,
): string | null {
  if (next === null || Number.isNaN(next.getTime())) return "Choose a date and time.";
  const seconds = Math.floor(next.getTime() / 1000);
  if (seconds > bound.latest) {
    const limit = format(new Date(bound.latest * 1000));
    return bound.reason === "racepack"
      ? `Race pack collection starts ${limit}, so entries have to close before then.`
      : `Race day is ${limit}, so entries have to close before then.`;
  }
  return null;
}
