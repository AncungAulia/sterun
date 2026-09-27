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
export type RaceAction = "open" | "reopen" | "close" | "addPlaces" | "closeDate" | "cancel";

export interface HeaderPlan {
  /** The one button. `null` on a race nothing can be done to. */
  primary: RaceAction | null;
  /** Behind the menu, in this order. Empty means no menu at all. */
  menu: RaceAction[];
}

/**
 * What the header offers: one button at most, and a menu for the rest.
 *
 * `ConsoleHeader` holds one action per tab, and by STE-69 this header had
 * three. They now live in a labelled menu, which is one control again, and the
 * only race that keeps a button of its own is a **Draft**: a draft exists in
 * order to be opened, and hiding that behind a menu leaves somebody's first
 * race looking like a page nothing can be done to.
 *
 * Everything else is in the menu, in the order an organiser would look for it,
 * with cancelling last and apart. Nothing leads on an Open race deliberately
 * (Ancung, 2026-09-27): none of these is what somebody opens the page to do,
 * and the one that would have led, Close entries, is a button whose accidental
 * press stops a race selling.
 *
 * `Completed` and `Cancelled` get nothing at all. Both are terminal on chain,
 * and a menu of items that all revert is worse than no menu.
 *
 * It takes the status and nothing else. It used to take the close date too, to
 * decide which of two ways back should lead on a race the date had closed; with
 * every way back in one menu there is no such choice left to make.
 */
export function headerPlan(status: EventStatus): HeaderPlan {
  if (status === "Completed" || status === "Cancelled") return { primary: null, menu: [] };
  if (status === "Draft") return { primary: "open", menu: ["closeDate", "cancel"] };
  if (status === "Open") {
    return { primary: null, menu: ["addPlaces", "closeDate", "close", "cancel"] };
  }
  return { primary: null, menu: ["addPlaces", "closeDate", "reopen", "cancel"] };
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
