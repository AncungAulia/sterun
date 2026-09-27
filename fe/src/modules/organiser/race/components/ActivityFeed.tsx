/**
 * The last few things that happened to this race's runners.
 *
 * Every icon is the same teal; the glyph carries the meaning. That leaves
 * amber free for a row that ever genuinely needs attention.
 */
import { CircleSlashIcon, FlagIcon, PackageCheckIcon, PlusIcon } from "lucide-react";

import { shortAddress } from "@/utils/format";

import { formatDuration, timeAgo, type ActivityItem } from "../lib/race";

const ICONS = {
  entered: PlusIcon,
  collected: PackageCheckIcon,
  finished: FlagIcon,
  dnf: CircleSlashIcon,
} as const;

function sentence(item: ActivityItem): string {
  switch (item.kind) {
    case "entered":
      return `entered the ${item.code}`;
    case "collected":
      return "collected their race pack";
    case "finished":
      return item.finishTimeS === null
        ? `finished the ${item.code} with no official time`
        : `finished the ${item.code} in ${formatDuration(item.finishTimeS)}`;
    case "dnf":
      return `did not finish the ${item.code}`;
  }
}

export function ActivityFeed({
  items,
  nowS,
  loading,
  failed,
}: {
  items: readonly ActivityItem[];
  nowS: bigint | undefined;
  /** Not answered yet. Kept apart from an empty list, which is a finding. */
  loading: boolean;
  failed: boolean;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-n-200 bg-paper p-4">
      <h2 className="heading-strong mb-3 text-sm text-ink">Activity</h2>
      {loading ? (
        <div
          role="status"
          aria-label="Loading activity"
          className="h-32 skeleton rounded-md"
        />
      ) : failed ? (
        <p className="grid min-h-32 place-items-center text-sm text-n-500">
          Activity could not be loaded
        </p>
      ) : items.length === 0 ? (
        <p className="grid min-h-32 place-items-center text-sm text-n-500">
          Nothing has happened yet
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => {
            const Icon = ICONS[item.kind];
            return (
              <li
                key={`${item.kind}-${item.tokenId}`}
                aria-label={`${shortAddress(item.runner, 4, 4)} ${sentence(item)}`}
                className="flex items-center gap-3 border-b border-n-100 py-2.5 last:border-b-0"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-teal-50 text-teal">
                  <Icon aria-hidden className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 text-sm text-n-600">
                  {/* The wallet, not the bib (Ancung, 2026-09-17): an organiser
                      watching entries arrive is watching people join, and a bib
                      is only a number this page assigned them a second ago. */}
                  <b className="numeric font-medium text-ink">{shortAddress(item.runner, 4, 4)}</b>{" "}
                  {sentence(item)}
                </span>
                {nowS === undefined ? null : (
                  <span className="shrink-0 text-xs whitespace-nowrap text-n-500">
                    {timeAgo(item.at, nowS)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
