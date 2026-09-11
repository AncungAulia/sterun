/**
 * The top of the directory: one race large, up to two beside it.
 *
 * Only races with a poster reach here (`pickFeatured`), because a large empty
 * frame is the worst possible first thing on the page. With one race it takes
 * the whole row rather than leaving an empty column beside it.
 */
import { cn } from "@/utils/cn";

import type { DirectoryEntry } from "../browse";
import { EventCard } from "./EventCard";

export function FeaturedEvents({ entries }: { entries: readonly DirectoryEntry[] }) {
  const [lead, ...others] = entries;
  if (!lead) return null;
  // The layout is one large card and two beside it, whatever a caller passes:
  // a third side card would stretch the column past the lead card.
  const rest = others.slice(0, 2);

  return (
    <section aria-label="Featured races" className={cn("grid gap-4", rest.length > 0 && "lg:grid-cols-3")}>
      <div className={cn(rest.length > 0 && "lg:col-span-2")}>
        <EventCard entry={lead} documentLoading={false} variant="featured" />
      </div>
      {rest.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {rest.map((item) => (
            <EventCard key={item.summary.event.eventId} entry={item} documentLoading={false} variant="side" />
          ))}
        </div>
      ) : null}
    </section>
  );
}
