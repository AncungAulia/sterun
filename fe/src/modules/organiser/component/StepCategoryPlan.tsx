"use client";

/**
 * Step 2: plan the distances. No transactions here at all.
 *
 * The categories moved in front of the details file because of an ordering
 * problem with no other way out. Each category has its own start time (a 5K and
 * a half marathon on one morning go off in waves), the contract has no field
 * for that, so it has to live in the details file. That file is hashed and
 * committed by `create_event`, which happens before any `add_category` call.
 * So the categories have to be *known* before the file is built, even though
 * they are *written* to the chain afterwards.
 *
 * Splitting "decide" from "sign" turns out to suit the job anyway: an organiser
 * works out the whole race once, and then signs a run of transactions, instead
 * of alternating between the two.
 */
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/elements/Field";
import { Help } from "@/components/elements/Help";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice, parseStroops } from "@/utils/format";

export interface PlannedCategory {
  code: string;
  /** Kilometres as typed, converted at the last moment. */
  km: string;
  quota: string;
  /** sUSD as typed. Empty means free. */
  price: string;
  /** `HH:mm` on the race day. */
  startTime: string;
  /** `HH:mm`, optional. Earlier than the start means the next day. */
  cutOff: string;
}

export const EMPTY_CATEGORY: PlannedCategory = {
  code: "",
  km: "",
  quota: "",
  price: "",
  startTime: "",
  cutOff: "",
};

/**
 * What the contract will not accept, said before a signature is spent rather
 * than after one is refused.
 */
export function categoryProblem(category: PlannedCategory): string | null {
  if (!/^[A-Za-z0-9_]{1,32}$/.test(category.code)) {
    return "A code can only use letters, digits and underscores, like 10K or FUN5K.";
  }
  const distanceM = Math.round(Number(category.km) * 1000);
  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    return "Give the distance in kilometres, like 10 or 21.1.";
  }
  const quota = Number(category.quota);
  if (!Number.isInteger(quota) || quota <= 0) {
    return "A quota is a whole number of places, and it cannot be zero.";
  }
  if (!/^\d{2}:\d{2}$/.test(category.startTime)) {
    return "Give the time this distance starts.";
  }
  try {
    parseStroops(category.price);
  } catch (e) {
    return e instanceof Error ? e.message : "That price is not a number.";
  }
  return null;
}

interface StepCategoryPlanProps {
  categories: PlannedCategory[];
  onChange: (categories: PlannedCategory[]) => void;
  /** Set once somebody has pressed Continue, so a fresh form is not red. */
  showProblems?: boolean;
}

export function StepCategoryPlan({
  categories,
  onChange,
  showProblems = false,
}: StepCategoryPlanProps) {
  const [justAdded, setJustAdded] = useState(false);

  const set = (index: number, patch: Partial<PlannedCategory>) =>
    onChange(categories.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="heading-strong text-lg text-foreground">Distance categories</h2>
          <Help label="distance categories">
            Nothing is signed on this screen. You are writing the race down, and the wallet comes
            at the end, once for each distance.
          </Help>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          One per distance people can enter. A distance cannot be changed or removed once it
          exists, so this is the place to get it right.
        </p>
      </div>

      {categories.map((category, index) => {
        const problem = showProblems ? categoryProblem(category) : null;
        return (
          <div
            key={index}
            className="flex flex-col gap-5 rounded-lg border border-border p-5"
          >
            <div className="flex items-center justify-between">
              <p className="heading text-base text-foreground">
                {category.code || `Distance ${index + 1}`}
                {category.price ? (
                  <span className="numeric ml-3 text-sm text-muted-foreground">
                    {formatPrice(safeStroops(category.price))}
                  </span>
                ) : null}
              </p>
              {categories.length > 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${category.code || `distance ${index + 1}`}`}
                  onClick={() => onChange(categories.filter((_, i) => i !== index))}
                >
                  <Trash2Icon />
                  Remove
                </Button>
              ) : null}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id={`code-${index}`}
                label="Code"
                required
                value={category.code}
                onChange={(e) => set(index, { code: e.target.value })}
                placeholder="5K, 10K, HALF"
                hint="Letters, digits and underscores only."
                help="This is what a runner picks between on your event page, so it should read the way people already talk about the distance."
              />
              <Field
                id={`km-${index}`}
                label="Distance in kilometres"
                required
                value={category.km}
                onChange={(e) => set(index, { km: e.target.value })}
                placeholder="10"
              />
              <Field
                id={`quota-${index}`}
                label="Maximum entries"
                required
                value={category.quota}
                onChange={(e) => set(index, { quota: e.target.value })}
                placeholder="300"
                hint="Entries stop on their own once this many people have joined."
                help="The limit holds by itself, even if two people try for the last place at the same moment. You do not have to watch it or close anything."
              />
              <Field
                id={`price-${index}`}
                label="Entry fee in sUSD"
                value={category.price}
                onChange={(e) => set(index, { price: e.target.value })}
                placeholder="25"
                hint="Enter 0 if this distance is free."
                help="Paid in sUSD, the test currency for this stage. It goes straight from the runner to your wallet when they enter, and we never hold it."
              />
              <div className="flex flex-col gap-2">
                <Label htmlFor={`start-${index}`}>
                  Start time
                  <span aria-hidden="true" className="text-danger">
                    *
                  </span>
                </Label>
                <Input
                  id={`start-${index}`}
                  type="time"
                  value={category.startTime}
                  onChange={(e) => set(index, { startTime: e.target.value })}
                  className="numeric w-32"
                />
                <p className="text-sm text-muted-foreground">On the race day.</p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`cut-${index}`}>Cut off</Label>
                  <Help label="cut off">
                    Shown to runners as information. Nothing enforces it, so a finish recorded
                    after this time is still recorded.
                  </Help>
                </div>
                <Input
                  id={`cut-${index}`}
                  type="time"
                  value={category.cutOff}
                  onChange={(e) => set(index, { cutOff: e.target.value })}
                  className="numeric w-32"
                />
                <p className="text-sm text-muted-foreground">
                  The last moment a finish counts.
                </p>
              </div>
            </div>

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
          onClick={() => {
            onChange([...categories, { ...EMPTY_CATEGORY }]);
            setJustAdded(true);
          }}
        >
          <PlusIcon />
          Add another distance
        </Button>
        {justAdded ? <span className="sr-only">Distance added</span> : null}
      </div>
    </div>
  );
}

/** Only for the preview line; the real parse happens where it can complain. */
function safeStroops(price: string): bigint {
  try {
    return parseStroops(price);
  } catch {
    return 0n;
  }
}
