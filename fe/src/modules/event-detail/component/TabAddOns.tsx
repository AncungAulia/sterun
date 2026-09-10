"use client";

/**
 * What a runner gets, and what they can buy.
 *
 * Two halves from two places, joined by a code. The document holds everything
 * the contract has no field for and everything a person actually looks at: the
 * photo, the measurements, the distances it is offered to. The chain holds the
 * two numbers that decide anything: what it costs, and how many are left.
 *
 * They are joined rather than merged, and the chain wins where they disagree,
 * because the document is a claim from the day the race was published and the
 * stock is a fact from this ledger.
 *
 * An item the document describes but the chain does not hold is still shown,
 * without a price: an event created before add-ons existed on chain has a race
 * pack, and refusing to draw it would lose the only description of it there is.
 */
import { useState } from "react";
import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatPrice } from "@/utils/format";
import type { MetadataAddOn } from "@/lib/metadata";
import type { SterunAddOn } from "@sterun/sdk";

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

/** The price to lead with. Sizes of one item are priced the same. */
function priceOf(joined: JoinedAddOn): bigint | undefined {
  return joined.rows[0]?.priceStroops;
}

/**
 * What the card says the item costs.
 *
 * A zero price is not "Free". On a distance it is, because a free distance
 * really costs nothing. On an add-on it means the entry fee already paid for
 * it, and "Free" next to a jersey reads as a giveaway nobody has to enter the
 * race to get, or as something a runner still has to go and claim.
 */
function priceLabel(price: bigint): string {
  return price === 0n ? "Included" : formatPrice(price);
}

function unitsLeft(joined: JoinedAddOn): number {
  return joined.rows.reduce((sum, row) => sum + row.unitsLeft, 0);
}

export function TabAddOns({
  items,
  onChain,
}: {
  items: MetadataAddOn[];
  onChain: SterunAddOn[];
}) {
  const joined = joinAddOns(items, onChain);

  if (joined.length === 0) {
    return (
      <p className="text-base text-n-600">
        This race has not published a race pack. That is normal: plenty of races hand out a bib and
        nothing else.
      </p>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {joined.map((entry) => (
        <AddOnCard key={entry.item.name} joined={entry} />
      ))}
    </div>
  );
}

function AddOnCard({ joined }: { joined: JoinedAddOn }) {
  const price = priceOf(joined);
  const left = unitsLeft(joined);
  const soldOut = joined.rows.length > 0 && left <= 0;

  return (
    <Card className="gap-3 p-4">
      {joined.item.photoUrl ? (
        <Image
          src={joined.item.photoUrl}
          alt=""
          width={600}
          height={600}
          unoptimized
          className="h-40 w-full rounded-md border border-n-200 object-contain"
        />
      ) : (
        <div className="h-40 w-full rounded-md border border-dashed border-n-300" />
      )}

      <div>
        <p className="text-base text-foreground">{joined.item.name}</p>
        {price === undefined ? (
          <p className="text-sm text-muted-foreground">Part of the race pack</p>
        ) : (
          <p className="numeric text-lg text-ink">{priceLabel(price)}</p>
        )}
      </div>

      {soldOut ? <Badge variant="muted">Sold out</Badge> : null}

      <AddOnDialog joined={joined} />
    </Card>
  );
}

function AddOnDialog({ joined }: { joined: JoinedAddOn }) {
  const [open, setOpen] = useState(false);
  const sizes = joined.item.sizes ?? [];
  const byCode = new Map(joined.rows.map((row) => [row.code, row]));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          View details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{joined.item.name}</DialogTitle>
          <DialogDescription>
            {priceOf(joined) === undefined
              ? "Part of the race pack for the distances below."
              : priceOf(joined) === 0n
                ? "Included with your entry for the distances below."
                : `${formatPrice(priceOf(joined)!)}, bought with your entry.`}
          </DialogDescription>
        </DialogHeader>

        {joined.item.photoUrl ? (
          <Image
            src={joined.item.photoUrl}
            alt=""
            width={800}
            height={600}
            unoptimized
            className="max-h-64 w-full rounded-md border border-n-200 object-contain"
          />
        ) : null}

        <div>
          <p className="text-sm text-n-500">Available for</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {joined.item.includedIn.map((code) => (
              <Badge key={code} variant="outline">
                <span className="numeric">{code}</span>
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm text-n-500">Size chart</p>
          {sizes.length === 0 ? (
            /* Said plainly rather than left blank. A tumbler has no chart, and
               an empty table reads as a page that failed to load. */
            <p className="mt-2 text-base text-n-600">
              No sizes to pick. This one comes as it comes.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-n-500">
                  <tr>
                    <th className="py-1 pr-4 font-normal">Size</th>
                    <th className="py-1 pr-4 font-normal">Chest (cm)</th>
                    <th className="py-1 pr-4 font-normal">Length (cm)</th>
                    <th className="py-1 font-normal">Left</th>
                  </tr>
                </thead>
                <tbody className="numeric text-foreground">
                  {sizes.map((size) => {
                    const row = size.code ? byCode.get(size.code) : undefined;
                    return (
                      <tr key={size.label} className="border-t border-n-200">
                        <td className="py-1.5 pr-4">{size.label}</td>
                        <td className="py-1.5 pr-4">{size.chestCm ?? "\u2014"}</td>
                        <td className="py-1.5 pr-4">{size.lengthCm ?? "\u2014"}</td>
                        <td className="py-1.5">
                          {row === undefined ? (
                            "\u2014"
                          ) : row.unitsLeft > 0 ? (
                            row.unitsLeft
                          ) : (
                            <span className="text-n-500">sold out</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
