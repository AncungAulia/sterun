/**
 * What this entry is and what it costs, beside every step (mockup block 1).
 *
 * Every race pack item reads "Included" and carries no price, because the
 * entry fee already paid for it. A zero on a jersey would read as a giveaway,
 * or as something still to be bought (the same rule as `TabAddOns`).
 *
 * Under the form on a phone, beside it from `lg`: `EntryFlow` places it.
 */
import { Card } from "@/components/ui/card";
import { formatEventDate, formatPrice } from "@/utils/format";
import type { SterunCategory, SterunEvent } from "@sterunxyz/sdk";

import type { Basket, Selection } from "../lib/basket";

export function EntrySummary({
  event,
  category,
  basket,
  selection,
  total,
}: {
  event: SterunEvent;
  category: SterunCategory;
  basket: Basket;
  /** Already sanitised: nothing here is sold out or not offered. */
  selection: Selection;
  total: bigint;
}) {
  const rows: { label: string; value: string }[] = [
    { label: `${category.code} entry`, value: formatPrice(category.priceStroops) },
  ];

  for (const item of basket.pack) {
    const size = item.sized
      ? item.options.find((option) => option.addonId === selection.sizes[item.name])?.label
      : undefined;
    rows.push({ label: size ? `${item.name}, ${size}` : item.name, value: "Included" });
  }

  for (const extra of basket.extras) {
    if (selection.extras.includes(extra.addonId)) {
      rows.push({ label: extra.name, value: formatPrice(extra.priceStroops) });
    }
  }

  return (
    <Card role="region" aria-labelledby="entry-summary-title" className="gap-0 p-5">
      <div className="border-b border-n-200 pb-4">
        <p className="text-base font-medium text-ink">{event.name}</p>
        <p className="numeric text-sm text-n-500">{formatEventDate(event.startsAt)}</p>
      </div>

      <h2 id="entry-summary-title" className="heading-strong mt-4 text-base text-ink">
        Your entry
      </h2>

      <dl className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-n-600">{row.label}</dt>
            <dd className="numeric font-medium text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-n-200 pt-3">
        <span className="text-sm text-n-600">Total</span>
        <span data-testid="entry-total" className="numeric text-2xl font-semibold text-ink">
          {formatPrice(total)}
        </span>
      </div>
    </Card>
  );
}
