/**
 * What a race record means to the runner reading it (docs/design/profile/README.md §3).
 *
 * The contract has four states. A runner reading this page lives through seven
 * different things, and two pairs of them look identical in the state field
 * alone:
 *
 *   - `Finished` with `finishTimeS === null` is a finish with no official time
 *     (STE-41), a real outcome at a race with no chip timing. Reading the absent
 *     time as `0` publishes a zero second race.
 *   - `Dnf` with no `claimedAt` never collected a race pack, so the runner never
 *     started. Calling that "did not finish" is a statement about a race they
 *     were not at.
 *
 * And one meaning no record carries at all: a cancelled race never claims or
 * finishes anybody, so its records stay `Entered` forever. That one is read off
 * the event, and it wins over an `Entered` record, because otherwise the page
 * shows an entry that looks abandoned for a race someone else called off.
 */
import type { EventStatus, SterunRecord } from "@sterunxyz/sdk";

export type Meaning =
  | { kind: "entered" }
  | { kind: "collected" }
  | { kind: "finished"; timeS: number }
  | { kind: "finished-untimed" }
  | { kind: "dnf" }
  | { kind: "dns" }
  | { kind: "cancelled" };

export type MeaningKind = Meaning["kind"];

export function meaningOf(
  record: Pick<SterunRecord, "state" | "finishTimeS" | "claimedAt">,
  eventStatus: EventStatus | null,
): Meaning {
  switch (record.state) {
    case "Finished":
      return record.finishTimeS === null
        ? { kind: "finished-untimed" }
        : { kind: "finished", timeS: record.finishTimeS };
    case "Dnf":
      return record.claimedAt === null ? { kind: "dns" } : { kind: "dnf" };
    case "RacepackClaimed":
      return eventStatus === "Cancelled" ? { kind: "cancelled" } : { kind: "collected" };
    case "Entered":
      return eventStatus === "Cancelled" ? { kind: "cancelled" } : { kind: "entered" };
  }
}

/** The chip's word, from the handoff's copy deck. */
export const CHIP_WORD: Record<MeaningKind, string> = {
  entered: "Entered",
  collected: "Race pack collected",
  finished: "Finished",
  "finished-untimed": "Finished",
  dnf: "Did not finish",
  dns: "Did not start",
  cancelled: "Race cancelled",
};

/**
 * `1:52:09` for a run over an hour, `48:03` under one.
 *
 * Seconds are always two digits, and so are minutes once there is an hour in
 * front of them. Anything else reads as a different time.
 */
export function formatFinishTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}

/**
 * What sits in the finish time slot. An absent time is a sentence in the same
 * position, so a reader scanning down the column still lands on it.
 */
export function finishSlot(meaning: Meaning): { value: string; absent: boolean } {
  switch (meaning.kind) {
    case "finished":
      return { value: formatFinishTime(meaning.timeS), absent: false };
    case "finished-untimed":
      return { value: "No official time", absent: true };
    case "dnf":
    case "dns":
      return { value: "None", absent: true };
    case "cancelled":
      return { value: "The race did not take place", absent: true };
    case "entered":
    case "collected":
      return { value: "Not yet", absent: true };
  }
}
