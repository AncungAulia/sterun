"use client";

/**
 * Everything waiting on the organiser, on every page.
 *
 * A panel on the dashboard could never do that: somebody three tabs deep inside
 * a race is exactly the person who has stopped looking at the dashboard. What a
 * bell costs is that it only speaks when it is clicked, which is why the one
 * case that cannot wait for a click is also drawn as a banner
 * (`UrgentBanner`) - and why that case is one case and not a policy.
 *
 * The count is only rendered when there is something to count. A badge that is
 * always lit is furniture, and furniture is not read.
 */
import { BellIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import type { Need } from "../lib/needs";

/**
 * What the button is called, and what the panel is headed.
 *
 * Plain and unaddressed. An earlier wording spoke to the reader — "3 things
 * need you" — and an organiser opening a console at seven in the morning is
 * not looking to be spoken to; they are looking for a list. The count belongs
 * in the label because a screen reader gets no badge.
 */
function label(count: number): string {
  if (count === 0) return "Notifications";
  return count === 1 ? "Notifications, 1 pending" : `Notifications, ${count} pending`;
}

function heading(count: number): string {
  return count === 0 ? "No pending actions" : "Pending actions";
}

export function NeedsBell({ needs }: { needs: readonly Need[] }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label(needs.length)}
        className="relative grid size-9 shrink-0 place-items-center rounded-md border border-n-300 bg-paper text-ink"
      >
        <BellIcon aria-hidden className="size-4" />
        {needs.length > 0 ? (
          <span
            data-needs-count={needs.length}
            aria-hidden
            className="numeric absolute -top-1.5 -right-1.5 grid min-w-4.5 place-items-center rounded-full border-2 border-paper bg-danger px-1 text-xs leading-none font-semibold text-paper"
          >
            {needs.length}
          </span>
        ) : null}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-100 max-w-[calc(100vw-2rem)] rounded-lg border-n-200 p-4"
      >
        <p className="heading-strong mb-3 text-sm text-ink">{heading(needs.length)}</p>

        {needs.length === 0 ? (
          <p className="text-sm text-n-500">Everything is up to date.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {needs.map((item) => (
              <li key={`${item.kind}-${item.eventId}`}>
                <Link
                  href={item.href}
                  data-urgent={item.urgent ? "true" : undefined}
                  /* `group` so the detail line below can read the row's own
                     state. A `data-[urgent=true]:` class on the span would
                     look at the span, which never carries the attribute. */
                  className="group flex items-center gap-3 rounded-md border border-n-200 px-3 py-2.5 data-[urgent=true]:border-warning-border data-[urgent=true]:bg-warning-surface"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-n-500 group-data-[urgent=true]:text-warning">
                      {item.detail}
                    </span>
                  </span>
                  <ChevronRightIcon aria-hidden className="ml-auto size-4 shrink-0 text-n-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
