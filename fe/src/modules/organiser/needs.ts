/**
 * What is waiting on the organiser, worked out rather than announced.
 *
 * Three things can be waiting, and only one of them can hurt:
 *
 *   scanner  a race is days away and no device is allowed to check anyone in.
 *            Nobody finds out until people are queuing at the gate.
 *   open     a race exists but its entries are not open, so nobody can find it.
 *   results  a race has been run and nothing has been recorded against it.
 *
 * Two rules keep this honest. **A missing answer is never a finding**: an
 * unanswered request for a scanner list is not a race with no scanner, and
 * treating it as one sends somebody to fix what is not broken. And **urgency is
 * about how long there is to act**, not about how bad the problem is — the same
 * missing scanner is a note three weeks out and an interruption three days out.
 *
 * A cancelled race needs nothing. There is no race to check anyone into and no
 * result to record.
 */
import type { EventSummary } from "@/lib/events";

const DAY = 86_400n;

/** How far ahead a race is worth asking about. One request per race. */
const SCANNER_WINDOW_DAYS = 14n;

/** Inside this, a missing scanner stops being a note and interrupts. */
const URGENT_DAYS = 7n;

export type NeedKind = "scanner" | "open" | "results";

export interface Need {
  kind: NeedKind;
  eventId: number;
  eventName: string;
  urgent: boolean;
  title: string;
  detail: string;
  action: string;
  href: string;
}

export interface NeedsInput {
  events: readonly EventSummary[];
  nowS: bigint;
  /** Only for races that were asked about; a missing key means "not answered". */
  scannerCounts: ReadonlyMap<number, number>;
  /** Recorded finishes and DNFs. A missing key means "not answered". */
  resultCounts: ReadonlyMap<number, number>;
}

function daysUntil(startsAt: bigint, nowS: bigint): bigint {
  return (startsAt - nowS) / DAY;
}

function daysSince(startsAt: bigint, nowS: bigint): bigint {
  return (nowS - startsAt) / DAY;
}

function inDays(days: bigint): string {
  if (days <= 0n) return "Runs today";
  if (days === 1n) return "Runs tomorrow";
  return `Runs in ${days} days`;
}

function agoDays(days: bigint): string {
  if (days <= 0n) return "Finished today";
  if (days === 1n) return "Finished yesterday";
  return `Finished ${days} days ago`;
}

/**
 * Races whose scanner list is worth a request: still to be run, inside the
 * window, and not cancelled. Entries being closed does not exclude one — that
 * is the normal state of a race the week before it runs.
 */
export function racesToAskAboutScanners(
  events: readonly EventSummary[],
  nowS: bigint,
): number[] {
  return events
    .filter(({ event }) => {
      if (event.status === "Cancelled" || event.status === "Draft") return false;
      if (event.startsAt <= nowS) return false;
      return daysUntil(event.startsAt, nowS) <= SCANNER_WINDOW_DAYS;
    })
    .map(({ event }) => event.eventId);
}

/** Races that have already been run and could be missing their results. */
export function racesToAskAboutResults(
  events: readonly EventSummary[],
  nowS: bigint,
): number[] {
  return events
    .filter(({ event }) => event.status !== "Cancelled" && event.startsAt < nowS)
    .map(({ event }) => event.eventId);
}

export function buildNeeds({ events, nowS, scannerCounts, resultCounts }: NeedsInput): Need[] {
  const needs: Need[] = [];

  for (const { event } of events) {
    if (event.status === "Cancelled") continue;

    if (event.status === "Draft") {
      needs.push({
        kind: "open",
        eventId: event.eventId,
        eventName: event.name,
        urgent: false,
        title: `Open entries — ${event.name}`,
        detail: "Nobody can find this race or enter it.",
        action: "Open entries",
        href: `/org/events/${event.eventId}`,
      });
      continue;
    }

    if (event.startsAt > nowS) {
      const scanners = scannerCounts.get(event.eventId);
      if (scanners === 0) {
        const days = daysUntil(event.startsAt, nowS);
        needs.push({
          kind: "scanner",
          eventId: event.eventId,
          eventName: event.name,
          urgent: days <= URGENT_DAYS,
          title: `Add a scanner — ${event.name}`,
          detail: `${inDays(days)}. Nobody can check runners in.`,
          action: "Add a scanner",
          href: `/org/events/${event.eventId}?tab=scanners`,
        });
      }
      continue;
    }

    const results = resultCounts.get(event.eventId);
    if (results === 0) {
      needs.push({
        kind: "results",
        eventId: event.eventId,
        eventName: event.name,
        urgent: false,
        title: `Upload results — ${event.name}`,
        detail: `${agoDays(daysSince(event.startsAt, nowS))} with no results.`,
        action: "Upload results",
        href: `/org/events/${event.eventId}?tab=results`,
      });
    }
  }

  const startsAt = new Map(events.map(({ event }) => [event.eventId, event.startsAt]));
  return needs.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    const left = startsAt.get(a.eventId) ?? 0n;
    const right = startsAt.get(b.eventId) ?? 0n;
    return left === right ? a.eventId - b.eventId : left < right ? -1 : 1;
  });
}
