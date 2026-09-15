"use client";

/**
 * Step 3: everything on one page, and the one button that takes money
 * (mockup block 3).
 *
 * Nothing has been sent anywhere yet on this screen. The details go to the
 * vault only after Sign and pay is pressed, inside the dialog.
 *
 * `StepPay` is the review, in the form's column. `PayPanel` is the payment, in
 * the summary's column: the non-refundable notice stands directly above the
 * button (STE-38, fe/CLAUDE.md), and the balance is checked before the button
 * is usable, so nobody signs a payment that is certain to fail.
 */
import { Fragment } from "react";
import { formatPhoneNumberIntl } from "react-phone-number-input";

import { NonRefundableNotice } from "@/components/feedback/NonRefundableNotice";
import { Button } from "@/components/ui/button";
import { useSusdBalance } from "@/hooks/useSusdBalance";
import { shortfall, type SusdBalance } from "@/lib/wallet/susd";
import { formatAmount, formatPrice } from "@/utils/format";
import type { SterunCategory } from "@sterunxyz/sdk";

import type { Basket, Selection } from "../basket";
import { GENDERS, ID_TYPES, formatDateOfBirth, maskIdNumber, type RunnerDetails } from "../details";

import { GetTestSusd } from "@/components/wallet/GetTestSusd";
import { StepCard } from "./StepCard";

type Row = [label: string, value: string];

export function StepPay({
  category,
  basket,
  selection,
  details,
  onEdit,
}: {
  category: SterunCategory;
  basket: Basket;
  /** Already sanitised against the basket. */
  selection: Selection;
  details: RunnerDetails;
  onEdit: (step: "distance" | "details") => void;
}) {
  const packRows: Row[] = [["Distance", category.code]];
  for (const item of basket.pack) {
    const size = item.sized
      ? item.options.find((option) => option.addonId === selection.sizes[item.name])?.label
      : undefined;
    packRows.push([item.name, size ?? "Included"]);
  }
  for (const extra of basket.extras) {
    if (selection.extras.includes(extra.addonId)) packRows.push([extra.name, "Added"]);
  }

  const idLabel = ID_TYPES.find((type) => type.value === details.idType)?.label ?? "Identity document";
  const gender = GENDERS.find((option) => option.value === details.gender)?.label ?? "";
  const detailRows: Row[] = [
    ["Full name", details.name.trim()],
    [idLabel, maskIdNumber(details.idNumber)],
    ["Gender, date of birth", [gender, formatDateOfBirth(details.dateOfBirth)].filter(Boolean).join(", ")],
    ["Name on bib", details.bibName.trim()],
    ["Email", details.email.trim()],
    ["Phone", readablePhone(details.phone)],
    ["Emergency contact", `${details.emergencyName.trim()}, ${readablePhone(details.emergencyPhone)}`],
  ];

  return (
    <div className="flex flex-col gap-4">
      <StepCard
        id="entry-review-pack"
        title="Distance & race pack"
        action={<EditButton label="Edit distance and race pack" onClick={() => onEdit("distance")} />}
      >
        <Review rows={packRows} />
      </StepCard>
      <StepCard
        id="entry-review-details"
        title="Your details"
        action={<EditButton label="Edit your details" onClick={() => onEdit("details")} />}
      >
        <Review rows={detailRows} />
      </StepCard>
    </div>
  );
}

export function PayPanel({
  runner,
  total,
  busy,
  onPay,
}: {
  runner: string;
  total: bigint;
  /** True while an attempt is running, so it cannot be started twice. */
  busy: boolean;
  onPay: () => void;
}) {
  const paid = total > 0n;
  // A free entry moves no money, so it needs no balance, no trustline, and no read.
  const balance = useSusdBalance(paid ? runner : null);
  const needed = paid && balance.data ? shortfall(balance.data, total) : 0n;
  const waiting = paid && balance.isPending;

  return (
    <div className="flex flex-col gap-3">
      {needed > 0n && balance.data ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning-border bg-warning-surface px-4 py-3">
          <div className="min-w-48 flex-1 text-sm text-warning">
            <p className="text-base font-medium">You need {formatAmount(total)} sUSD to enter</p>
            <p>{held(balance.data)}</p>
          </div>
          <GetTestSusd address={runner} size="sm" />
        </div>
      ) : null}

      {/* Only where money moves. A warning where it does not apply stops being read. */}
      {paid ? <NonRefundableNotice /> : null}
      <Button className="w-full" disabled={busy || waiting || needed > 0n} onClick={onPay}>
        {paid ? `Sign and pay ${formatPrice(total)}` : "Sign and enter"}
      </Button>
      <p className="text-center text-sm text-n-500">Your wallet will ask you twice.</p>
    </div>
  );
}

function held(balance: SusdBalance): string {
  return balance.kind === "balance"
    ? `This wallet has ${formatAmount(balance.stroops)} sUSD.`
    : "This wallet has no sUSD yet.";
}

/** E.164 is for machines; a person checks `+62 812-3456-7890`. */
function readablePhone(value: string): string {
  return (value && formatPhoneNumberIntl(value)) || value;
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="link" size="sm" className="h-auto px-0" aria-label={label} onClick={onClick}>
      Edit
    </Button>
  );
}

function Review({ rows }: { rows: Row[] }) {
  return (
    <dl className="grid gap-x-4 text-sm sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-y-2">
      {rows.map(([label, value], index) => (
        <Fragment key={index}>
          <dt className="text-n-500">{label}</dt>
          <dd className="mb-3 font-medium break-words text-ink sm:mb-0">{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
