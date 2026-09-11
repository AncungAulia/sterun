/**
 * One race in the organiser console.
 *
 * Not the directory's card. A runner deciding whether to open a race wants
 * prices and places left; the organiser running it wants how full each distance
 * is, the sold-out ones included, and a race still in Draft with nothing on sale
 * is the one they most need to find again. Same event, a different question.
 *
 * Links to the public event page for now. The per-event console
 * (`/org/events/[id]`, scanners, results) is not built yet, and the public page
 * is what an organiser checks first anyway: it is what runners see.
 */
import Link from "next/link";

import { EventStatusBadge } from "@/components/elements/EventStatusBadge";
import { Card } from "@/components/ui/card";
import type { EventSummary } from "@/lib/events";
import { formatEventDate } from "@/utils/format";

export function OrganiserEventCard({ summary }: { summary: EventSummary }) {
  const { event, categories } = summary;

  return (
    <Card className="gap-0 py-0 transition-shadow hover:shadow-lifted">
      <Link href={`/events/${event.eventId}`} className="block rounded-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="heading-strong text-xl text-ink">{event.name}</h2>
            <p className="numeric mt-1 text-sm text-n-500">{formatEventDate(event.startsAt)}</p>
          </div>
          <EventStatusBadge status={event.status} />
        </div>

        {categories.length === 0 ? (
          <p className="mt-5 text-sm text-n-500">No distances yet.</p>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {categories.map((category) => (
              <li key={category.categoryId}>
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="numeric text-ink">{category.code}</span>
                  <span className="numeric text-n-600">
                    {`${category.enteredCount} of ${category.quota} entered`}
                  </span>
                </div>
                <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-n-100">
                  <div
                    className="h-full rounded-full bg-n-600"
                    style={{ width: `${filledPercent(category.enteredCount, category.quota)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Link>
    </Card>
  );
}

/** Clamped, because a quota of zero is refused on chain but a bad read is not. */
function filledPercent(entered: number, quota: number): number {
  if (quota <= 0) return 0;
  return Math.min(100, Math.round((entered / quota) * 100));
}
