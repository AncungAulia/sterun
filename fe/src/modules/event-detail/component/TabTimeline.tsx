/**
 * The dates, as one line rather than a list.
 *
 * Every date here answers the same question in a different place: when can I
 * sign up, when do I collect the pack, when do I run. A list makes a reader
 * hold them in their head to work out what is next; a line puts them in the
 * only order that matters and lets the eye do it.
 *
 * All of it comes from the document, so all of it is covered by the hash. A
 * race cannot move its collection window after people have paid without the
 * fingerprint saying so.
 */
import { formatEventDateTime } from "@/utils/format";
import type { EventMetadata } from "@/lib/metadata";

/** The phases in the order they happen, named the way a runner says them. */
const PHASE_LABELS: Record<string, { starts: string; ends: string }> = {
  registration: { starts: "Registration opens", ends: "Registration closes" },
  racepack: { starts: "Race pack collection opens", ends: "Race pack collection closes" },
};

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
}: {
  document: EventMetadata;
  startsAt: bigint;
}) {
  const moments = timelineMoments(document, startsAt);

  return (
    /* Scrolls rather than wraps: five dates in order stop being a timeline the
       moment the line breaks and the last one sits under the first. */
    <div className="overflow-x-auto pb-2">
      <ol className="flex min-w-max items-start gap-0">
        {moments.map((moment, index) => (
          <li key={moment.key} className="flex items-start">
            {index > 0 ? <span aria-hidden="true" className="mt-3 h-px w-16 bg-border sm:w-24" /> : null}
            <div className="flex w-40 flex-col items-center gap-2 text-center">
              <span
                aria-hidden="true"
                className="size-6 shrink-0 rounded-full border-2 border-primary bg-paper"
              />
              <p className="numeric text-sm text-foreground">
                {formatEventDateTime(BigInt(Math.floor(Date.parse(moment.iso) / 1000)))}
              </p>
              <p className="text-sm text-muted-foreground">{moment.label}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
