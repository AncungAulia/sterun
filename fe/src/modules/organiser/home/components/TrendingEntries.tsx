/**
 * Which distances are moving right now, across every race.
 *
 * Ranked by (race, distance) rather than by race, because the decision behind
 * the question is whether to add a wave, and that is made about one distance.
 * The race name sits under the distance for the same reason: "5K" is the answer
 * and "which 5K" is the qualifier.
 *
 * An empty list is a sentence, not an empty box. "Nothing in the last 7 days"
 * is a real answer to this question and an organiser should be able to read it
 * without wondering whether the panel failed to load.
 */
import type { TrendingRow } from "@/modules/organiser/shared/lib/records";

export function TrendingEntries({
  rows,
  days,
}: {
  rows: readonly TrendingRow[];
  days: number;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-n-200 bg-paper p-4">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="heading-strong text-sm text-ink">Trending entries</h2>
        <p className="text-xs whitespace-nowrap text-n-500">Last {days} days</p>
      </div>

      {rows.length === 0 ? (
        /* The height three rows would take, and the answer in the middle of it.
           Nothing else: rules with nothing between them are a hint about a list
           that is not there (Ancung, 2026-09-14, having seen both). The height
           is what matters, so the first entry fills the panel in rather than
           pushing the page around. */
        <p className="grid h-30 place-items-center text-sm text-n-500">
          No entries in the last {days} days
        </p>
      ) : (
        <ol className="flex flex-col">
          {rows.map((row, index) => (
            <li
              key={`${row.eventId}-${row.code}`}
              className="flex items-center gap-3 border-t border-n-200 py-2.5 first:border-t-0 first:pt-0"
            >
              <span className="numeric w-5 shrink-0 text-xs text-n-400">#{index + 1}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{row.code}</span>
                <span className="block text-xs text-n-500">{row.eventName}</span>
              </span>
              <span className="numeric ml-auto pl-3 text-sm font-medium whitespace-nowrap text-ink">
                +{row.count}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
