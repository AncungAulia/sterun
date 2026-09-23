/**
 * The strip across `/profile`, as links.
 *
 * Shaped like the race console's own strip, down to the inset shadow under the
 * open tab (`components/RaceTabs.tsx` in the organiser module carries the full
 * reasoning): an icon, a label, a teal rule, `aria-current` rather than a
 * tablist, because each tab is a different address and a screen reader should
 * announce a page rather than a widget. It scrolls sideways at phone width and
 * never wraps.
 *
 * **A count is drawn only when there is something to count**, like the
 * console's bell. A badge reading `0` beside "Your entries" says the same as
 * the empty state one press away, twice, and a badge that is always lit stops
 * being read. It is left out entirely while the records are still being read,
 * so no number on this page is ever a guess.
 */
import { CoinsIcon, HistoryIcon, TicketIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { profileTabHref, profileTabs, type ProfileTab } from "../lib/profile-tab";

/** Here rather than in `profile-tab.ts`, which the route imports as a server component. */
const ICONS: Record<ProfileTab, LucideIcon> = {
  entries: TicketIcon,
  record: HistoryIcon,
  faucet: CoinsIcon,
};

export function ProfileTabs({
  current,
  testnet,
  counts,
}: {
  current: ProfileTab;
  testnet: boolean;
  counts?: Partial<Record<ProfileTab, number>>;
}) {
  return (
    <nav aria-label="Profile sections" className="overflow-x-auto overflow-y-hidden border-b border-n-200">
      <ul className="grid min-w-full grid-flow-col auto-cols-[minmax(max-content,1fr)] items-stretch">
        {profileTabs(testnet).map((tab) => {
          const on = tab.id === current;
          const Icon = ICONS[tab.id];
          const count = counts?.[tab.id];
          return (
            <li key={tab.id}>
              <Link
                href={profileTabHref(tab.id)}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={
                  on
                    ? "flex h-full items-center justify-center gap-2 px-3 py-3 text-base font-medium whitespace-nowrap text-ink shadow-[inset_0_-2px_0_var(--color-teal)]"
                    : "flex h-full items-center justify-center gap-2 px-3 py-3 text-base whitespace-nowrap text-n-500 transition-colors hover:text-ink"
                }
              >
                <Icon aria-hidden="true" className={on ? "size-4 text-teal" : "size-4 text-n-400"} />
                {tab.label}
                {/* An explicit space: JSX drops the whitespace between two
                    expressions, and with the badge touching the label a screen
                    reader announced the tab as "Your entries7". */}
                {count ? " " : null}
                {count ? (
                  <span
                    className={
                      on
                        ? "rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-600 tabular-nums"
                        : "rounded-full bg-n-100 px-2 py-0.5 text-xs font-medium text-n-600 tabular-nums"
                    }
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
