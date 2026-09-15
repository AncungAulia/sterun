/**
 * What a runner gets and what they may buy, for one distance.
 *
 * ## Split by price, and only by price
 *
 * The race pack and the add-ons are the same thing on chain: both are add-ons,
 * and a free one is how a race bounds how many jerseys exist. They are shown
 * as two cards because every runner gets a race pack, and a jersey sitting
 * among paid extras read like something bought (Ancung, from the mockup).
 *
 * ## Every race pack unit is still reserved
 *
 * `enter` takes the add-on ids and reserves one unit of each, atomically with
 * the place and the payment. So a free size that has run out cannot be picked:
 * `enter` would refuse the whole entry for it, and the runner would see a
 * failure about a shirt they were never charged for.
 *
 * Pure, with no React, so step 1, the summary, the pay step and the attempt
 * all read the same answer.
 */
import type { JoinedAddOn } from "@/modules/event-detail/component/TabAddOns";
import type { SterunCategory } from "@sterunxyz/sdk";

export interface PackOption {
  /** The size label, or empty for an item with no sizes. */
  label: string;
  addonId: number;
  soldOut: boolean;
}

export interface PackItem {
  name: string;
  sized: boolean;
  options: PackOption[];
}

export interface ExtraItem {
  name: string;
  addonId: number;
  priceStroops: bigint;
  unitsLeft: number;
}

export interface Basket {
  pack: PackItem[];
  extras: ExtraItem[];
}

export interface Selection {
  /** Race pack item name to the chosen size's add-on id. */
  sizes: Record<string, number>;
  /** Chosen extras, by add-on id. */
  extras: number[];
}

export const EMPTY_SELECTION: Selection = { sizes: {}, extras: [] };

export function buildBasket(joined: JoinedAddOn[], categoryCode: string): Basket {
  const pack: PackItem[] = [];
  const extras: ExtraItem[] = [];

  for (const { item, rows } of joined) {
    if (!item.includedIn.includes(categoryCode)) continue;
    // Described in the document but absent on chain: there is nothing to
    // reserve and no price to charge, so it cannot be part of an entry.
    if (rows.length === 0) continue;

    // Sizes of one item are priced the same (TabAddOns relies on this too).
    const price = rows[0].priceStroops;

    if (price === 0n) {
      const sized = Boolean(item.sizes?.length);
      pack.push({
        name: item.name,
        sized,
        options: rows.map((row) => ({
          label: sized
            ? (item.sizes?.find((size) => size.code === row.code)?.label ?? row.code)
            : "",
          addonId: row.addonId,
          soldOut: row.unitsLeft === 0,
        })),
      });
    } else {
      // A paid item is offered unsized: a size picker inside a checkbox is a
      // shape no race has asked for yet. Its first row is the one sold.
      const first = rows[0];
      extras.push({
        name: item.name,
        addonId: first.addonId,
        priceStroops: price,
        unitsLeft: first.unitsLeft,
      });
    }
  }

  return { pack, extras };
}

/** Sized race pack items still waiting for a size, by name. */
export function missingPackSizes(basket: Basket, selection: Selection): string[] {
  return basket.pack
    .filter((item) => item.sized && selection.sizes[item.name] === undefined)
    .map((item) => item.name);
}

/**
 * The ids `enter` reserves: each race pack item (the chosen size, or its only
 * row), then each chosen extra that this distance actually offers.
 *
 * Walks the basket rather than the selection, so an id this distance does not
 * offer, or one listed twice, can never reach the contract, which refuses both
 * (`DuplicateAddOn`, and a quota row the runner never saw).
 */
export function addonIdsFor(basket: Basket, selection: Selection): number[] {
  const ids: number[] = [];
  for (const item of basket.pack) {
    const id = item.sized ? selection.sizes[item.name] : item.options[0]?.addonId;
    if (id !== undefined) ids.push(id);
  }
  for (const extra of basket.extras) {
    if (selection.extras.includes(extra.addonId)) ids.push(extra.addonId);
  }
  return ids;
}

/** What `enter` charges: the distance plus the chosen extras. The race pack is free. */
export function totalStroops(category: SterunCategory, basket: Basket, selection: Selection): bigint {
  return basket.extras
    .filter((extra) => selection.extras.includes(extra.addonId))
    .reduce((sum, extra) => sum + extra.priceStroops, category.priceStroops);
}

/**
 * The chosen sizes, in the vault's `add_ons` shape: `{ item, choice }` keyed by
 * the item name in the event document (be/CLAUDE.md, race pack choices). This
 * is what the organiser counts shirts from.
 */
export function packChoices(
  basket: Basket,
  selection: Selection,
): { item: string; choice: string }[] {
  return basket.pack.flatMap((item) => {
    if (!item.sized) return [];
    const option = item.options.find((o) => o.addonId === selection.sizes[item.name]);
    return option ? [{ item: item.name, choice: option.label }] : [];
  });
}
