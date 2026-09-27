/**
 * A race's add-ons, joined from the two places they live.
 *
 * The document describes an item (name, photo, sizes, the distances it comes
 * with); the chain holds what decides anything (its price and the units left).
 * They are joined by code, and the chain wins where they disagree. An item the
 * document describes but the chain does not hold keeps an empty `rows`, so an
 * event from before add-ons were on chain still shows its race pack.
 *
 * Shared by the race page's add-ons tab and the entry flow's basket.
 */
import type { MetadataAddOn } from "@/lib/event/metadata";
import type { SterunAddOn } from "@sterunxyz/sdk";

/** One item as the page shows it: the description, joined to its chain rows. */
export interface JoinedAddOn {
  item: MetadataAddOn;
  /** Every row on chain this item covers. One per size, or one in total. */
  rows: SterunAddOn[];
}

export function joinAddOns(items: MetadataAddOn[], onChain: SterunAddOn[]): JoinedAddOn[] {
  const byCode = new Map(onChain.map((row) => [row.code, row]));

  return items.map((item) => {
    const codes = item.sizes?.length
      ? item.sizes.map((size) => size.code)
      : [item.code];
    const rows = codes
      .map((code) => (code ? byCode.get(code) : undefined))
      .filter((row): row is SterunAddOn => row !== undefined);
    return { item, rows };
  });
}
