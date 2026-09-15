/**
 * Step 1 as data: what a distance's runner gets, what they may buy, and what
 * `enter` is asked to reserve and charge for it.
 */
import { describe, expect, it } from "vitest";

import type { JoinedAddOn } from "@/lib/event/add-ons";
import {
  EMPTY_SELECTION,
  addonIdsFor,
  buildBasket,
  missingPackSizes,
  packChoices,
  sanitizeSelection,
  totalStroops,
} from "@/modules/entry/basket";
import type { SterunAddOn, SterunCategory } from "@sterunxyz/sdk";

function row(addonId: number, code: string, priceStroops: bigint, unitsLeft = 10): SterunAddOn {
  return {
    eventId: 0,
    addonId,
    code,
    priceStroops,
    quota: 10,
    reservedCount: 10 - unitsLeft,
    unitsLeft,
  };
}

const jersey: JoinedAddOn = {
  item: {
    name: "Event jersey",
    includedIn: ["10K"],
    sizes: [
      { label: "M", code: "EVENT_JERSEY_M" },
      { label: "L", code: "EVENT_JERSEY_L" },
    ],
  },
  rows: [row(0, "EVENT_JERSEY_M", 0n, 0), row(1, "EVENT_JERSEY_L", 0n)],
};
const medal: JoinedAddOn = {
  item: { name: "Finisher medal", includedIn: ["10K", "5K"], code: "MEDAL" },
  rows: [row(2, "MEDAL", 0n)],
};
const towel: JoinedAddOn = {
  item: { name: "Towel", includedIn: ["10K"], code: "TOWEL" },
  rows: [row(3, "TOWEL", 50_000_000n, 4)],
};
const soldOutCap: JoinedAddOn = {
  item: { name: "Cap", includedIn: ["10K"], code: "CAP" },
  rows: [row(4, "CAP", 30_000_000n, 0)],
};
const fiveKBottle: JoinedAddOn = {
  item: { name: "Bottle", includedIn: ["5K"], code: "BOTTLE" },
  rows: [row(5, "BOTTLE", 20_000_000n)],
};
const describedButNotOnChain: JoinedAddOn = {
  item: { name: "Ghost", includedIn: ["10K"], code: "GHOST" },
  rows: [],
};

const tenK: SterunCategory = {
  eventId: 0,
  categoryId: 1,
  code: "10K",
  distanceM: 10_000,
  quota: 100,
  enteredCount: 3,
  priceStroops: 250_000_000n,
  slotsLeft: 97,
};

describe("buildBasket", () => {
  const basket = buildBasket(
    [jersey, medal, towel, soldOutCap, fiveKBottle, describedButNotOnChain],
    "10K",
  );

  it("puts free items in the race pack and priced ones in add-ons", () => {
    expect(basket.pack.map((p) => p.name)).toEqual(["Event jersey", "Finisher medal"]);
    expect(basket.extras.map((e) => e.name)).toEqual(["Towel", "Cap"]);
  });

  it("keeps only what is offered to this distance", () => {
    expect(basket.extras.find((e) => e.name === "Bottle")).toBeUndefined();
  });

  it("drops an item the chain holds no row for, since there is nothing to reserve", () => {
    expect(basket.pack.find((p) => p.name === "Ghost")).toBeUndefined();
    expect(basket.extras.find((e) => e.name === "Ghost")).toBeUndefined();
  });

  it("marks a size with no units left as sold out", () => {
    expect(basket.pack[0]).toEqual({
      name: "Event jersey",
      sized: true,
      options: [
        { label: "M", addonId: 0, soldOut: true },
        { label: "L", addonId: 1, soldOut: false },
      ],
    });
  });

  it("gives an unsized item one option with no label", () => {
    expect(basket.pack[1]).toEqual({
      name: "Finisher medal",
      sized: false,
      options: [{ label: "", addonId: 2, soldOut: false }],
    });
  });

  it("carries an add-on's price and stock from chain", () => {
    expect(basket.extras[0]).toEqual({
      name: "Towel",
      addonId: 3,
      priceStroops: 50_000_000n,
      unitsLeft: 4,
    });
  });

  it("is empty for a race that offers nothing", () => {
    expect(buildBasket([], "10K")).toEqual({ pack: [], extras: [] });
  });
});

describe("missingPackSizes", () => {
  const basket = buildBasket([jersey, medal, towel], "10K");

  it("asks for every sized race pack item without a size", () => {
    expect(missingPackSizes(basket, EMPTY_SELECTION)).toEqual(["Event jersey"]);
  });

  it("is satisfied once a size is chosen", () => {
    expect(missingPackSizes(basket, { sizes: { "Event jersey": 1 }, extras: [] })).toEqual([]);
  });
});

describe("addonIdsFor", () => {
  const basket = buildBasket([jersey, medal, towel], "10K");

  it("reserves the chosen size, every unsized pack item and each chosen extra, in that order", () => {
    expect(addonIdsFor(basket, { sizes: { "Event jersey": 1 }, extras: [3] })).toEqual([1, 2, 3]);
  });

  it("reserves the unsized pack even when no extra is chosen", () => {
    expect(addonIdsFor(basket, { sizes: { "Event jersey": 1 }, extras: [] })).toEqual([1, 2]);
  });

  it("ignores an extra id that is not offered to this distance", () => {
    expect(addonIdsFor(basket, { sizes: { "Event jersey": 1 }, extras: [5] })).toEqual([1, 2]);
  });

  it("never lists an id twice", () => {
    const ids = addonIdsFor(basket, { sizes: { "Event jersey": 1 }, extras: [3, 3] });
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("totalStroops", () => {
  const basket = buildBasket([jersey, medal, towel], "10K");

  it("is the distance price plus the chosen extras", () => {
    expect(totalStroops(tenK, basket, { sizes: { "Event jersey": 1 }, extras: [3] })).toBe(
      300_000_000n,
    );
  });

  it("charges nothing for the race pack", () => {
    expect(totalStroops(tenK, basket, EMPTY_SELECTION)).toBe(250_000_000n);
  });

  it("is zero for a free distance with no extras", () => {
    expect(totalStroops({ ...tenK, priceStroops: 0n }, basket, EMPTY_SELECTION)).toBe(0n);
  });
});

describe("packChoices", () => {
  const basket = buildBasket([jersey, medal, towel], "10K");

  it("names each chosen size for the vault, and nothing for unsized items", () => {
    expect(packChoices(basket, { sizes: { "Event jersey": 1 }, extras: [] })).toEqual([
      { item: "Event jersey", choice: "L" },
    ]);
  });

  it("is empty before a size is chosen", () => {
    expect(packChoices(basket, EMPTY_SELECTION)).toEqual([]);
  });
});

describe("photos", () => {
  it("carries an item's photo from the document when it has one", () => {
    const withPhoto: JoinedAddOn = { ...medal, item: { ...medal.item, photoUrl: "https://x.test/medal.png" } };
    expect(buildBasket([withPhoto], "10K").pack[0].photoUrl).toBe("https://x.test/medal.png");
  });

  it("leaves the field out when there is none", () => {
    expect("photoUrl" in buildBasket([towel], "10K").extras[0]).toBe(false);
  });
});

describe("sanitizeSelection", () => {
  const basket = buildBasket([jersey, medal, towel, soldOutCap], "10K");

  it("keeps a choice that is still available", () => {
    const selection = { sizes: { "Event jersey": 1 }, extras: [3] };
    expect(sanitizeSelection(basket, selection)).toEqual(selection);
  });

  it("drops a size that sold out since it was chosen", () => {
    expect(sanitizeSelection(basket, { sizes: { "Event jersey": 0 }, extras: [] })).toEqual(EMPTY_SELECTION);
  });

  it("drops an extra that sold out, or that this distance does not offer", () => {
    expect(sanitizeSelection(basket, { sizes: {}, extras: [4, 5, 3] })).toEqual({ sizes: {}, extras: [3] });
  });

  it("drops a size id that matches no option, as a stale saved choice might", () => {
    expect(sanitizeSelection(basket, { sizes: { "Event jersey": 99, Ghost: 1 }, extras: [] })).toEqual(
      EMPTY_SELECTION,
    );
  });
});
