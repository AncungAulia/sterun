/**
 * A race in the featured row: the poster is the whole card.
 *
 * The grid card puts its text in a white body under a 16:9 frame. Here that
 * body is gone, like a news hero: the poster fills the card and the text sits
 * over its lower edge. It is a separate component rather than a variant of
 * `EventCard` because the two now share no layout at all, only the lines they
 * print (`browse.ts`), and a variant flag threaded through every element was
 * how the featured card's stretched frame leaked classes into the grid card.
 *
 * The card takes whatever height its row gives it, so a side card beside a tall
 * lead shows more blurred band rather than a white gap. Every poster is drawn
 * whole (`PosterFrame`), so no height crops its text.
 *
 * A long race name shrinks the title one step rather than running past the two
 * lines it is clamped to (`featuredTitleClass`).
 */
import { CalendarDaysIcon, MapPinIcon, TicketIcon } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { EventStatusBadge } from "@/components/elements/EventStatusBadge";
import { cn } from "@/utils/cn";
import { formatEventDate } from "@/utils/format";

import { entriesLine, placeLine, priceLine, type DirectoryEntry } from "../browse";
import { PosterFrame } from "./PosterFrame";

export type FeaturedCardSize = "lead" | "side";

/**
 * `sizes` does nothing while PosterFrame sets `unoptimized`: Next emits no
 * `srcset` then. It is kept so the frame is ready if posters are ever optimised.
 */
const SIZES: Record<FeaturedCardSize, string> = {
  lead: "(min-width: 1024px) 66vw, 100vw",
  side: "(min-width: 1024px) 33vw, 100vw",
};

/**
 * 4:3 on phones, where a 16:9 card is too short for the title and three lines
 * under it. Both sizes start here; what the card does from `lg` depends on how
 * many races the row holds, which only `FeaturedEvents` knows, so it arrives in
 * `className`.
 */
const CARD_SHAPE = "aspect-[4/3] sm:aspect-video";

/**
 * Past this many characters a name takes the title down one step instead of
 * filling both clamped lines and losing its tail.
 *
 * Measured against the names actually on testnet, and counted on the
 * **narrowest** card of each size rather than the widest, so the step-down is
 * never late: for the lead that is a phone, where the card is the width of the
 * screen and the title is `text-4xl`, and about sixteen characters of Big
 * Shoulders fit on a line, so two lines is about thirty-two. "Elektro Dash 2026
 * (TESTING)" (27) still lands inside them and keeps the big face, while "Sterun
 * untimed finish sanity 2026-09-11" (39) does not and steps down. A wider lead
 * fits more than sixteen per line, so there the threshold is merely
 * conservative. Poppins at `text-xl` is smaller type in a third of the width,
 * which works out a little tighter, hence the lower number for a side card.
 * `line-clamp-2` stays as the backstop for a name longer than either.
 */
const LEAD_LONG_NAME = 32;
const SIDE_LONG_NAME = 30;

/**
 * The title's face and size for a name of this length.
 *
 * A lead title never goes below `text-4xl`: `heading-hero` is Big Shoulders,
 * and `tokens.css` only allows that face at 48px and above. `compact` is the
 * half-width lead of the two-race row (see `FeaturedEvents`): from `lg` the
 * lead is no wider than its neighbour, and `text-5xl` there makes the text
 * block taller than the card, which then grows and leaves no bare poster at
 * all. Below `lg` the lead is full width in every row, so it keeps the big
 * face there.
 */
export function featuredTitleClass(name: string, size: FeaturedCardSize, compact = false): string {
  const length = name.trim().length;
  if (size === "lead") {
    if (length > LEAD_LONG_NAME) return "heading-hero text-4xl";
    return compact ? "heading-hero text-4xl sm:text-5xl lg:text-4xl" : "heading-hero text-4xl sm:text-5xl";
  }
  return length > SIDE_LONG_NAME ? "heading-strong text-lg" : "heading-strong text-xl";
}

interface FeaturedCardProps {
  entry: DirectoryEntry;
  size: FeaturedCardSize;
  /** The lead is only half the row's width, so its title takes a smaller step. */
  compact?: boolean;
  /** Placement in the featured grid, which only the row knows. */
  className?: string;
}

export function FeaturedCard({ entry, size, compact = false, className }: FeaturedCardProps) {
  const { event, categories } = entry.summary;
  const lead = size === "lead";
  // Side cards are compact: title, date and entries left, nothing else.
  const place = lead ? placeLine(entry.document) : null;
  const price = lead ? priceLine(categories) : null;
  const entries = entriesLine(entry.summary);
  // The same race is on the page twice (featured row and list), so the ids
  // come from useId, not from the event id.
  const titleId = useId();
  const detailsId = useId();
  const priceId = useId();

  return (
    <Link
      href={`/events/${event.eventId}`}
      aria-labelledby={titleId}
      // The price is a sibling of the details list, so it needs naming too, or
      // "From sUSD 25" is the one line a screen reader never reaches.
      aria-describedby={price ? `${detailsId} ${priceId}` : detailsId}
      // globals.css restores the card's radius on this slot, or the global focus ring squares it.
      data-slot="event-card"
      className={cn(
        // `overflow-hidden` clips the poster to the corners, and it also turns off
        // the aspect ratio's rule that a box grows to fit its content. `min-h-min`
        // puts that back, so a long title on a phone grows the card instead of
        // being cut off at the top.
        "relative flex min-h-min flex-col justify-end overflow-hidden rounded-lg bg-ink shadow-card",
        // Tailwind v4 compiles scale-* to the `scale` property, not `transform`.
        "transition-[box-shadow,scale] duration-150 ease-out hover:shadow-lifted active:scale-[0.98]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        CARD_SHAPE,
        className,
      )}
    >
      <PosterFrame
        posterUrl={entry.document?.posterUrl ?? null}
        // Only races whose document has already answered are featured.
        loading={false}
        sizes={SIZES[size]}
        className="absolute inset-0 aspect-auto h-full"
      />

      {/*
        One layer, and it is the text block itself: the fade has to end inside
        this box, or the poster it is meant to leave alone gets a second dark
        sheet over it. The whole point of the card is that the picture is the
        card, so the top of the picture must be untouched.

        The stops earn their numbers. `to-transparent` at the top of the box
        lands in the top padding band, which is empty space above the first
        line, so no text ever sits on bare poster; the band is smaller on a side
        card because that card is about half the height. `via-ink/85 via-65%`
        puts the steep part of the ramp inside that band rather than behind the
        title: the top
        of the title's caps sits at roughly 60% ink and its first line at about
        85%, which is 4.3:1 and 10:1 against `paper` even over a pure white
        poster, and the bottom stays at 95% under the details and the price. A
        default `via` (50%) would put the title's first line near 45% ink, which
        is 2.8:1 and the reason this was reworked. The earlier version instead
        floored the whole block at 70% ink with a separate `before:` layer above
        it, which read as a grey sheet over most of a 368px lead card.
      */}
      <div
        className={cn(
          "relative flex flex-col bg-linear-to-t from-ink/95 via-ink/85 via-65% to-transparent text-paper",
          lead ? "gap-3 p-6 pt-16" : "gap-2 p-4 pt-12",
        )}
      >
        <h3 id={titleId} className={cn("line-clamp-2", featuredTitleClass(event.name, size, compact))}>
          {event.name}
        </h3>

        <ul id={detailsId} className="flex flex-col gap-1 text-sm">
          {place ? (
            <li className="flex items-center gap-2">
              <MapPinIcon aria-hidden className="size-4 shrink-0 opacity-80" />
              <span className="truncate">{place}</span>
            </li>
          ) : null}
          <li className="flex items-center gap-2">
            <CalendarDaysIcon aria-hidden className="size-4 shrink-0 opacity-80" />
            <span className="numeric">{formatEventDate(event.startsAt)}</span>
          </li>
          {entries ? (
            <li className="flex items-center gap-2">
              <TicketIcon aria-hidden className="size-4 shrink-0 opacity-80" />
              <span className="numeric">{entries}</span>
            </li>
          ) : null}
          {categories.length === 0 ? <li>No distances yet</li> : null}
        </ul>

        {price ? (
          <p id={priceId} className="numeric text-base font-medium">
            {price}
          </p>
        ) : null}
      </div>

      {/* After the text in the markup so the fade above the text never dims it on a short card. */}
      <div className="absolute top-3 right-3">
        <EventStatusBadge status={event.status} />
      </div>
    </Link>
  );
}
