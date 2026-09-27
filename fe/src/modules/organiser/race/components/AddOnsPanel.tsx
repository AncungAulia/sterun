/**
 * One bar per add-on: reserved against quota.
 *
 * Generic on purpose. `AddOnData` knows a code, a quota and a count and
 * nothing about jerseys, so a tumbler and a medal are the same row, and the
 * code shows as the organiser typed it in the wizard.
 */
import type { SterunAddOn } from "@sterunxyz/sdk";

import { Badge } from "@/components/ui/badge";

export function AddOnsPanel({
  addOns,
  failed,
}: {
  addOns: readonly SterunAddOn[] | undefined;
  failed: boolean;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-n-200 bg-paper p-4">
      <h2 className="heading-strong mb-3 text-sm text-ink">Add-ons</h2>
      {failed ? (
        <p className="grid min-h-32 place-items-center text-sm text-n-500">
          Add-ons could not be loaded
        </p>
      ) : addOns === undefined ? (
        <div
          role="status"
          aria-label="Loading add-ons"
          className="h-32 skeleton rounded-md"
        />
      ) : addOns.length === 0 ? (
        <p className="grid min-h-32 place-items-center text-sm text-n-500">No add-ons</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {addOns.map((addOn) => {
            const soldOut = addOn.quota > 0 && addOn.reservedCount >= addOn.quota;
            // The one inline style: a width known only at runtime.
            const width =
              addOn.quota > 0
                ? `${Math.min(100, (addOn.reservedCount / addOn.quota) * 100)}%`
                : "0%";
            return (
              <li key={addOn.addonId}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
                    <span className="truncate">{addOn.code}</span>
                    {soldOut ? <Badge variant="warning">Sold out</Badge> : null}
                  </span>
                  <span className="numeric whitespace-nowrap text-n-600">
                    {addOn.reservedCount} / {addOn.quota}
                  </span>
                </div>
                <div aria-hidden className="h-2 overflow-hidden rounded-full">
                  <div
                    className={
                      soldOut ? "h-full rounded-full bg-warning" : "h-full rounded-full bg-teal"
                    }
                    style={{ width }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
