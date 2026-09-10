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
 * Race day is the only moment painted in the brand teal. Everything else is a
 * step toward it, and a page where five things are emphasised emphasises
 * nothing.
 *
 * All of it comes from the document except race day, so all of it is covered
 * by the hash. A race cannot move its collection window after people have paid
 * without the fingerprint saying so.
 */
import { useSyncExternalStore } from "react";
import {
  ClipboardCheckIcon,
  ClipboardListIcon,
  FlagIcon,
  PackageIcon,
  PackageOpenIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { formatEventDateTime } from "@/utils/format";
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

  // Race day comes from the chain, not the document. It is the one date the
  // contract itself holds, so it is the one that cannot be wrong.
  moments.push({
    key: "race-day",
    label: "Race day",
    iso: new Date(Number(startsAt) * 1000).toISOString(),
  });

  return moments.sort((a, b) => a.iso.localeCompare(b.iso));
}

export function TabTimeline({
  document,
  startsAt,
  /* Injected so the tests stay true after these dates go by. Left out
     everywhere else, where the clock comes from `clientClock` above. */
  now,
}: {
  document: EventMetadata;
  startsAt: bigint;
  now?: number;
}) {
  const moments = timelineMoments(document, startsAt);
  const painted = useSyncExternalStore(subscribe, clientClock, serverClock);
  const clock = now ?? painted;

  return (
    /* Held to a reading width. Stretched across the full page the label and
       its date end up so far apart that the eye stops pairing them, which is
       the one job this list has. */
    <ol className="flex max-w-2xl flex-col">
      {moments.map((moment, index) => {
        const at = Date.parse(moment.iso);
        const passed = clock !== undefined && at <= clock;
        const raceDay = moment.key === "race-day";
        const Icon = MOMENT_ICONS[moment.key] ?? FlagIcon;

        return (
          <li
            key={moment.key}
            data-passed={passed}
            className="grid grid-cols-[2.5rem_1fr] gap-x-4"
          >
            {/* The rail. The token sits on it, and the line is drawn by the
                cell rather than by the token so it never has to guess how tall
                the row beside it turned out to be. */}
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

            {/* No rule under the row: the rail is already the line holding
                these together, and a second one crossing it turns a timeline
                back into a table. */}
            <div
              className={`flex flex-col gap-y-0.5 pt-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-6 ${
                index < moments.length - 1 ? "pb-7" : "pb-2"
              }`}
            >
              <p
                data-testid="moment-label"
                className={
                  passed ? "text-base text-n-500" : "text-base font-medium text-foreground"
                }
              >
                {moment.label}
              </p>
              <p className="numeric text-sm text-n-500">
                {formatEventDateTime(BigInt(Math.floor(at / 1000)))}
                {passed ? <span className="ml-3 text-n-400">Passed</span> : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
