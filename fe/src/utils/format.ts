/**
 * Pure formatting helpers. No chain coupling, no React, no side effects.
 */
import { formatStroops } from "@sterunxyz/sdk";

const GROUPED = new Intl.NumberFormat("en-US");


/**
 * `GABCD…WXYZ` — enough of both ends to compare two addresses by eye, which is
 * what people actually do when checking they connected the right account.
 */
export function shortAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/**
 * An entry fee, ready to put on a card.
 *
 * The stroops-to-decimal step is `formatStroops` from the SDK rather than a
 * second implementation here: the 7-decimal rule is the contract's, and two
 * copies of it would eventually disagree by a stroop in one place and not the
 * other.
 */
export function formatPrice(stroops: bigint): string {
  if (stroops === 0n) return "Free";
  const [whole, fraction] = formatStroops(stroops).split(".");
  // "en-US" rather than the visitor's locale: every string in this UI is
  // English (fe/CLAUDE.md), and a locale-dependent separator would make the
  // same event render "1.500" for one visitor and "1,500" for another.
  const grouped = GROUPED.format(BigInt(whole));
  return `sUSD ${grouped}${fraction ? `.${fraction}` : ""}`;
}

/**
 * The widest instant a JS `Date` can hold, in whole seconds. `starts_at` is a
 * `u64` on chain and nothing validates its upper bound, so a typo in the
 * organiser console can produce a value no calendar can render. That is a
 * corrupt event, not a reason for the whole directory to fail to paint.
 */
const MAX_TIMESTAMP_S = 8_640_000_000_000n;

function toDate(startsAt: bigint): Date | null {
  if (startsAt < -MAX_TIMESTAMP_S || startsAt > MAX_TIMESTAMP_S) return null;
  return new Date(Number(startsAt) * 1000);
}

/**
 * The calendar date of a race, in a given timezone.
 *
 * The timezone argument is not decoration. A 05:30 start in Jakarta is 22:30
 * the previous day in UTC, so rendering `starts_at` without deciding whose
 * clock to read moves races to the wrong day. Callers pass the viewer's own
 * timezone and let `formatEventDateTime` name it.
 */
export function formatEventDate(startsAt: bigint, timeZone?: string): string {
  const date = toDate(startsAt);
  if (!date) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** The same instant with its clock time, and the timezone that time is in. */
export function formatEventDateTime(startsAt: bigint, timeZone?: string): string {
  const date = toDate(startsAt);
  if (!date) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
