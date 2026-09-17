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
import { TrendingUpIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/feedback/EmptyState";
import { NonRefundableNotice } from "@/components/feedback/NonRefundableNotice";
import type { QuotaRaise } from "@/lib/event/quota-history";
import { formatEventDate, formatPrice } from "@/utils/format";
import type { SterunCategory } from "@sterunxyz/sdk";

export function TabCategories({
  categories,
  openForEntry,
  offerEntry = true,
  enteredCategoryId,
  raises,
}: {
  categories: SterunCategory[];
  openForEntry: boolean;
  /**
   * False in the organiser's review, where no Enter button is drawn. The
   * event has no id yet to link to, following one would throw away the wizard
   * the organiser is halfway through, and a dead button invites the press it
   * then ignores.
   */
  offerEntry?: boolean;
  /**
   * The distance the connected wallet already entered (STE-21). One entry per
   * race, so no distance offers a way in, and the refund notice goes with the
   * payment it warns about.
   */
  enteredCategoryId?: number;
  /**
   * When each distance's places were raised, oldest first (STE-57). From the
   * index, so optional: without it a card has no raised line and loses nothing
   * else. The places themselves always come from the chain.
   */
  raises?: ReadonlyMap<number, QuotaRaise[]>;
}) {
  if (categories.length === 0) {
    return (
      <EmptyState title="No distances yet">
        The organiser has not added any distances yet. The race may still be being set up.
      </EmptyState>
    );
  }

  const entered = enteredCategoryId !== undefined;
  const anyWayIn =
    openForEntry && !entered && categories.some((category) => category.slotsLeft > 0);

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
              {category.categoryId === enteredCategoryId ? (
                <Badge variant="success">Entered</Badge>
              ) : openForEntry && !full && offerEntry && !entered ? (
                <Link
                  href={`/events/${category.eventId}/enter?category=${category.categoryId}`}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-teal-500 px-4 text-base font-medium text-paper transition-colors hover:bg-teal-600 active:bg-teal-700"
                >
                  Enter {category.code}
                </Link>
              ) : null}
            </div>

            {raises?.get(category.categoryId)?.length ? (
              <>
                <Separator />
                <ul className="flex flex-col gap-1.5">
                  {raises.get(category.categoryId)!.map((raise) => (
                    <li
                      key={`${raise.at}-${raise.current}`}
                      className="numeric flex items-start gap-2 text-sm text-n-700"
                    >
                      <TrendingUpIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-teal-500" />
                      Entries raised from {raise.previous.toLocaleString("en-US")} to{" "}
                      {raise.current.toLocaleString("en-US")} on {formatEventDate(raise.at)}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
