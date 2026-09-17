/**
 * The tab strip, as links. `aria-current` rather than a tablist: each tab is a
 * different address, and a screen reader should announce a page, not a widget.
 *
 * It scrolls sideways at phone width and never wraps. Scanners is the tab
 * somebody opens standing at the gate, so it must stay on the strip.
 *
 * **Shaped like the race page's own tabs** (Ancung, 2026-09-17): an icon, a
 * label, and a teal rule under the one you are on, so the two tab strips in
 * this product read as one thing rather than two. What it does not copy is the
 * public page's full-width grid: six tabs divide a reading page evenly, while
 * three stretched across a console would leave Scanners a screen away from
 * Overview. These are as wide as their words, and the space between them does
 * the separating.
 *
 * **The marker under the open tab is an inset shadow, not a bottom border.**
 * A border sat on the strip's own rule and was pulled over it with `-mb-px`,
 * which is exactly the pixel `overflow-y-hidden` clips, so the 2px marker
 * arrived as a hairline and the strip read as though nothing was selected. A
 * shadow is drawn inside the padding box, where no overflow rule reaches it.
 */
import { LayoutDashboardIcon, ScanLineIcon, UsersIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { RACE_TABS, raceTabHref, type RaceTab } from "../lib/race-tab";

/**
 * Here rather than in `race-tab.ts`, which the route imports as a server
 * component: an icon belongs to the strip, not to the address.
 */
const ICONS: Record<RaceTab, LucideIcon> = {
  overview: LayoutDashboardIcon,
  entries: UsersIcon,
  scanners: ScanLineIcon,
};

export function RaceTabs({ eventId, current }: { eventId: number; current: RaceTab }) {
  return (
    <nav
      aria-label="Race sections"
      className="overflow-x-auto overflow-y-hidden border-b border-n-200 bg-paper px-4 md:px-6"
    >
      <ul className="flex min-w-max gap-2">
        {RACE_TABS.map((tab) => {
          const on = tab.id === current;
          const Icon = ICONS[tab.id];
          return (
            <li key={tab.id}>
              <Link
                href={raceTabHref(eventId, tab.id)}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={
                  on
                    ? "flex items-center gap-2 px-3 py-3 text-base font-medium text-ink shadow-[inset_0_-2px_0_var(--color-teal)]"
                    : "flex items-center gap-2 px-3 py-3 text-base text-n-500 transition-colors hover:text-ink"
                }
              >
                <Icon aria-hidden="true" className={on ? "size-4 text-teal" : "size-4 text-n-400"} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
