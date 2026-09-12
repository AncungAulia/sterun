import { describe, expect, it } from "vitest";

import {
  EMPTY_ADD_ON,
  addOnCode,
  addOnProblem,
  addOnUnits,
  duplicateAddOnCode,
  type PlannedAddOn,
} from "@/modules/organiser/addons";

const jersey = (patch: Partial<PlannedAddOn> = {}): PlannedAddOn => ({
  ...EMPTY_ADD_ON,
  name: "Event jersey",
  includedIn: ["10K"],
  sized: true,
  sizes: [
    { label: "S", chest: "48", length: "68", stock: "50" },
    { label: "M", chest: "52", length: "70", stock: "120" },
  ],
  ...patch,
});

const tumbler = (patch: Partial<PlannedAddOn> = {}): PlannedAddOn => ({
  ...EMPTY_ADD_ON,
  name: "Tumbler",
  includedIn: ["5K", "10K"],
  stock: "500",
  ...patch,
});

describe("addOnCode", () => {
  it("makes a Symbol out of whatever the organiser typed", () => {
    expect(addOnCode("Event jersey")).toBe("EVENT_JERSEY");
    expect(addOnCode("Soft flask 500ml")).toBe("SOFT_FLASK_500ML");
    expect(addOnCode("  Cap  ")).toBe("CAP");
  });

  it("appends the size, because a size is its own add-on", () => {
    expect(addOnCode("Event jersey", "M")).toBe("EVENT_JERSEY_M");
    expect(addOnCode("Finisher tee", "XXL")).toBe("FINISHER_TEE_XXL");
  });

  it("keeps inside a Symbol, and never ends on the separator", () => {
    // Soroban takes at most 32 characters, and a code ending in `_` is a code
    // that got cut mid-word.
    const long = addOnCode("Presented by Bank Jateng running jersey", "XL");
    expect(long.length).toBeLessThanOrEqual(32);
    expect(long.endsWith("_")).toBe(false);
    expect(/^[A-Z0-9_]+$/.test(long)).toBe(true);
  });
});

describe("addOnUnits", () => {
  describe("positive", () => {
    it("turns each named size into its own row, with its own stock", () => {
      expect(addOnUnits([jersey()])).toEqual([
        { code: "EVENT_JERSEY_S", label: "Event jersey S", price: "0", stock: "50" },
        { code: "EVENT_JERSEY_M", label: "Event jersey M", price: "0", stock: "120" },
      ]);
    });

    it("leaves an item with no sizes as one row", () => {
      expect(addOnUnits([tumbler()])).toEqual([
        { code: "TUMBLER", label: "Tumbler", price: "0", stock: "500" },
      ]);
    });

    it("carries the price only for something sold on top", () => {
      const paid = addOnUnits([tumbler({ kind: "extra", price: "20" })]);
      expect(paid[0]!.price).toBe("20");

      // Included items are free on chain, whatever is left in the price field.
      const free = addOnUnits([tumbler({ kind: "included", price: "20" })]);
      expect(free[0]!.price).toBe("0");
    });
  });

  describe("edge", () => {
    it("ignores an item with no name at all", () => {
      expect(addOnUnits([{ ...EMPTY_ADD_ON }])).toEqual([]);
    });

    it("ignores a size row nobody labelled", () => {
      const rows = addOnUnits([
        jersey({ sizes: [{ label: "", chest: "", length: "", stock: "10" }] }),
      ]);
      expect(rows).toEqual([]);
    });
  });
});

describe("addOnProblem", () => {
  describe("negative", () => {
    it("refuses a size with no stock, because the contract refuses a zero quota", () => {
      const problem = addOnProblem(
        jersey({ sizes: [{ label: "M", chest: "", length: "", stock: "" }] }),
      );
      expect(problem).toMatch(/how many of each size/i);
    });

    it("refuses stock of zero on an item without sizes", () => {
      expect(addOnProblem(tumbler({ stock: "0" }))).toMatch(/at least 1/i);
      expect(addOnProblem(tumbler({ stock: "12.5" }))).toMatch(/at least 1/i);
    });

    it("refuses something sold on top with no price", () => {
      expect(addOnProblem(tumbler({ kind: "extra", price: "" }))).toMatch(/give this a price/i);
      expect(addOnProblem(tumbler({ kind: "extra", price: "0" }))).toMatch(/give this a price/i);
    });

    it("still refuses an item offered to no distance", () => {
      expect(addOnProblem(tumbler({ includedIn: [] }))).toMatch(/at least one distance/i);
    });
  });

  describe("positive", () => {
    it("passes a sized item with stock on every size", () => {
      expect(addOnProblem(jersey())).toBeNull();
    });

    it("passes an included item with no price at all", () => {
      // The price field is not even shown for these, so it stays empty.
      expect(addOnProblem(tumbler({ price: "" }))).toBeNull();
    });
  });
});

describe("duplicateAddOnCode", () => {
  it("catches two items that would land under one code", () => {
    // "Event jersey" and "event-jersey" are the same Symbol, and the second
    // would read as more stock of the first for ever.
    expect(duplicateAddOnCode([tumbler(), tumbler({ name: "tumbler" })])).toBe("TUMBLER");
  });

  it("says nothing about items that are genuinely different", () => {
    expect(duplicateAddOnCode([jersey(), tumbler()])).toBeNull();
  });

  it("catches a collision between two sizes of different items", () => {
    const a = jersey({ name: "Tee", sizes: [{ label: "M", chest: "", length: "", stock: "1" }] });
    const b = jersey({ name: "Tee M", sized: false, sizes: [] , stock: "1" });
    expect(duplicateAddOnCode([a, b])).toBe("TEE_M");
  });
});
