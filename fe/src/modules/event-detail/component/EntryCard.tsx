"use client";

/**
 * The decision, separated from the reading.
 *
 * Everything else on this page is a runner finding out what the race is. This
 * is the one card that answers the question they came with: can I enter, what
 * does it cost, is there room. It is all chain state, so it is the part of the
 * page that is as true as the ledger.
 *
 * ## Why the chips carry their own state
 *
 * "412 left" across three distances is a number that can be true and useless
 * at the same time: the 5K can be sold out while the 10K carries the total.
 * That is the common case, not the exotic one, so each distance says for
 * itself whether it is gone. The total stays because it is what somebody
 * skimming a card actually reads, but it is never the only thing shown.
 *
 * ## Why Enter does not pick a distance
 *
 * There is no such thing as entering "the event": a category is what
 * `reserve_slot` counts and what `enter` is given. So the button moves to the
 * distances rather than guessing one, and the real entry links live there,
 * one per distance, next to the price and the places left.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EventStatusBadge } from "@/components/elements/EventStatusBadge";
import { EXPLORER_BASE } from "@/lib/env";
import { formatPrice, shortAddress } from "@/utils/format";
import type { SterunCategory, SterunEvent } from "@sterun/sdk";

/** What the status means for entering, in the words a runner needs. */
const CLOSED_REASON: Record<string, string> = {
  Draft: "The organiser has not opened this race yet.",
  Closed: "Entries are closed. The race is still going ahead.",
  Completed: "This race has been run.",
  Cancelled: "This race has been cancelled.",
};

export function EntryCard({
  event,
  categories,
  onEnter,
}: {
  event: SterunEvent;
  categories: SterunCategory[];
  /**
   * Left out in the organiser's preview, which draws no Enter button at all.
   * A button there would be one the organiser presses to see what happens,
   * on a race that does not exist yet.
   */
  onEnter?: () => void;
}) {
  const open = event.status === "Open";
  const left = categories.reduce((sum, category) => sum + category.slotsLeft, 0);
  const prices = categories.filter((category) => category.slotsLeft > 0);
  const cheapest =
    prices.length > 0
      ? prices.reduce((low, category) =>
          category.priceStroops < low.priceStroops ? category : low,
        )
      : undefined;

  return (
    <Card className="h-full gap-5 p-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="heading-hero text-3xl text-ink">{event.name}</h1>
        <EventStatusBadge status={event.status} />
      </div>

      <p className="text-sm text-n-500">
        Organised by{" "}
        {EXPLORER_BASE ? (
          <a
            href={`${EXPLORER_BASE}/account/${event.organiser}`}
            target="_blank"
            rel="noreferrer"
            className="numeric text-teal-500 underline underline-offset-4"
          >
            {shortAddress(event.organiser, 4, 4)}
          </a>
        ) : (
          <span className="numeric">{shortAddress(event.organiser, 4, 4)}</span>
        )}
      </p>

      {categories.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <Badge
              key={category.categoryId}
              variant={category.slotsLeft > 0 ? "outline" : "muted"}
              data-full={category.slotsLeft > 0 ? undefined : true}
            >
              <span className="numeric">{category.code}</span>
              {category.slotsLeft > 0 ? null : <span className="text-n-500">sold out</span>}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm text-n-500">Entries</p>
          <p className="numeric heading-strong text-3xl text-ink">
            {left}
            <span className="text-base font-normal text-n-500"> left</span>
          </p>
        </div>
        {cheapest ? (
          <div>
            <p className="text-sm text-n-500">Starts from</p>
            <p className="numeric heading-strong text-2xl text-ink">
              {formatPrice(cheapest.priceStroops)}
            </p>
          </div>
        ) : null}
      </div>

      {/* `mt-auto`: the card is as tall as the poster beside it, and the one
          thing a runner is looking for should sit on the same line as the
          poster's bottom edge rather than floating in the middle of it. */}
      {open ? (
        onEnter ? (
          <div className="mt-auto">
            <Button onClick={onEnter} disabled={left <= 0}>
              {left > 0 ? "Enter this race" : "Every distance is full"}
            </Button>
          </div>
        ) : null
      ) : (
        /*
          A cancelled race is not a disabled button. It is the most important
          fact on the page, and the pair a runner must not confuse is Closed
          against Cancelled: one of them still has a race at the end of it.
        */
        <p
          role={event.status === "Cancelled" ? "alert" : undefined}
          className={
            event.status === "Cancelled"
              ? "mt-auto rounded-lg border border-danger-border bg-danger-surface px-4 py-3 text-base text-danger"
              : "mt-auto text-base text-n-600"
          }
        >
          {CLOSED_REASON[event.status] ?? "This race is not taking entries."}
        </p>
      )}
    </Card>
  );
}
