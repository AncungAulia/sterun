/**
 * The distances, which is what a runner actually enters.
 *
 * One card each rather than a table row, because the decision is made per
 * distance and the three things it turns on are the price, the places left and
 * whether there is a way in. A full distance shows no link at all: the link
 * would build a transaction that reverts `QuotaFull(5)`, costing a wallet
 * prompt to be told no.
 *
 * The refund notice lives here rather than in the entry card above, because
 * this is where the links that actually take money are. "Enter this race" up
 * there only moves to this tab. And it appears only when at least one distance
 * can be entered: on a cancelled or sold out race there is no payment to warn
 * about, and a warning shown where it does not apply is how warnings stop
 * being read.
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/elements/EmptyState";
import { NonRefundableNotice } from "@/components/elements/NonRefundableNotice";
import { formatPrice } from "@/utils/format";
import type { SterunCategory } from "@sterun/sdk";

export function TabCategories({
  categories,
  openForEntry,
}: {
  categories: SterunCategory[];
  openForEntry: boolean;
}) {
  if (categories.length === 0) {
    return (
      <EmptyState title="No distances yet">
        The organiser has created this race but has not added a distance to it. They are added one
        at a time, so this may be a race still being set up.
      </EmptyState>
    );
  }

  const anyWayIn = openForEntry && categories.some((category) => category.slotsLeft > 0);

  return (
    <div className="flex flex-col gap-4">
      {anyWayIn ? <NonRefundableNotice /> : null}

      {categories.map((category) => {
        const full = category.slotsLeft <= 0;
        return (
          <Card key={category.categoryId} className="gap-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="numeric heading-strong text-lg text-ink">{category.code}</p>
                <p className="numeric mt-1 text-sm text-n-500">
                  {(category.distanceM / 1000).toLocaleString("en-US")} km
                </p>
              </div>
              {full ? (
                <Badge variant="muted">Sold out</Badge>
              ) : (
                <p className="numeric text-sm text-n-500">
                  {category.slotsLeft} of {category.quota} entries left
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="numeric heading-strong text-2xl text-ink">
                {formatPrice(category.priceStroops)}
              </p>
              {openForEntry && !full ? (
                <Link
                  href={`/events/${category.eventId}/enter?category=${category.categoryId}`}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-teal-500 px-4 text-base font-medium text-paper transition-colors hover:bg-teal-600 active:bg-teal-700"
                >
                  Enter {category.code}
                </Link>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
