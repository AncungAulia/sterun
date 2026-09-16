/**
 * The tab strip, as links. `aria-current` rather than a tablist: each tab is a
 * different address, and a screen reader should announce a page, not a widget.
 *
 * It scrolls sideways at phone width and never wraps. Scanners is the tab
 * somebody opens standing at the gate, so it must stay on the strip.
 */
import Link from "next/link";

import { RACE_TABS, raceTabHref, type RaceTab } from "../lib/race-tab";

export function RaceTabs({ eventId, current }: { eventId: number; current: RaceTab }) {
  return (
    <nav
      aria-label="Race sections"
      className="overflow-x-auto overflow-y-hidden border-b border-n-200 bg-paper px-4 md:px-6"
    >
      <ul className="flex min-w-max gap-6">
        {RACE_TABS.map((tab) => {
          const on = tab.id === current;
          return (
            <li key={tab.id}>
              <Link
                href={raceTabHref(eventId, tab.id)}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={
                  on
                    ? "-mb-px block border-b-2 border-teal py-3 text-sm font-medium text-ink"
                    : "-mb-px block border-b-2 border-transparent py-3 text-sm text-n-500 hover:text-ink"
                }
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
