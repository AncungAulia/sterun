"use client";

/**
 * A run of days, plus the hours a desk is open on each of them.
 *
 * ## Why this is not two date-and-time fields
 *
 * It used to be, and it quietly claimed something nobody means. "Opens 1 August
 * 09:00, closes 9 August 21:00" reads as one continuous window, so it says the
 * collection desk is staffed through the nights of the 2nd to the 8th. Race
 * pack collection is people sitting at a table, and they go home.
 *
 * The shape that matches reality is a range of days and one pair of hours that
 * applies to each of them, which is how every physical opening time is written
 * anywhere else.
 *
 * Registration deliberately keeps the old shape. That one really is continuous:
 * a form on the internet does not close overnight.
 */
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Help } from "@/components/elements/Help";
import { FieldMessage, LabelText } from "@/components/elements/Field";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatEventDate } from "@/utils/format";

export interface DayRange {
  /** `YYYY-MM-DD`, or empty. */
  from: string;
  to: string;
  /** `HH:mm`, applied to every day in the range. */
  opens: string;
  closes: string;
}

export const EMPTY_RANGE: DayRange = { from: "", to: "", opens: "", closes: "" };

interface DateRangeFieldProps {
  id: string;
  label: string;
  value: DayRange;
  onChange: (value: DayRange) => void;
  hint?: string;
  /** Why this field matters, behind an info button. See `elements/Help.tsx`. */
  help?: ReactNode;
  error?: string;
  required?: boolean;
}

export function DateRangeField({
  id,
  label,
  value,
  onChange,
  hint,
  help,
  error,
  required = false,
}: DateRangeFieldProps) {
  const [open, setOpen] = useState(false);
  const from = toDate(value.from);
  const to = toDate(value.to);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <LabelText label={label} required={required} />
        {help ? <Help label={label}>{help}</Help> : null}
      </legend>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-days`} className="text-muted-foreground">
            Days
          </Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                id={`${id}-days`}
                type="button"
                variant="outline"
                aria-label={`${label} days`}
                className="w-64 justify-between font-normal"
              >
                {from ? (
                  <span>
                    {formatEventDate(toUnix(from))}
                    {to ? ` to ${formatEventDate(toUnix(to))}` : ""}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Select days</span>
                )}
                <ChevronDownIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto overflow-hidden p-0" align="start">
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={from ? { from, to: to ?? undefined } : undefined}
                onSelect={(range) =>
                  onChange({
                    ...value,
                    from: range?.from ? toValue(range.from) : "",
                    to: range?.to ? toValue(range.to) : "",
                  })
                }
                defaultMonth={from ?? undefined}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-opens`} className="text-muted-foreground">
            From
          </Label>
          <Input
            id={`${id}-opens`}
            aria-label={`${label} opens`}
            type="time"
            value={value.opens}
            onChange={(e) => onChange({ ...value, opens: e.target.value })}
            className="numeric w-32"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-closes`} className="text-muted-foreground">
            To
          </Label>
          <Input
            id={`${id}-closes`}
            aria-label={`${label} closes`}
            type="time"
            value={value.closes}
            onChange={(e) => onChange({ ...value, closes: e.target.value })}
            className="numeric w-32"
          />
        </div>
      </div>

      <FieldMessage
        hint={hint ?? "The same hours apply to every day in the range."}
        error={error}
      />
    </fieldset>
  );
}

function toDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Local calendar date, never through toISOString (that is UTC). */
function toValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toUnix(date: Date): bigint {
  return BigInt(Math.floor(date.getTime() / 1000));
}
