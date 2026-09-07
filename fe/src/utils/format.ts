/**
 * Pure formatting helpers. No chain coupling, no React, no side effects.
 */
import { STROOPS_PER_UNIT, formatStroops } from "@sterun/sdk";

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

/**
 * A price typed by a person, as the stroops the contract takes.
 *
 * Parsed digit by digit rather than through `Number`. An entry fee is money:
 * `parseFloat("0.1") * 10_000_000` is 1000000.0000000001, and the price a
 * runner is charged must be the price the organiser typed, exactly. The
 * fractional part is padded rather than multiplied for the same reason.
 *
 * Too much precision is refused instead of rounded. Rounding here would take a
 * number somebody entered deliberately and quietly charge a different one.
 */
export function parseStroops(input: string): bigint {
  const text = input.trim();
  if (!text) return 0n;
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(`"${input}" is not an amount. Use digits and at most one dot, like 25.5`);
  }

  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > 7) {
    throw new Error(`sUSD has 7 decimal places; "${input}" has ${fraction.length}.`);
  }

  return BigInt(whole) * STROOPS_PER_UNIT + BigInt(fraction.padEnd(7, "0") || "0");
}

/**
 * The same instant, spelled out, for confirming what somebody just typed.
 *
 * The weekday is the point. A date entered one month off still looks perfectly
 * plausible as digits, and stops looking plausible the moment it says the wrong
 * day of the week. `starts_at` cannot be corrected after create_event, so this
 * is the last chance anybody gets to notice.
 */
export function formatEventDateTimeLong(startsAt: bigint, timeZone?: string): string {
  const date = toDate(startsAt);
  if (!date) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** The same as formatEventDateTimeLong, for a field that has no time in it. */
export function formatEventDayLong(startsAt: bigint, timeZone?: string): string {
  const date = toDate(startsAt);
  if (!date) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
