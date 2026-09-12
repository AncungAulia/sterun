/**
 * The featured row: one large race and up to two beside it.
 *
 * Only races with a poster reach here (`pickFeatured`), because a large empty
 * frame is the worst possible first thing on the page.
 *
 * The row's shape follows how many races it has, because a layout built for
 * three looks broken with two. Below `lg` the cards always stack; from `lg`:
 *
 * - three races: a 3 by 2 grid. The lead spans two columns and both rows, and
 *   its 16:9 shape sets the row's height; each side card takes one row and
 *   gives up its own ratio to fill it.
 * - two races: two equal columns, each card 16:9. The lead keeps the lead's
 *   contents (venue, price, big title) but not a size the other cannot match,
 *   because one card towering over its only neighbour reads as a mistake. It is
 *   also told it is `compact`, because a half-width lead is where the hero title
 *   at its largest outgrows the card.
 * - one race: the full width, flattened to 21:9, since 16:9 across a laptop
 *   screen is taller than the screen.
 */
import { cn } from "@/utils/cn";

import type { DirectoryEntry } from "../browse";
import { FeaturedCard } from "./FeaturedCard";

export function FeaturedEvents({ entries }: { entries: readonly DirectoryEntry[] }) {
  const [lead, ...others] = entries;
  if (!lead) return null;
  // Two beside the lead at most, whatever a caller passes: the three-race grid
  // has two rows, so a third side card would open a third.
  const rest = others.slice(0, 2);

  return (
    <section
      aria-label="Featured races"
      className={cn(
        "grid gap-4",
        rest.length === 1 && "lg:grid-cols-2",
        rest.length === 2 && "lg:grid-cols-3 lg:grid-rows-2",
      )}
    >
      <FeaturedCard
        entry={lead}
        size="lead"
        // Two equal columns is the only row where the lead is half its width.
        // `className` cannot carry this: the size the title steps down to is a
        // class on the heading, not on the card.
        compact={rest.length === 1}
        className={cn(
          // Alone across the full width, 16:9 would be taller than most laptop screens.
          rest.length === 0 && "lg:aspect-[21/9]",
          // `h-full` keeps the lead level with the side cards if their text ever
          // makes a row taller than half the lead's 16:9 height.
          rest.length === 2 && "lg:col-span-2 lg:row-span-2 lg:h-full",
        )}
      />
      {rest.map((item) => (
        <FeaturedCard
          key={item.summary.event.eventId}
          entry={item}
          size="side"
          // Only in the three-race grid does a side card drop its own ratio: its
          // height is one row of the lead, which works out at about 16:9 anyway.
          className={cn(rest.length === 2 && "lg:aspect-auto lg:h-full")}
        />
      ))}
    </section>
  );
}
