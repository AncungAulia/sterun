/**
 * One race in the directory's list, led by its poster.
 *
 * The whole card is one link to the event page. Entry is per category and
 * always has been (WEB_APP_IA.md §3.1), so there is no enter button to put here:
 * the card owes a visitor enough to decide whether to open the race, which is
 * where it is, when it is, whether there is room, and what it costs.
 *
 * ## No frame around it (Ancung, 2026-09-23)
 *
 * It used to be a bordered white card with a shadow. It is now the poster, with
 * the text under it on the page's own background, which is what loket.com and
 * eventbrite.com both do: the poster is the only thing on the card with a
 * shape, so a second rectangle around it competes with it, and a row of framed
 * boxes reads heavier than a row of pictures.
 *
 * What the frame used to do, two things, is done otherwise. Separating one card
 * from the next: the grid's gap and the poster's own edges. Saying the card is
 * pressable: the poster grows a little inside its own frame under the pointer
 * (Ancung, 2026-09-23, replacing an underline on the title), and the whole
 * surface is still one link.
 *
 * The lines carry no icons any more. Three icons on three lines of a small card
 * is decoration standing where the eye lands; the price, which is the one thing
 * a visitor scans a row for, is the bottom line and the only bold one.
 *
 * The featured row does not use this card: its poster fills the card with the
 * text over it (`FeaturedCard`). Both print the same lines from `browse.ts`.
 */
import Link from "next/link";
import { useId } from "react";

import { EventStatusBadge } from "@/components/feedback/EventStatusBadge";
import { formatEventDate } from "@/utils/format";

import { entriesLine, placeLine, priceLine, type DirectoryEntry } from "../lib/browse";
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
  // The place sits above the title on screen and still has to reach a screen
  // reader, so it is named separately rather than moved into the block below.
  const placeId = useId();

  return (
    <Link
      href={`/events/${event.eventId}`}
      // Named by the race alone, not by everything inside the card ("No image, Open, ...").
      aria-labelledby={titleId}
      // The name alone told a keyboard user nothing about where or when, so the details follow it.
      aria-describedby={place ? `${placeId} ${detailsId}` : detailsId}
      // The link is the card surface, so the global focus ring's small radius
      // would square its corners on Tab. globals.css restores them for this slot.
      data-slot="event-card"
      className="group flex h-full flex-col gap-3"
    >
      {/* The frame crops, the picture inside it moves: scaling the frame would
          push its neighbours around and cut the corners off the radius. */}
      <PosterFrame
        posterUrl={entry.document?.posterUrl ?? null}
        loading={documentLoading}
        sizes={SIZES}
        className="rounded-lg border border-n-200 [&_img]:transition-transform [&_img]:duration-200 [&_img]:ease-out group-hover:[&_img]:scale-105 motion-reduce:[&_img]:transition-none motion-reduce:group-hover:[&_img]:scale-100"
      >
        <div className="absolute top-3 right-3">
          <EventStatusBadge status={event.status} />
        </div>
      </PosterFrame>

      {/* The body fills the row so the prices line up across it. */}
      <div className="flex flex-1 flex-col gap-1">
        {place ? (
          <p id={placeId} className="truncate text-sm text-n-500">
            {place}
          </p>
        ) : null}

        {/* One line, never two (Ancung): a row of cards whose titles are one
            line tall and two lines tall reads as a broken grid, and the rest of
            the name is on the race's own page a tap away. */}
        <h3 id={titleId} className="heading-strong truncate text-xl text-ink">
          {event.name}
        </h3>

        <div id={detailsId} className="flex flex-col gap-1 text-sm text-n-600">
          <p className="numeric">{formatEventDate(event.startsAt)}</p>
          {entries ? <p className="numeric">{entries}</p> : null}
          {categories.length === 0 ? <p>No distances yet</p> : null}
        </div>

        {price ? (
          /* Held to the bottom so a glance down a column compares prices rather
             than hunting for them. No rule above it (Ancung, 2026-09-23): on a
             card with no frame a divider is the only line on the card, and it
             draws more attention than the price it was meant to set apart. The
             line already says "From" where it needs to (`priceLine`). */
          <p className="numeric mt-auto pt-2 text-base font-medium text-ink">{price}</p>
        ) : null}
      </div>
    </Link>
  );
}
