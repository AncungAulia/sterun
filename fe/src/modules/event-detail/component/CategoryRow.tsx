/**
 * One distance category: the unit a runner actually enters.
 *
 * The remaining quota is the only scarcity the contract truly enforces
 * (`reserve_slot` checks and increments in a single invocation and reverts
 * QuotaFull(5)), which makes it the one number on this page that is worth
 * trusting completely. It gets said in full, "120 of 300 left", rather than as
 * a bar nobody can read a number off.
 *
 * A full category shows no entry link. The link would build a transaction that
 * reverts, costing a runner a wallet prompt to be told no.
 */
import Link from "next/link";

import { Badge } from "@/components/elements/Badge";
import { formatPrice } from "@/utils/format";
import type { SterunCategory } from "@sterunxyz/sdk";

interface CategoryRowProps {
  category: SterunCategory;
  /** Entry is only ever offered while the event itself is Open. */
  openForEntry: boolean;
}

export function CategoryRow({ category, openForEntry }: CategoryRowProps) {
  const full = category.slotsLeft <= 0;

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 border-b border-n-200 py-4 last:border-b-0">
      <div>
        <p className="numeric heading-strong text-lg text-ink">{category.code}</p>
        <p className="numeric mt-1 text-sm text-n-500">
          {(category.distanceM / 1000).toLocaleString("en-US")} km
        </p>
      </div>

      <div className="text-right">
        <p className="numeric text-base text-ink">{formatPrice(category.priceStroops)}</p>
        <p className="numeric mt-1 text-sm text-n-500">
          {category.slotsLeft} of {category.quota} left
        </p>
      </div>

      {openForEntry && !full ? (
        <Link
          href={`/events/${category.eventId}/enter?category=${category.categoryId}`}
          className="inline-flex h-10 items-center justify-center rounded-md bg-teal-500 px-4 text-base font-medium text-paper transition-colors hover:bg-teal-600 active:bg-teal-700"
        >
          Enter {category.code}
        </Link>
      ) : full ? (
        // Only said when it is the category that is closed. An event that is
        // not open says so once, above the list, rather than on every row.
        <Badge tone="muted">Full</Badge>
      ) : null}
    </li>
  );
}
