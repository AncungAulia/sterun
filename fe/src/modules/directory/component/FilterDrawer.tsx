"use client";

/**
 * The directory's filters, in a drawer.
 *
 * Changes are staged: nothing moves on the page while options are being
 * ticked, and the button at the bottom says how many races the current choice
 * leaves before it is applied. Closing any other way throws the choice away,
 * so a drawer dismissed by accident never changes what is listed.
 *
 * It slides in from the right on a wide screen and up from the bottom on a
 * phone, where a side panel would cover the whole screen anyway. Location is
 * not offered here: the place is chosen in the page header.
 */
import { SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/useMediaQuery";

import type { DateOrder, DirectoryEntry } from "../browse";
import {
  AVAILABLE_ONLY_LABEL,
  DISTANCE_BUCKETS,
  NO_FILTERS,
  PRICE_BUCKETS,
  activeFilterCount,
  matchesFilters,
  type Filters,
} from "../filters";

const ORDERS: { value: DateOrder; label: string }[] = [
  { value: "soonest", label: "Nearest date first" },
  { value: "latest", label: "Furthest date first" },
];

interface FilterDrawerProps {
  /** The races the search left. The live count is taken from these. */
  entries: readonly DirectoryEntry[];
  filters: Filters;
  order: DateOrder;
  onApply: (filters: Filters, order: DateOrder) => void;
}

function toggle<T>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? [...list, value] : list.filter((item) => item !== value);
}

export function FilterDrawer({ entries, filters, order, onApply }: FilterDrawerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const [draftOrder, setDraftOrder] = useState(order);
  const wide = useMediaQuery("(min-width: 640px)");

  const applied = activeFilterCount(filters);
  const count = entries.filter((item) => matchesFilters(item, draft)).length;

  function onOpenChange(next: boolean) {
    // Every opening starts from what is applied, never from a choice abandoned last time.
    if (next) {
      setDraft(filters);
      setDraftOrder(order);
    }
    setOpen(next);
  }

  function apply() {
    onApply(draft, draftOrder);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" aria-label={applied > 0 ? `Filters, ${applied} applied` : "Filters"}>
          <SlidersHorizontalIcon aria-hidden />
          <span className="hidden sm:inline">Filters</span>
          {applied > 0 ? (
            <span aria-hidden className="numeric rounded-sm bg-teal-50 px-1.5 text-xs text-teal-700">
              {applied}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>

      {/*
        No description: the title and the options say what the drawer is for.
        aria-describedby is set to undefined, as on every dialog here without
        one, so the drawer never points a screen reader at text that is not
        there. The bottom sheet is capped in dvh, not vh, because a
        phone measures vh with its toolbar hidden, which pushes the footer
        buttons under the toolbar while it is showing.
      */}
      <SheetContent
        side={wide ? "right" : "bottom"}
        aria-describedby={undefined}
        className={wide ? "w-full sm:max-w-sm" : "max-h-[85dvh] rounded-t-xl"}
      >
        <SheetHeader>
          <SheetTitle className="heading-strong text-xl text-ink">Filter races</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-2">
          <fieldset className="flex flex-col gap-3">
            {/* The legend names the group, so the radio group carries no label of its own. */}
            <legend className="heading mb-3 text-base text-ink">Sort by</legend>
            <RadioGroup value={draftOrder} onValueChange={(value) => setDraftOrder(value as DateOrder)}>
              {ORDERS.map((option) => (
                <div key={option.value} className="flex items-center gap-3">
                  <RadioGroupItem id={`filter-order-${option.value}`} value={option.value} />
                  <Label htmlFor={`filter-order-${option.value}`}>{option.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="heading mb-3 text-base text-ink">Price</legend>
            {PRICE_BUCKETS.map((bucket) => (
              <div key={bucket.id} className="flex items-center gap-3">
                <Checkbox
                  id={`filter-price-${bucket.id}`}
                  checked={draft.prices.includes(bucket.id)}
                  onCheckedChange={(checked) =>
                    setDraft({ ...draft, prices: toggle(draft.prices, bucket.id, checked === true) })
                  }
                />
                <Label htmlFor={`filter-price-${bucket.id}`}>{bucket.label}</Label>
              </div>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="heading mb-3 text-base text-ink">Distance</legend>
            {DISTANCE_BUCKETS.map((bucket) => (
              <div key={bucket.id} className="flex items-center gap-3">
                <Checkbox
                  id={`filter-distance-${bucket.id}`}
                  checked={draft.distances.includes(bucket.id)}
                  onCheckedChange={(checked) =>
                    setDraft({ ...draft, distances: toggle(draft.distances, bucket.id, checked === true) })
                  }
                />
                <Label htmlFor={`filter-distance-${bucket.id}`}>{bucket.label}</Label>
              </div>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="heading mb-3 text-base text-ink">Availability</legend>
            <div className="flex items-center gap-3">
              <Checkbox
                id="filter-available-only"
                checked={draft.availableOnly}
                onCheckedChange={(checked) => setDraft({ ...draft, availableOnly: checked === true })}
              />
              <Label htmlFor="filter-available-only">{AVAILABLE_ONLY_LABEL}</Label>
            </div>
          </fieldset>
        </div>

        <SheetFooter className="flex-row justify-between gap-3 border-t border-n-200">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(NO_FILTERS);
              setDraftOrder("soonest");
            }}
          >
            Clear all
          </Button>
          <Button onClick={apply}>{`Show ${count} ${count === 1 ? "race" : "races"}`}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
