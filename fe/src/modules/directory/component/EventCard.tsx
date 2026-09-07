/**
 * One race in the directory.
 *
 * The whole card is one link to the event page. Entry is per category and
 * always has been (WEB_APP_IA.md §3.1), so there is nothing here for a card to
 * link an "enter" button at: the category list, with its own price and its own
 * remaining quota, lives on the event page and that is where entry starts.
 * What the card owes a visitor is enough to decide whether to open it.
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EventStatusBadge } from "@/components/elements/EventStatusBadge";
import type { EventSummary } from "@/lib/events";
import { formatEventDate, formatPrice } from "@/utils/format";

export function EventCard({ summary }: { summary: EventSummary }) {
  const { event, categories } = summary;
  const openForEntry = event.status === "Open";
  const slotsLeft = categories.reduce((total, category) => total + category.slotsLeft, 0);

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
          <p className="mt-5 text-sm text-n-500">No categories yet.</p>
        ) : (
          <ul className="mt-5 flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.categoryId}>
                <Badge variant={category.slotsLeft > 0 ? "accent" : "secondary"}>
                  <span className="numeric">{category.code}</span>
                  <span className="ml-2 text-n-500">{formatPrice(category.priceStroops)}</span>
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {openForEntry && categories.length > 0 ? (
          <p className="numeric mt-4 text-sm text-n-600">
            {slotsLeft > 0
              ? `${slotsLeft} ${slotsLeft === 1 ? "place" : "places"} left`
              : "Every category is full"}
          </p>
        ) : null}
      </Link>
    </Card>
  );
}
