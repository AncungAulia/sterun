"use client";

/**
 * Step 4: the distances people actually enter.
 *
 * One transaction per category, because `add_category` is one call and Soroban
 * allows a single contract invocation per transaction. There is no batching to
 * be had here, so the UI stops pretending otherwise: each category is added,
 * signed and confirmed on its own, and the ones already on chain stay listed
 * even if the next one fails.
 *
 * An event with no categories is legal and useless: nobody can enter a race
 * they cannot pick a distance in, which is why the wizard will not open an
 * event until at least one exists.
 */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/elements/Field";
import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { useAddCategory } from "@/hooks/useOrganiser";
import { formatPrice, parseStroops } from "@/utils/format";

export interface AddedCategory {
  code: string;
  distanceM: number;
  quota: number;
  priceStroops: bigint;
  txHash: string;
}

interface StepCategoriesProps {
  eventId: number;
  added: AddedCategory[];
  onAdded: (category: AddedCategory) => void;
}

export function StepCategories({ eventId, added, onAdded }: StepCategoriesProps) {
  const [code, setCode] = useState("");
  const [km, setKm] = useState("");
  const [quota, setQuota] = useState("");
  const [price, setPrice] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const addCategory = useAddCategory();

  async function add() {
    setInputError(null);

    // Soroban Symbol: letters, digits and underscore. Checked here rather than
    // left to the contract, because a revert costs a signature and a wait to
    // learn what a regex could have said instantly.
    if (!/^[A-Za-z0-9_]{1,32}$/.test(code)) {
      setInputError("A code can only use letters, digits and underscores, like 10K or FUN5K.");
      return;
    }
    const distanceM = Math.round(Number(km) * 1000);
    if (!Number.isFinite(distanceM) || distanceM <= 0) {
      setInputError("Give the distance in kilometres, like 10 or 21.1.");
      return;
    }
    const quotaValue = Number(quota);
    if (!Number.isInteger(quotaValue) || quotaValue <= 0) {
      setInputError("A quota is a whole number of places, and it cannot be zero.");
      return;
    }

    let priceStroops: bigint;
    try {
      priceStroops = parseStroops(price);
    } catch (e) {
      setInputError(e instanceof Error ? e.message : "That price is not a number.");
      return;
    }

    let sent;
    try {
      sent = await addCategory.write({
        eventId,
        code,
        distanceM,
        quota: quotaValue,
        priceStroops,
      });
    } catch {
      // Declining in the wallet is a normal answer, not a crash. The mutation
      // holds the message and ErrorNotice below shows it; rethrowing here would
      // only produce an unhandled rejection nobody sees.
      return;
    }

    onAdded({ code, distanceM, quota: quotaValue, priceStroops, txHash: sent.txHash });
    setCode("");
    setKm("");
    setQuota("");
    setPrice("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="heading text-xl text-n-700">Categories</h2>
        <p className="mt-2 max-w-2xl text-base text-n-600">
          You will be asked to confirm each one in your wallet, one at a time. A category cannot
          be changed or removed once it is added.
        </p>
      </div>

      {added.length > 0 ? (
        <ul className="rounded-lg border border-n-200">
          {added.map((category) => (
            <li
              key={category.code}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-n-200 px-5 py-3 last:border-b-0"
            >
              <span className="numeric heading-strong text-base text-ink">{category.code}</span>
              <span className="numeric text-sm text-n-500">
                {category.distanceM / 1000} km, {category.quota} places
              </span>
              <span className="numeric text-sm text-n-600">
                {formatPrice(category.priceStroops)}
              </span>
              <Badge variant="success">Added</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="category-code"
          label="Code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="10K"
          hint="Letters, digits and underscores only."
        />
        <Field
          id="category-km"
          label="Distance in kilometres"
          value={km}
          onChange={(e) => setKm(e.target.value)}
          placeholder="10"
        />
        <Field
          id="category-quota"
          label="Places"
          value={quota}
          onChange={(e) => setQuota(e.target.value)}
          placeholder="300"
          hint="Entries stop on their own once this many people have joined."
        />
        <Field
          id="category-price"
          label="Entry fee in sUSD"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="25"
          hint="Leave empty for a free category."
        />
      </div>

      {inputError ? (
        <p role="alert" className="text-base text-danger">
          {inputError}
        </p>
      ) : null}

      {addCategory.error ? (
        <ErrorNotice title="That category was not added" detail={addCategory.error.message} />
      ) : null}

      <div>
        <Button onClick={() => void add()} disabled={addCategory.isBusy}>
          {addCategory.phase === "signing"
            ? "Confirm in your wallet"
            : addCategory.phase === "confirming"
              ? "Adding"
              : "Add category"}
        </Button>
      </div>
    </div>
  );
}
