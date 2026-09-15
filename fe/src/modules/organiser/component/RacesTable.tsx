"use client";

/**
 * Every race this wallet organises, one row each.
 *
 * The sparkline earns its column: a bar says 312 of 500, and the line says
 * whether it is still moving. A race that has already run falls to the floor, a
 * race that was never opened is flat, and neither of those is visible in the
 * bar beside it.
 *
 * The status word never comes from here. `EventStatusBadge` draws it through
 * `statusLabel`, which is the only place in the app a lifecycle state becomes
 * words, and the reason "Draft" never reaches a screen.
 */
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

import { EventStatusBadge } from "@/components/elements/EventStatusBadge";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { formatEventDate } from "@/utils/format";
import type { EventStatus } from "@sterunxyz/sdk";

import { Sparkline } from "./Sparkline";

export interface RaceRow {
  eventId: number;
  name: string;
  startsAt: bigint;
  status: EventStatus;
  entered: number;
  quota: number;
  entriesPerDay: number[];
}

const DAY = 86_400n;

/**
 * How far away race day is, in the words somebody would use.
 *
 * Whole days on both sides of now, and "today" for the last day in either
 * direction. Counting down past zero into "in 0 days" is the failure this
 * exists to avoid: a race that is on right now would read as one that is not.
 */
function when(startsAt: bigint, nowS: bigint): string {
  if (startsAt <= nowS) {
    const days = (nowS - startsAt) / DAY;
    if (days === 0n) return "today";
    return days === 1n ? "yesterday" : `${days} days ago`;
  }
  const days = (startsAt - nowS) / DAY;
  if (days === 0n) return "today";
  return days === 1n ? "tomorrow" : `in ${days} days`;
}

/** The fill of the quota bar, as a width. Zero places means zero, never Infinity. */
function fill(entered: number, quota: number): string {
  if (quota <= 0) return "0%";
  return `${Math.min(100, (entered / quota) * 100)}%`;
}

const CELL = "border-b border-n-200 px-4 py-3 align-middle";

export function RacesTable({ rows, nowS }: { rows: readonly RaceRow[]; nowS: bigint }) {
  const isMobile = useIsMobile();

  if (rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-n-500">You have not published a race yet.</p>;
  }

  /*
    A phone gets a list, not the table (Ancung, 2026-09-15). Six columns in
    390px left the name column a few characters wide, so every race name broke
    over three or four lines while the table scrolled sideways under it. Each
    race is one row you tap, carrying what a phone reader needs to pick one:
    the name, its status, when it runs and how full it is. The sparkline stays
    on the wide table, where there is room to read a shape.

    Chosen with `useIsMobile` rather than two trees hidden by CSS, so only one
    exists in the document: jsdom applies no CSS, and two copies of every race
    would make every query in the dashboard's tests find each race twice.
  */
  if (isMobile) {
    return (
      <ul className="border-t border-n-200">
        {rows.map((race) => (
          <li key={race.eventId} className="border-b border-n-200 last:border-b-0">
            <Link href={`/org/events/${race.eventId}`} className="flex flex-col gap-2 px-4 py-3">
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0 font-medium text-ink">{race.name}</span>
                <EventStatusBadge status={race.status} />
              </span>
              <span className="numeric text-xs text-n-500">
                {formatEventDate(race.startsAt)} · {when(race.startsAt, nowS)}
              </span>
              <span className="flex items-center gap-3">
                <span aria-hidden className="h-2 flex-1 overflow-hidden rounded-full bg-n-100">
                  <span
                    className="block h-full rounded-full bg-teal"
                    style={{ width: fill(race.entered, race.quota) }}
                  />
                </span>
                <span className="numeric text-sm whitespace-nowrap text-n-600">
                  {race.entered} / {race.quota}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <table className="w-full border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          {["Race", "Status", "Last 14 days", "", "", ""].map((head, index) => (
            <th
              key={head || index}
              scope="col"
              className="bg-n-100 px-4 py-2.5 text-left font-medium whitespace-nowrap text-n-600"
            >
              {head}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="[&>tr:last-child>td]:border-b-0">
        {rows.map((race) => (
          <tr key={race.eventId}>
            <td className={CELL}>
              <Link href={`/org/events/${race.eventId}`} className="font-medium text-ink">
                {race.name}
              </Link>
              <span className="numeric mt-0.5 block text-xs text-n-500">
                {formatEventDate(race.startsAt)} · {when(race.startsAt, nowS)}
              </span>
            </td>
            <td className={CELL}>
              <EventStatusBadge status={race.status} />
            </td>
            <td className={CELL}>
              <Sparkline
                values={race.entriesPerDay}
                label={`Entries over the last ${race.entriesPerDay.length} days for ${race.name}`}
              />
            </td>
            <td className={CELL}>
              {/* The width is the one legitimate inline style: a percentage
                  worked out at runtime has no class to come from. */}
              <div
                aria-hidden
                data-fill={fill(race.entered, race.quota)}
                className="h-2 min-w-28 overflow-hidden rounded-full bg-n-100"
              >
                <div
                  className="h-full rounded-full bg-teal"
                  style={{ width: fill(race.entered, race.quota) }}
                />
              </div>
            </td>
            <td className={`numeric text-right whitespace-nowrap text-n-600 ${CELL}`}>
              {race.entered} / {race.quota}
            </td>
            <td className={`w-px text-right whitespace-nowrap ${CELL}`}>
              {/* An icon rather than the word, because the row already names
                  the race and a column of "Open" four times over is four
                  readings of the same instruction. The name it is given is the
                  race's, not the icon's: a screen reader landing here needs to
                  know which race this opens, and "Open" alone would be four
                  identical links. */}
              <Link
                href={`/org/events/${race.eventId}`}
                aria-label={`Open ${race.name}`}
                className="inline-flex text-teal"
              >
                <ExternalLinkIcon aria-hidden className="size-4" />
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
