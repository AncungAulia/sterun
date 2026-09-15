"use client";

/**
 * Step 1: the distance, the race pack, and the add-ons (mockup block 1).
 *
 * ## Three cards, on purpose
 *
 * The race pack and the add-ons are separate cards (Ancung, from the mockup):
 * every runner gets a race pack, and a jersey among paid extras read like
 * something bought. The Add-ons card is absent when a distance sells nothing.
 *
 * ## Sold out stays visible
 *
 * A full distance, a sold-out size and a sold-out extra are all still drawn,
 * struck through or marked, and cannot be picked. Hiding them would make a
 * runner wonder whether the race ever had them.
 *
 * Sizes are a toggle group, one choice per item, which Radix exposes as radio
 * buttons: the same thing to a screen reader as the distance above, drawn as
 * the chips the mockup shows.
 */
import Image from "next/image";
import { PackageIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatPrice } from "@/utils/format";
import type { SterunCategory } from "@sterunxyz/sdk";

import type { Basket, Selection } from "../basket";

export function StepDistance({
  categories,
  categoryId,
  basket,
  selection,
  missingSizes,
  onCategory,
  onSelection,
}: {
  categories: SterunCategory[];
  categoryId: number;
  basket: Basket;
  /** Already sanitised against the basket. */
  selection: Selection;
  /** Sized items still without a size, shown once Continue was pressed. */
  missingSizes: string[];
  onCategory: (categoryId: number) => void;
  onSelection: (selection: Selection) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <StepCard id="entry-distance" title="Distance" hint="You can enter one distance in this race.">
        <RadioGroup
          value={String(categoryId)}
          onValueChange={(value) => onCategory(Number(value))}
          aria-labelledby="entry-distance-title"
          className="grid gap-3 sm:grid-cols-3"
        >
          {categories.map((category) => {
            const full = category.slotsLeft <= 0;
            const id = `distance-${category.categoryId}`;
            const km = (category.distanceM / 1000).toLocaleString("en-US");
            return (
              <Label
                key={category.categoryId}
                htmlFor={id}
                className={
                  full
                    ? "relative cursor-not-allowed flex-col items-start gap-1 rounded-md border border-n-200 bg-n-100 p-4 leading-normal text-n-400"
                    : "relative cursor-pointer flex-col items-start gap-1 rounded-md border border-n-300 bg-card p-4 leading-normal has-[[data-state=checked]]:border-teal-500 has-[[data-state=checked]]:bg-teal-50"
                }
              >
                <RadioGroupItem
                  id={id}
                  value={String(category.categoryId)}
                  disabled={full}
                  className="absolute top-3 right-3"
                />
                <span className="numeric heading-strong text-lg">{category.code}</span>
                <span className={full ? "numeric text-sm" : "numeric text-sm text-n-500"}>
                  {full ? `${km} km` : `${km} km · ${category.slotsLeft} of ${category.quota} left`}
                </span>
                {full ? (
                  <Badge variant="muted" className="mt-2">
                    Sold out
                  </Badge>
                ) : (
                  <span className="numeric mt-2 text-base font-medium text-ink">
                    {formatPrice(category.priceStroops)}
                  </span>
                )}
              </Label>
            );
          })}
        </RadioGroup>
      </StepCard>

      {basket.pack.length > 0 ? (
        <StepCard id="entry-race-pack" title="Race pack" hint="Comes with every entry.">
          <ul>
            {basket.pack.map((item) => {
              const chosen = selection.sizes[item.name];
              const missing = missingSizes.includes(item.name);
              return (
                <Row key={item.name} photoUrl={item.photoUrl}>
                  <p className="text-base font-medium text-ink">{item.name}</p>
                  {item.sized ? (
                    <>
                      <p className="text-sm text-n-500">Pick your size. The size chart is on the race page.</p>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        spacing={2}
                        value={chosen === undefined ? "" : String(chosen)}
                        onValueChange={(value) => {
                          // Pressing the chosen size again would clear it. A race
                          // pack item always needs one, so that press is ignored.
                          if (!value) return;
                          onSelection({
                            ...selection,
                            sizes: { ...selection.sizes, [item.name]: Number(value) },
                          });
                        }}
                        aria-label={`${item.name} size`}
                        aria-invalid={missing || undefined}
                        className="mt-3 flex-wrap"
                      >
                        {item.options.map((option) => (
                          <ToggleGroupItem
                            key={option.addonId}
                            value={String(option.addonId)}
                            disabled={option.soldOut}
                            className="min-w-11 data-[state=on]:border-teal-500 data-[state=on]:bg-teal-50 data-[state=on]:text-teal-700 disabled:bg-n-100 disabled:text-n-400 disabled:line-through disabled:opacity-100"
                          >
                            {option.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                      {missing ? (
                        <p role="alert" className="mt-2 text-sm text-danger">
                          Pick a size.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-n-500">Included</p>
                  )}
                </Row>
              );
            })}
          </ul>
        </StepCard>
      ) : null}

      {basket.extras.length > 0 ? (
        <StepCard id="entry-add-ons" title="Add-ons" hint="Optional extras, paid with your entry.">
          <ul>
            {basket.extras.map((extra) => {
              const id = `extra-${extra.addonId}`;
              const soldOut = extra.unitsLeft <= 0;
              return (
                <Row key={extra.addonId} photoUrl={extra.photoUrl}>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id={id}
                      checked={selection.extras.includes(extra.addonId)}
                      disabled={soldOut}
                      onCheckedChange={(checked) =>
                        onSelection({
                          ...selection,
                          extras:
                            checked === true
                              ? [...selection.extras, extra.addonId]
                              : selection.extras.filter((addonId) => addonId !== extra.addonId),
                        })
                      }
                    />
                    <Label htmlFor={id} className="text-base font-medium text-ink">
                      {extra.name}
                    </Label>
                    <span className="numeric ml-auto whitespace-nowrap text-base font-medium text-ink">
                      + {formatPrice(extra.priceStroops)}
                    </span>
                  </div>
                  <p className="numeric mt-1 ml-7 text-sm text-n-500">
                    {soldOut ? "Sold out" : `${extra.unitsLeft} left`}
                  </p>
                </Row>
              );
            })}
          </ul>
        </StepCard>
      ) : null}
    </div>
  );
}

/** A card named by its own heading, so it is a region a screen reader can jump to. */
function StepCard({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <Card id={id} role="region" aria-labelledby={`${id}-title`} className="gap-4 p-5">
      <div>
        <h2 id={`${id}-title`} className="heading-strong text-lg text-ink">
          {title}
        </h2>
        <p className="mt-1 text-sm text-n-500">{hint}</p>
      </div>
      {children}
    </Card>
  );
}

function Row({ photoUrl, children }: { photoUrl?: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 border-t border-n-100 py-4 first:border-t-0 first:pt-1 last:pb-0">
      {photoUrl ? (
        // Decorative: the item's name is the next thing read.
        <Image
          src={photoUrl}
          alt=""
          width={64}
          height={64}
          unoptimized
          className="size-16 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-16 shrink-0 place-items-center rounded-md bg-teal-50 text-teal-500"
        >
          <PackageIcon className="size-6" />
        </span>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
