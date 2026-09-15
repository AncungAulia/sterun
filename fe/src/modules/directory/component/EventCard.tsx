/**
 * One race in the directory's list, led by its poster.
 *
 * The whole card is one link to the event page. Entry is per category and
 * always has been (WEB_APP_IA.md §3.1), so there is no enter button to put here:
 * the card owes a visitor enough to decide whether to open the race, which is
 * where it is, when it is, whether there is room, and what it costs.
 *
 * The featured row does not use this card: its poster fills the card with the
 * text over it (`FeaturedCard`). Both print the same lines from `browse.ts`.
 */
import { CalendarDaysIcon, MapPinIcon, TicketIcon } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { EventStatusBadge } from "@/components/elements/EventStatusBadge";
import { cn } from "@/utils/cn";
import { formatEventDate } from "@/utils/format";

import { entriesLine, placeLine, priceLine, type DirectoryEntry } from "../browse";
import { PosterFrame } from "./PosterFrame";

/**
 * `sizes` does nothing while PosterFrame sets `unoptimized`: Next emits no
 * `srcset` then. It is kept so the frame is ready if posters are ever optimised.
 */
const SIZES = "(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";

interface EventCardProps {
  entry: DirectoryEntry;
  documentLoading: boolean;
}

export function EventCard({ entry, documentLoading }: EventCardProps) {
  const { event, categories } = entry.summary;
  const place = placeLine(entry.document);
  const entries = entriesLine(entry.summary);
  const price = priceLine(categories);
  // The same race can be on the page twice (featured row and grid), so the
  // title's id comes from useId, not from the event id.
  const titleId = useId();
  const detailsId = useId();

  return (
    <Link
      href={`/events/${event.eventId}`}
      // Named by the race alone, not by everything inside the card ("No image, Open, ...").
      aria-labelledby={titleId}
      // The name alone told a keyboard user nothing about where or when, so the details follow it.
      aria-describedby={detailsId}
      // The link is the card surface, so the global focus ring's small radius
      // would square its corners on Tab. globals.css restores them for this slot.
      data-slot="event-card"
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg border border-n-200 bg-paper shadow-card",
        // Tailwind v4 compiles scale-* to the `scale` property, not `transform`.
        "transition-[box-shadow,scale] duration-150 ease-out hover:shadow-lifted active:scale-[0.98]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
      )}
    >
      <PosterFrame posterUrl={entry.document?.posterUrl ?? null} loading={documentLoading} sizes={SIZES}>
        <div className="absolute top-3 right-3">
          <EventStatusBadge status={event.status} />
        </div>
      </PosterFrame>

      {/* The body fills the card so prices line up across a row. */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 id={titleId} className="heading-strong line-clamp-2 text-xl text-ink">
          {event.name}
        </h3>

        <ul id={detailsId} className="flex flex-col gap-1.5 text-sm text-n-600">
          {place ? (
            <li className="flex items-center gap-2">
              <MapPinIcon aria-hidden className="size-4 shrink-0 text-n-500" />
              <span className="truncate">{place}</span>
            </li>
          ) : null}
          <li className="flex items-center gap-2">
            <CalendarDaysIcon aria-hidden className="size-4 shrink-0 text-n-500" />
            <span className="numeric">{formatEventDate(event.startsAt)}</span>
          </li>
          {entries ? (
            <li className="flex items-center gap-2">
              <TicketIcon aria-hidden className="size-4 shrink-0 text-n-500" />
              <span className="numeric">{entries}</span>
            </li>
          ) : null}
          {categories.length === 0 ? <li>No distances yet</li> : null}
        </ul>

        {price ? <p className="numeric mt-auto pt-1 text-base font-medium text-ink">{price}</p> : null}
      </div>
    </Link>
  );
}
