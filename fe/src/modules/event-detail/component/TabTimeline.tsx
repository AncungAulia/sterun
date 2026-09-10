/**
 * The dates, read down a rail rather than across a scrollbar.
 *
 * This was a horizontal strip, and a horizontal strip has an edge. With five
 * moments the one hidden behind it was race day, which is the single date the
 * whole page exists to state. Down the page there is no edge: every moment is
 * on screen, in the order it happens, at any width.
 *
 * The rail earns itself because the content really is a sequence. Sign up,
 * collect the pack, run. That is the one shape where a connecting line is
 * information rather than decoration, so it gets one, and the moments that
 * have already gone are dimmed so a reader can see where in the sequence they
 * are standing without doing date arithmetic.
 *
 * ## Why each moment is a card with something in it
 *
 * A date on its own answers "when" and stops there. The list used to be five
 * labels and five dates held to a reading width, which left most of the tab
 * empty and sent the runner to three other tabs for the rest: where the pack
 * desk is, what hours it keeps, when their own distance goes off. So each
 * moment now carries the one thing a runner does about it, and the action that
 * goes with it: enter, or open the venue on a map. The card spans the tab, the
 * label and what it means on the left, the date and the action on the right.
 *
 * Race day is the only moment painted in the brand teal. Everything else is a
 * step toward it, and a page where five things are emphasised emphasises
 * nothing.
 *
 * All of it comes from the document except race day and the list of distances,
 * so all of it is covered by the hash. A race cannot move its collection window
 * after people have paid without the fingerprint saying so.
 */
import { useSyncExternalStore } from "react";
import {
  ClipboardCheckIcon,
  ClipboardListIcon,
  FlagIcon,
  MapPinIcon,
  PackageIcon,
  PackageOpenIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatEventDateTime, formatEventTime } from "@/utils/format";
import { mapsLink } from "@/utils/geo";
import type { EventMetadata } from "@/lib/metadata";

/** The phases in the order they happen, named the way a runner says them. */
const PHASE_LABELS: Record<string, { starts: string; ends: string }> = {
  registration: { starts: "Registration opens", ends: "Registration closes" },
  racepack: { starts: "Race pack collection opens", ends: "Race pack collection closes" },
};

/**
 * One icon per moment, not one per phase: opening and closing are opposite
 * events, and giving them the same glyph would make the rail read as three
 * repeated pairs.
 */
const MOMENT_ICONS: Record<string, LucideIcon> = {
  "registration-start": ClipboardListIcon,
  "registration-end": ClipboardCheckIcon,
  "racepack-start": PackageOpenIcon,
  "racepack-end": PackageIcon,
  "race-day": FlagIcon,
};

/**
 * The clock, read on the client only.
 *
 * The server renders this component too, and a server whose clock is a second
 * ahead of the browser would hand it markup the browser disagrees with. So the
 * server snapshot is `undefined` (nothing dimmed, which is exactly what a
 * reader arriving before the first date sees) and the client swaps in a real
 * time on mount.
 *
 * Cached rather than read per call because `useSyncExternalStore` demands a
 * snapshot that stops changing. Fixing it at first paint is not a compromise
 * here: these dates are days apart.
 */
let firstPaint: number | undefined;

function subscribe() {
  // Nothing to subscribe to. The page is not a countdown, and re-rendering
  // this list every second to move a date from "ahead" to "passed" would be
  // work nobody asked for.
  return () => {};
}

function clientClock(): number {
  firstPaint ??= Date.now();
  return firstPaint;
}

function serverClock(): undefined {
  return undefined;
}

interface Moment {
  key: string;
  label: string;
  iso: string;
}

export function timelineMoments(document: EventMetadata, startsAt: bigint): Moment[] {
  const moments: Moment[] = [];

  for (const phase of document.schedule ?? []) {
    const labels = phase.phase ? PHASE_LABELS[phase.phase] : undefined;
    if (!labels) continue;
    if (phase.startsAt) {
      moments.push({ key: `${phase.phase}-start`, label: labels.starts, iso: phase.startsAt });
    }
    if (phase.endsAt) {
      moments.push({ key: `${phase.phase}-end`, label: labels.ends, iso: phase.endsAt });
    }
  }

  moments.sort((a, b) => Date.parse(a.iso) - Date.parse(b.iso));

  /*
    Race day comes from the chain, not the document. It is the one date the
    contract itself holds, so it is the one that cannot be wrong.

    And it goes last whatever its time says. A pack desk that stays open until
    the evening of race day is common, and sorted strictly by the clock it
    pushed the race itself into the middle of the list, under a moment nobody
    at the start line cares about. Everything above race day is a step toward
    it; the destination belongs at the bottom of the rail.
  */
  moments.push({
    key: "race-day",
    label: "Race day",
    iso: new Date(Number(startsAt) * 1000).toISOString(),
  });

  return moments;
}

/** What a moment says underneath its label, and where it can send a runner. */
interface MomentDetail {
  lines: string[];
  pin?: { lat: number; lng: number };
}

/**
 * The detail for one moment, from whatever the document happens to carry.
 *
 * Every part is optional, because every part of the document is. A line that
 * would have to guess is left out rather than filled with a placeholder: this
 * is a frozen record of what the organiser promised, and a gap in it is more
 * honest than a sentence it never said.
 */
export function momentDetail(
  key: string,
  document: EventMetadata,
  categoryCodes: readonly string[],
): MomentDetail {
  const racepack = document.schedule?.find((phase) => phase.phase === "racepack");

  switch (key) {
    case "registration-start":
      return {
        lines: categoryCodes.length > 0 ? [`Entries open for ${categoryCodes.join(", ")}.`] : [],
      };
    case "registration-end":
      // Said because it is the thing people get wrong: the date is a promise
      // about the latest entries close, and a distance that fills up closes
      // itself long before it.
      return { lines: ["Entries close, or sooner if a distance sells out."] };
    case "racepack-start": {
      const lines: string[] = [];
      if (racepack?.venue) lines.push(racepack.venue);
      if (racepack?.dailyOpens && racepack.dailyCloses) {
        lines.push(`Open ${racepack.dailyOpens} to ${racepack.dailyCloses} each day.`);
      }
      return {
        lines,
        ...(typeof racepack?.venueLat === "number" && typeof racepack.venueLng === "number"
          ? { pin: { lat: racepack.venueLat, lng: racepack.venueLng } }
          : {}),
      };
    }
    case "racepack-end":
      return { lines: ["Last chance to collect your race pack."] };
    case "race-day": {
      const lines: string[] = [];
      const starts = (document.categories ?? [])
        .filter((category) => category.startTime && !Number.isNaN(Date.parse(category.startTime)))
        // First wave first, which is also the time printed beside it.
        .sort((a, b) => Date.parse(a.startTime!) - Date.parse(b.startTime!))
        .map(
          (category) =>
            `${category.code} starts ${formatEventTime(BigInt(Math.floor(Date.parse(category.startTime!) / 1000)))}`,
        );
      if (starts.length > 0) lines.push(starts.join(" · "));
      if (document.location?.name) lines.push(document.location.name);
      const { lat, lng } = document.location ?? {};
      return {
        lines,
        ...(typeof lat === "number" && typeof lng === "number" ? { pin: { lat, lng } } : {}),
      };
    }
    default:
      return { lines: [] };
  }
}

export function TabTimeline({
  document,
  startsAt,
  categoryCodes = [],
  canEnter = false,
  onEnter,
  /* Injected so the tests stay true after these dates go by. Left out
     everywhere else, where the clock comes from `clientClock` above. */
  now,
}: {
  document: EventMetadata;
  startsAt: bigint;
  /** The distances on chain, named where entries open. */
  categoryCodes?: readonly string[];
  /**
   * Whether a runner could enter right now. From the chain, not from the
   * registration dates: a race can be past its opening date and still `Draft`,
   * and a button that leads to a refusal is worse than no button.
   */
  canEnter?: boolean;
  onEnter?: () => void;
  now?: number;
}) {
  const moments = timelineMoments(document, startsAt);
  const painted = useSyncExternalStore(subscribe, clientClock, serverClock);
  const clock = now ?? painted;

  return (
    <ol className="flex flex-col">
      {moments.map((moment, index) => {
        const at = Date.parse(moment.iso);
        const passed = clock !== undefined && at <= clock;
        const raceDay = moment.key === "race-day";
        const Icon = MOMENT_ICONS[moment.key] ?? FlagIcon;
        const detail = momentDetail(moment.key, document, categoryCodes);
        /*
          Nothing to press on a moment that has gone. Entering after
          registration opened is still possible, but that is what the button
          on the next moment down is for, not a line in the past.
        */
        const enter = !passed && canEnter && onEnter && moment.key === "registration-start";
        const map = !passed && detail.pin ? mapsLink(detail.pin) : undefined;

        return (
          <li
            key={moment.key}
            data-passed={passed}
            className="grid grid-cols-[2.5rem_1fr] gap-x-4"
          >
            {/* The rail. The token sits on it, and the line is drawn by the
                cell rather than by the token so it never has to guess how tall
                the card beside it turned out to be. */}
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                /* Passed wins over race day: once the race has been run, its
                   flag is history like everything above it, and leaving it lit
                   would point a reader at a date that has nothing left to
                   tell them. */
                className={
                  passed
                    ? "flex size-10 shrink-0 items-center justify-center rounded-full border border-n-200 bg-n-100 text-n-400"
                    : raceDay
                      ? "flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-500 text-paper"
                      : "flex size-10 shrink-0 items-center justify-center rounded-full border border-teal-200 bg-paper text-teal-500"
                }
              >
                <Icon className="size-4" />
              </span>
              {index < moments.length - 1 ? (
                <span aria-hidden="true" className="w-0.5 flex-1 bg-n-200" />
              ) : null}
            </div>

            <div className={index < moments.length - 1 ? "pb-4" : undefined}>
              <div
                className={
                  passed
                    ? "flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                    : raceDay
                      ? "flex flex-col gap-3 rounded-lg border border-teal-200 bg-paper p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                      : "flex flex-col gap-3 rounded-lg border border-n-200 bg-paper p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                }
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p
                    data-testid="moment-label"
                    className={
                      passed ? "text-base text-n-500" : "text-base font-medium text-foreground"
                    }
                  >
                    {moment.label}
                  </p>
                  {detail.lines.map((line) => (
                    <p key={line} className={passed ? "text-sm text-n-400" : "text-sm text-n-600"}>
                      {line}
                    </p>
                  ))}
                </div>

                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                  <p className="numeric text-sm text-n-500">
                    {formatEventDateTime(BigInt(Math.floor(at / 1000)))}
                    {passed ? <span className="ml-3 text-n-400">Passed</span> : null}
                  </p>
                  {enter ? (
                    <Button size="sm" onClick={onEnter}>
                      Enter race
                    </Button>
                  ) : null}
                  {map ? (
                    <Button asChild size="sm" variant="secondary">
                      <a href={map} target="_blank" rel="noreferrer">
                        <MapPinIcon aria-hidden="true" />
                        Open in Maps
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
