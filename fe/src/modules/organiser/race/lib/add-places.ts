/**
 * STE-57 - adding places to a distance, as pure rules.
 *
 * Raising a published quota is a real change to what a runner bought, so the
 * console pairs it with a signed announcement (root CLAUDE.md, STE-55). The
 * contract cannot enforce that pairing, which is why the page does: one dialog,
 * one button, and a first line of the announcement written from the numbers so
 * it can never say something different from what changed.
 *
 * Mockup: docs/superpowers/specs/2026-09-17-quota-increase-mockup.html.
 */
import type { EventStatus } from "@sterunxyz/sdk";

import { MAX_ANNOUNCEMENT_CHARS } from "@/lib/event/announcements";

/** `new_quota` is a `u32` on chain. */
const MAX_QUOTA = 4_294_967_295;

/**
 * Whether the header offers Add places.
 *
 * `increase_quota` has no status gate, but places only mean something while a
 * race can still take entries: open, or closed and able to reopen. A draft has
 * nothing to add to until entries open, and a race that has run is over. It
 * waits for a clock, like Reopen entries, so it never flashes on a race that
 * turns out to have run.
 */
export function offersAddPlaces(status: EventStatus, startsAt: bigint, nowS: bigint | undefined): boolean {
  if (status !== "Open" && status !== "Closed") return false;
  return nowS !== undefined && startsAt > nowS;
}

/** "8,100", the way every count in the console is written. */
function count(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * The new number as a number, or the sentence saying why it is not one.
 * An empty field is neither: nothing to complain about yet.
 */
export function readNewQuota(
  input: string,
  current: number,
): { quota: number; problem: null } | { quota: null; problem: string | null } {
  const text = input.trim();
  if (text === "") return { quota: null, problem: null };
  if (!/^\d+$/.test(text)) return { quota: null, problem: "Enter a whole number of entries." };
  const quota = Number(text);
  if (quota <= current) {
    return {
      quota: null,
      problem: `Enter a number above ${count(current)}. Entries cannot go down or stay the same.`,
    };
  }
  if (quota > MAX_QUOTA) return { quota: null, problem: "That is more entries than a race can hold." };
  return { quota, problem: null };
}

/** "Entries for 10K raised from 500 to 800." The line the organiser cannot edit. */
export function raiseSentence(code: string, from: number, to: number): string {
  return `Entries for ${code} raised from ${count(from)} to ${count(to)}.`;
}

/**
 * The note as the server will take it: line breaks as `\n`, and no other
 * control character, because the server refuses any (a pasted `\r\n` is the
 * realistic one).
 */
export function cleanNote(note: string): string {
  let out = "";
  for (const ch of note.replace(/\r\n?/g, "\n")) {
    const cp = ch.codePointAt(0) as number;
    if ((cp < 0x20 && cp !== 0x09 && cp !== 0x0a) || cp === 0x7f) continue;
    out += ch;
  }
  return out.trim();
}

/** How long a note may be once the sentence and the blank line above it are counted. */
export function maxNoteLength(sentence: string): number {
  return MAX_ANNOUNCEMENT_CHARS - sentence.length - 2;
}

/** The whole announcement: the sentence, then the note as its own paragraph. */
export function announcementBody(sentence: string, note: string): string {
  const cleaned = cleanNote(note);
  return cleaned ? `${sentence}\n\n${cleaned}` : sentence;
}

/**
 * What the done state says about entries, which depends on the race: "open
 * again" is only true of a race that is open.
 */
export function doneLead(code: string, status: EventStatus): string {
  return status === "Open"
    ? `Runners can enter ${code} again, and the announcement is on the race page.`
    : `Runners can enter ${code} once you reopen entries, and the announcement is on the race page.`;
}
