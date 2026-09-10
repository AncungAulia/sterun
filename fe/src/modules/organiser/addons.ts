/**
 * The add-on model, and the rules that turn it into rows on chain.
 *
 * Pure on purpose, and in its own file for a reason that bit once already:
 * `run.ts` needs `addOnUnits` to plan the signatures, and importing it from
 * the step pulled a client component, a file picker and a wallet SDK into a
 * module that only wanted to count jerseys.
 */
/** One row of a size chart, in centimetres as the organiser typed them. */
export interface AddOnSize {
  /** "S", "M", "XXL". Free text, because vendors label their own way. */
  label: string;
  chest: string;
  length: string;
  /**
   * How many of this size exist.
   *
   * Per size rather than per item, because that is the only way "M is sold
   * out" can be true. The contract holds one quota per add-on, so a size *is*
   * an add-on: `EVENT_JERSEY_M` is its own row on chain with its own stock,
   * which is how every registration platform models it and how Indonesian
   * races already behave, dropping a sold-out size out of the picker.
   */
  stock: string;
}

export interface PlannedAddOn {
  name: string;
  /** A url from the file store, or empty. */
  photoUrl: string;
  /** Whether runners have to pick a size. A tumbler does not. */
  sized: boolean;
  sizes: AddOnSize[];
  /**
   * Distance codes this is offered to.
   *
   * A claim in the document, not a rule: `AddOnData` has no link to a
   * category, so the contract will let a 5K entry buy something meant for the
   * 10K. Enforcing it would need the contract to know, and it does not.
   */
  includedIn: string[];
  /**
   * Whether it comes with the ticket or is bought on top.
   *
   * Both end up on chain, and the only difference there is the price: a free
   * add-on is legal precisely so a race can hand something out and still cap
   * how many it hands out. The split is here because it is how an organiser
   * thinks about the two, and how every platform presents them.
   */
  kind: "included" | "extra";
  /** Price in sUSD as typed. Ignored, and forced to zero, when included. */
  price: string;
  /** Units, for something without sizes. Sized items carry stock per size. */
  stock: string;
}

export const EMPTY_ADD_ON: PlannedAddOn = {
  name: "",
  photoUrl: "",
  sized: false,
  sizes: [],
  includedIn: [],
  kind: "included",
  price: "",
  stock: "",
};

/**
 * What Indonesian races actually hand out, so the list is a shortcut rather
 * than a guess: jersey, bib, medal and a goodie bag are the standard pack, and
 * premium packs add a cap, a soft flask, a running belt, socks and a drawstring
 * bag. The international registration platforms sell much the same list, plus
 * parking and transport.
 *
 * The bib is deliberately absent: everybody gets one, it is not a choice, and a
 * row for it would only be noise. The field takes free text anyway, so this
 * list never has to be complete.
 */
export const ADD_ON_PRESETS: { name: string; sized: boolean }[] = [
  { name: "Event jersey", sized: true },
  { name: "Finisher tee", sized: true },
  { name: "Jacket", sized: true },
  { name: "Socks", sized: true },
  { name: "Cap", sized: false },
  { name: "Tumbler", sized: false },
  { name: "Soft flask", sized: false },
  { name: "Running belt", sized: false },
  { name: "Drawstring bag", sized: false },
  { name: "Goodie bag", sized: false },
  { name: "Finisher medal", sized: false },
  { name: "Printed certificate", sized: false },
  { name: "Parking pass", sized: false },
  { name: "Shuttle bus seat", sized: false },
];

/** The sizes a race orders by default. A starting point, all of it editable. */
export const DEFAULT_SIZES = ["S", "M", "L", "XL"];

/**
 * The Soroban `Symbol` an item is known by on chain.
 *
 * Derived rather than typed. A code is not a decision an organiser wants to
 * make thirteen times, and the two rules it has to obey are mechanical:
 * `Symbol` takes letters, digits and underscore, and at most 32 characters.
 * A size appends its own suffix, because a size is its own add-on.
 */
export function addOnCode(name: string, size?: string): string {
  const clean = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const base = clean(name);
  const suffix = size ? clean(size) : "";
  const joined = suffix ? `${base}_${suffix}` : base;
  return joined.slice(0, 32).replace(/_+$/, "");
}

/** One row as the contract holds it: a code, a price and a stock. */
export interface PlannedAddOnUnit {
  code: string;
  /** The label a runner picks, or the item name when it has no sizes. */
  label: string;
  price: string;
  stock: string;
}

/**
 * The add-ons as the chain will hold them, which is not one per item.
 *
 * A sized item becomes one row per named size, because the contract keeps one
 * quota per add-on and stock has to be per size to mean anything. An item with
 * no sizes stays a single row.
 */
export function addOnUnits(addOns: PlannedAddOn[]): PlannedAddOnUnit[] {
  return addOns.flatMap((addOn) => {
    const name = addOn.name.trim();
    if (!name) return [];
    const price = addOn.kind === "extra" ? addOn.price : "0";

    if (!addOn.sized) {
      return [{ code: addOnCode(name), label: name, price, stock: addOn.stock }];
    }

    return addOn.sizes
      .filter((size) => size.label.trim())
      .map((size) => ({
        code: addOnCode(name, size.label),
        label: `${name} ${size.label.trim()}`,
        price,
        stock: size.stock,
      }));
  });
}

/** A whole number of units, at least one. `quota == 0` is InvalidQuota(4). */
function badStock(value: string): boolean {
  return !/^\d+$/.test(value.trim()) || Number(value) < 1;
}

/**
 * What is wrong with this row, said before a signature is spent rather than
 * after a document is frozen with it.
 */
export function addOnProblem(addOn: PlannedAddOn): string | null {
  if (!addOn.name.trim()) return "Give this one a name, or remove it.";
  if (addOn.includedIn.length === 0) {
    return "Tick at least one distance, otherwise nobody is offered this.";
  }
  if (addOn.kind === "extra" && (!/^\d+(\.\d{1,7})?$/.test(addOn.price.trim()) || Number(addOn.price) <= 0)) {
    return "Give this a price, or move it to what comes with the ticket.";
  }
  if (addOn.sized) {
    if (addOn.sizes.every((size) => !size.label.trim())) {
      return "Name at least one size, so runners know what they can pick.";
    }
    // Every size is its own row on chain, and the contract refuses a quota of
    // zero, so a size with no number cannot be created at all.
    if (addOn.sizes.some((size) => size.label.trim() && badStock(size.stock))) {
      return "Say how many of each size exist. The contract will not take zero.";
    }
    return null;
  }
  if (badStock(addOn.stock)) {
    return "Say how many of these exist. The contract will not take zero.";
  }
  return null;
}

/**
 * Two items that would land on chain under one code.
 *
 * `add_addon` would happily write both, and the second would look like a
 * second stock of the first to anybody reading the event afterwards.
 */
export function duplicateAddOnCode(addOns: PlannedAddOn[]): string | null {
  const seen = new Set<string>();
  for (const unit of addOnUnits(addOns)) {
    if (seen.has(unit.code)) return unit.code;
    seen.add(unit.code);
  }
  return null;
}

