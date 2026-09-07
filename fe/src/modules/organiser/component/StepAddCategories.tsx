"use client";

/**
 * Step 5: put the planned distances on chain, one signature each.
 *
 * `add_category` is one contract call and Soroban allows a single contract
 * invocation per transaction, so there is no batching to reach for: four
 * distances is four transactions and four wallet prompts. The UI stops
 * pretending otherwise and shows the run as a list you work down.
 *
 * Everything already added stays added if the next one fails or is declined.
 * That is not a nicety: those transactions have landed and cannot be undone, so
 * a screen that reset on failure would be lying about what is on chain.
 */
import { CheckIcon } from "lucide-react";

import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAddCategory } from "@/hooks/useOrganiser";
import { formatPrice, parseStroops } from "@/utils/format";

import type { PlannedCategory } from "./StepCategoryPlan";

export interface AddedCategory {
  code: string;
  txHash: string;
}

interface StepAddCategoriesProps {
  eventId: number;
  plan: PlannedCategory[];
  added: AddedCategory[];
  onAdded: (category: AddedCategory) => void;
}

export function StepAddCategories({ eventId, plan, added, onAdded }: StepAddCategoriesProps) {
  const addCategory = useAddCategory();
  const doneCodes = new Set(added.map((category) => category.code));
  const next = plan.find((category) => !doneCodes.has(category.code));

  async function add(category: PlannedCategory) {
    try {
      const sent = await addCategory.write({
        eventId,
        code: category.code,
        distanceM: Math.round(Number(category.km) * 1000),
        quota: Number(category.quota),
        priceStroops: parseStroops(category.price),
      });
      onAdded({ code: category.code, txHash: sent.txHash });
    } catch {
      // Declining in the wallet is an answer, not a crash. The mutation holds
      // the message and the notice below shows it.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="heading-strong text-lg text-foreground">Add the distances</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          One at a time, one confirmation each. Anything already added stays added, so you can stop
          and come back to the rest.
        </p>
      </div>

      <ul className="rounded-lg border border-border">
        {plan.map((category) => {
          const done = doneCodes.has(category.code);
          const isNext = category.code === next?.code;

          return (
            <li
              key={category.code}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 last:border-b-0"
            >
              <div>
                <p className="numeric heading-strong text-base text-foreground">{category.code}</p>
                <p className="numeric mt-1 text-sm text-muted-foreground">
                  {category.km} km, {category.quota} places, {formatPrice(safe(category.price))},
                  starts {category.startTime}
                </p>
              </div>

              {done ? (
                <Badge variant="success">
                  <CheckIcon className="mr-1 size-3" />
                  Added
                </Badge>
              ) : isNext ? (
                <Button onClick={() => void add(category)} disabled={addCategory.isBusy}>
                  {addCategory.phase === "signing"
                    ? "Confirm in your wallet"
                    : addCategory.phase === "confirming"
                      ? "Adding"
                      : "Add this distance"}
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">Waiting</span>
              )}
            </li>
          );
        })}
      </ul>

      {addCategory.error ? (
        <ErrorNotice title="That distance was not added" detail={addCategory.error.message} />
      ) : null}
    </div>
  );
}

function safe(price: string): bigint {
  try {
    return parseStroops(price);
  } catch {
    return 0n;
  }
}
