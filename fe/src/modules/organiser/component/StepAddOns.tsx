"use client";

/**
 * Step 3: what a runner actually gets, and which distances get it.
 *
 * ## Why add-ons are not sold separately
 *
 * `enter` transfers exactly `category.price` from the runner to the organiser,
 * once. One transaction, one amount, and the contract is not upgradeable, so
 * there is no second charge to attach a jersey to. Anything sold as an extra
 * would have to be paid outside the protocol, which means a runner can pay and
 * fail to enter, or enter and never pay. That is the exact dispute this product
 * exists to remove, so it is not on offer.
 *
 * What works instead is what races already do: the jersey is part of a ticket.
 * `10K` at 100 and `10K_JERSEY` at 150 are two distances, one price each, and
 * the money still moves in the single transfer `enter` already makes. It also
 * gets something for free that would otherwise need building: the quota on the
 * jersey distance *is* the shirt order. Stop at 200 and entries stop at 200,
 * enforced on chain, with nobody watching it.
 *
 * ## Why an add-on names its distances rather than the other way round
 *
 * One jersey row ticking three distances beats three distances each repeating
 * the same jersey, and the same fact written twice is a fact that can disagree
 * with itself. A reader that wants "what does the 10K include" inverts the
 * list, which is cheap; an organiser correcting a size chart in three places is
 * not.
 *
 * ## What cannot be done in v1, and must not be implied
 *
 * Stock per size. The contract counts entries per category and knows nothing
 * about M or L, so "M is sold out" cannot be enforced. The sizes here are what
 * is offered, not what is left.
 */
import { PlusIcon, Trash2Icon } from "lucide-react";

import { CreatableSelect } from "@/components/elements/CreatableSelect";
import { FileField } from "@/components/elements/FileField";
import { LabelRow } from "@/components/elements/Field";
import { Help } from "@/components/elements/Help";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { PlannedCategory } from "./StepCategoryPlan";

import {
  ADD_ON_PRESETS,
  DEFAULT_SIZES,
  EMPTY_ADD_ON,
  addOnProblem,
  addOnUnits,
  duplicateAddOnCode,
  type AddOnSize,
  type PlannedAddOn,
} from "../addons";

export {
  ADD_ON_PRESETS,
  EMPTY_ADD_ON,
  addOnCode,
  addOnProblem,
  addOnUnits,
  duplicateAddOnCode,
  type AddOnSize,
  type PlannedAddOn,
} from "../addons";

interface StepAddOnsProps {
  addOns: PlannedAddOn[];
  /** The distances from the previous step. Only their codes are used here. */
  categories: PlannedCategory[];
  onChange: (addOns: PlannedAddOn[]) => void;
  showProblems?: boolean;
}

export function StepAddOns({
  addOns,
  categories,
  onChange,
  showProblems = false,
}: StepAddOnsProps) {
  const codes = categories.map((category) => category.code.trim()).filter(Boolean);

  const set = (index: number, patch: Partial<PlannedAddOn>) =>
    onChange(addOns.map((addOn, i) => (i === index ? { ...addOn, ...patch } : addOn)));

  /**
   * Picking a preset name also answers whether the thing has sizes, because
   * they are the same question: nobody who chose "Tumbler" then wants to be
   * asked whether a tumbler comes in a medium.
   */
  function rename(index: number, name: string) {
    const preset = ADD_ON_PRESETS.find((entry) => entry.name === name);
    if (!preset) return set(index, { name });
    const current = addOns[index]!;
    set(index, {
      name,
      sized: preset.sized,
      // Only seeded when there is nothing to lose, so a preset picked by
      // accident never wipes a chart somebody typed.
      sizes: preset.sized && current.sizes.length === 0 ? defaultSizes() : current.sizes,
    });
  }

  const clash = duplicateAddOnCode(addOns);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="heading-strong text-lg text-foreground">What runners get</h2>
          <Help label="what runners get">
            Two lists, because they are two different things to a runner: what the entry fee
            already covers, and what costs more on top. Both are held on chain with their own
            stock, so a size that is gone is gone, and neither can be quietly restocked later.
          </Help>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The jersey, the medal, whatever is in the race pack, and anything sold on top of the
          entry. Leave both empty if there is nothing to show.
        </p>
      </div>

      {codes.length === 0 ? (
        <p className="text-base text-warning">
          Go back and add a distance first. Everything here has to belong to one.
        </p>
      ) : null}

      {clash ? (
        <p role="alert" className="text-base text-danger">
          Two of these would be stored under the same code, {clash}. Rename one, otherwise the
          second reads as more stock of the first.
        </p>
      ) : null}

      {(
        [
          {
            kind: "included" as const,
            title: "Comes with the ticket",
            note: "Already covered by the entry fee. It still needs a number, because the contract will not take a stock of zero.",
            add: "Add something included",
          },
          {
            kind: "extra" as const,
            title: "Sold on top",
            note: "Bought during registration, charged in the same transaction as the entry. A runner who does not want it does not pay for it.",
            add: "Add something to sell",
          },
        ]
      ).map((section) => (
        <section key={section.kind} className="flex flex-col gap-5">
          <div>
            <h3 className="heading text-base text-foreground">{section.title}</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{section.note}</p>
          </div>

          {addOns.map((addOn, index) => ({ addOn, index }))
            .filter((entry) => entry.addOn.kind === section.kind)
            .map(({ addOn, index }) => {
        const problem = showProblems ? addOnProblem(addOn) : null;
        return (
          <div key={index} className="flex flex-col gap-5 rounded-lg border border-border p-5">
            <div className="flex items-center justify-between">
              <p className="heading text-base text-foreground">
                {addOn.name || `Item ${index + 1}`}
              </p>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${addOn.name || `item ${index + 1}`}`}
                onClick={() => onChange(addOns.filter((_, i) => i !== index))}
              >
                <Trash2Icon aria-hidden="true" className="size-4" />
                Remove
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <LabelRow htmlFor={`addon-name-${index}`} label="Item" required />
              <CreatableSelect
                id={`addon-name-${index}`}
                ariaLabel="Item"
                options={ADD_ON_PRESETS.map((preset) => preset.name)}
                value={addOn.name}
                onChange={(name) => rename(index, name)}
                placeholder="Choose or add an item"
              />
              <p className="text-sm text-muted-foreground">
                Not on the list? Type it and add it.
              </p>
            </div>

            <FileField
              id={`addon-photo-${index}`}
              label="Photo"
              kind="image"
              value={addOn.photoUrl}
              onChange={(photoUrl) => set(index, { photoUrl })}
              hint="PNG or JPEG, up to 5 MB."
              help="For a jersey this is the thing people decide on. A race with the shirt on the page reads as a race that has actually made the shirt."
            />

            {addOn.kind === "extra" ? (
              <div className="flex flex-col gap-2">
                <LabelRow
                  htmlFor={`addon-price-${index}`}
                  label="Price in sUSD"
                  required
                  help="Charged in the same transaction as the entry fee, in one transfer, so a runner cannot end up having paid for the shirt but not the race."
                />
                <Input
                  id={`addon-price-${index}`}
                  inputMode="decimal"
                  value={addOn.price}
                  onChange={(e) => set(index, { price: e.target.value })}
                  placeholder="30"
                  className="numeric w-40"
                />
              </div>
            ) : null}

            {addOn.sized ? null : (
              <div className="flex flex-col gap-2">
                <LabelRow
                  htmlFor={`addon-stock-${index}`}
                  label="How many exist"
                  required
                  help="Held on chain. Once they are gone the contract refuses the next entry that asks for one, which is the only version of sold out nobody has to police by hand."
                />
                <Input
                  id={`addon-stock-${index}`}
                  inputMode="numeric"
                  value={addOn.stock}
                  onChange={(e) => set(index, { stock: e.target.value })}
                  placeholder="500"
                  className="numeric w-40"
                />
              </div>
            )}

            {/*
              Two questions, and they were being read as one. A tick list of
              distances followed immediately by a lone tick box put "Runners
              pick a size" in the same visual group as "10K", where it looks
              like a distance. Separate blocks with their own headings is what
              fixes that; a rule between them was tried and only added lines to
              a card that already has a border of its own.
            */}
            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">Included in</legend>
              {/*
                The wording follows the list, because the same tick means two
                different things: for something included it says who receives
                it, and for something sold it says who is allowed to buy it.
              */}
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  {addOn.kind === "included"
                    ? "Which distances include it"
                    : "Which distances can buy it"}
                </p>
                <Help
                  label={
                    addOn.kind === "included"
                      ? "which distances include it"
                      : "which distances can buy it"
                  }
                >
                  {addOn.kind === "included"
                    ? "The entry fee for a ticked distance already covers this, and the stock you set is how many you need to have made."
                    : "Published as who this is offered to. The contract does not hold the link, so it cannot stop a runner on another distance from buying one; what it does hold is the stock."}
                </Help>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {codes.map((code) => (
                  <label key={code} className="flex items-center gap-2 text-base text-foreground">
                    <Checkbox
                      checked={addOn.includedIn.includes(code)}
                      onCheckedChange={(checked) =>
                        set(index, {
                          includedIn: checked
                            ? [...addOn.includedIn, code]
                            : addOn.includedIn.filter((entry) => entry !== code),
                        })
                      }
                    />
                    {code}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Sizes</p>
                <Help label="sizes">
                  Only for something worn. A tumbler has no size to pick, and asking for one is a
                  question every runner has to stop and answer for nothing.
                </Help>
              </div>
              <label className="flex items-center gap-2 text-base text-foreground">
                <Checkbox
                  checked={addOn.sized}
                  onCheckedChange={(checked) =>
                    set(index, {
                      sized: checked === true,
                      sizes:
                        checked && addOn.sizes.length === 0 ? defaultSizes() : addOn.sizes,
                    })
                  }
                />
                Runners pick a size for this
              </label>

              {addOn.sized ? (
                <SizeChart
                  index={index}
                  sizes={addOn.sizes}
                  onChange={(sizes) => set(index, { sizes })}
                />
              ) : null}
            </div>

            {/*
              Shown rather than hidden. Nobody typed these and they are on
              chain forever, so an organiser gets to see what their item is
              about to be called before it is.
            */}
            {addOnUnits([addOn]).length > 0 ? (
              <p className="text-sm text-muted-foreground">
                On chain as{" "}
                <span className="numeric">
                  {addOnUnits([addOn])
                    .map((unit) => unit.code)
                    .join(", ")}
                </span>
              </p>
            ) : null}

            {problem ? (
              <p role="alert" className="text-sm text-danger">
                {problem}
              </p>
            ) : null}
          </div>
        );
      })}

          <div>
            <Button
              variant="secondary"
              onClick={() => onChange([...addOns, { ...EMPTY_ADD_ON, kind: section.kind }])}
            >
              <PlusIcon aria-hidden="true" className="size-4" />
              {section.add}
            </Button>
          </div>
        </section>
      ))}

    </div>
  );
}

/**
 * Measurements per size, because "M" means nothing on its own.
 *
 * Every vendor cuts differently, so the numbers have to come from the
 * organiser. What a runner does with them is compare against a shirt they
 * already own, which is the only method that actually works by post.
 */
function SizeChart({
  index,
  sizes,
  onChange,
}: {
  index: number;
  sizes: AddOnSize[];
  onChange: (sizes: AddOnSize[]) => void;
}) {
  const set = (row: number, patch: Partial<AddOnSize>) =>
    onChange(sizes.map((size, i) => (i === row ? { ...size, ...patch } : size)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">Size chart</p>
        <Help label="size chart">
          Flat measurements in centimetres, taken the way your vendor gives them. Runners compare
          these against a shirt they already own, so numbers are worth more than letters.
        </Help>
      </div>

      {/* Fixed columns: these are two digit numbers, and inputs stretched to the
          page width read as though a sentence is expected. */}
      <div className="grid w-fit grid-cols-[5rem_7rem_7rem_7rem_auto] items-end gap-3">
        <span className="text-sm text-muted-foreground">Size</span>
        <span className="text-sm text-muted-foreground">Chest (cm)</span>
        <span className="text-sm text-muted-foreground">Length (cm)</span>
        {/*
          The one column here that is not a measurement. It is what makes a
          sold-out size real: the contract holds a quota per add-on, and each
          size is its own add-on, so this number is the stock the chain will
          refuse to sell past.
        */}
        <span className="text-sm text-muted-foreground">How many</span>
        <span />

        {sizes.map((size, row) => (
          <SizeRow
            key={row}
            index={index}
            row={row}
            size={size}
            onChange={(patch) => set(row, patch)}
            onRemove={() => onChange(sizes.filter((_, i) => i !== row))}
          />
        ))}
      </div>

      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange([...sizes, { label: "", chest: "", length: "", stock: "" }])}
        >
          <PlusIcon aria-hidden="true" className="size-4" />
          Add a size
        </Button>
      </div>
    </div>
  );
}

function SizeRow({
  index,
  row,
  size,
  onChange,
  onRemove,
}: {
  index: number;
  row: number;
  size: AddOnSize;
  onChange: (patch: Partial<AddOnSize>) => void;
  onRemove: () => void;
}) {
  const id = `addon-${index}-size-${row}`;
  return (
    <>
      <div>
        <Label htmlFor={id} className="sr-only">
          Size {row + 1} label
        </Label>
        <Input
          id={id}
          value={size.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="M"
          className="numeric"
        />
      </div>
      <Input
        aria-label={`Size ${row + 1} chest`}
        value={size.chest}
        onChange={(e) => onChange({ chest: e.target.value })}
        placeholder="52"
        className="numeric"
      />
      <Input
        aria-label={`Size ${row + 1} length`}
        value={size.length}
        onChange={(e) => onChange({ length: e.target.value })}
        placeholder="70"
        className="numeric"
      />
      <Input
        aria-label={`Size ${row + 1} stock`}
        inputMode="numeric"
        value={size.stock}
        onChange={(e) => onChange({ stock: e.target.value })}
        placeholder="200"
        className="numeric"
      />
      <Button variant="ghost" size="sm" aria-label={`Remove size ${row + 1}`} onClick={onRemove}>
        <Trash2Icon aria-hidden="true" className="size-4" />
      </Button>
    </>
  );
}

const defaultSizes = (): AddOnSize[] =>
  DEFAULT_SIZES.map((label) => ({ label, chest: "", length: "", stock: "" }));
