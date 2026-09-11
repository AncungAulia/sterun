/**
 * One race in the directory, led by its poster.
 *
 * The whole card is one link to the event page. Entry is per category and
 * always has been (WEB_APP_IA.md §3.1), so there is no enter button to put here:
 * the card owes a visitor enough to decide whether to open the race, which is
 * where it is, when it is, whether there is room, and what it costs.
 *
 * Three sizes share one card so the featured row and the grid cannot drift
 * apart. Only the featured card sets its title in the hero face, because Big
 * Shoulders is only used at 48px and above (tokens.css).
 */
import { CalendarDaysIcon, MapPinIcon, TicketIcon } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { EventStatusBadge } from "@/components/elements/EventStatusBadge";
import { cn } from "@/utils/cn";
import { formatEventDate } from "@/utils/format";

import { entriesLine, placeLine, priceLine, type DirectoryEntry } from "../browse";
import { PosterFrame } from "./PosterFrame";

export type EventCardVariant = "grid" | "featured" | "side";

/**
 * `sizes` does nothing while PosterFrame sets `unoptimized`: Next emits no
 * `srcset` then. It is kept so the frame is ready if posters are ever optimised.
 */
const SIZES: Record<EventCardVariant, string> = {
  grid: "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  featured: "(min-width: 1024px) 66vw, 100vw",
  side: "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
};

interface EventCardProps {
  entry: DirectoryEntry;
  documentLoading: boolean;
  variant?: EventCardVariant;
}

export function EventCard({ entry, documentLoading, variant = "grid" }: EventCardProps) {
  const { event, categories } = entry.summary;
  const place = variant === "side" ? null : placeLine(entry.document);
  const entries = entriesLine(entry.summary);
  const price = variant === "side" ? null : priceLine(categories);
  const featured = variant === "featured";
  // The same race can be on the page twice (featured row and grid), so the
  // title's id comes from useId, not from the event id.
  const titleId = useId();

  return (
    <Link
      href={`/events/${event.eventId}`}
      // Named by the race alone, not by everything inside the card ("No image, Open, ...").
      aria-labelledby={titleId}
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg border border-n-200 bg-paper shadow-card",
        "transition-[box-shadow,transform] duration-150 ease-out hover:shadow-lifted active:scale-[0.98]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
      )}
    >
      <PosterFrame
        posterUrl={entry.document?.posterUrl ?? null}
        loading={documentLoading}
        sizes={SIZES[variant]}
      >
        <div className="absolute top-3 right-3">
          <EventStatusBadge status={event.status} />
        </div>
      </PosterFrame>

      <div className={cn("flex flex-1 flex-col gap-3", featured ? "p-6" : "p-4")}>
        <h3
          id={titleId}
          className={cn(
            "line-clamp-2 text-ink",
            featured ? "heading-hero text-4xl" : "heading-strong text-xl",
          )}
        >
          {event.name}
        </h3>

        <ul className="flex flex-col gap-1.5 text-sm text-n-600">
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
