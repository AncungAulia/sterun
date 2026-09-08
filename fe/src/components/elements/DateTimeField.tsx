"use client";

/**
 * A date and a time, side by side, in shadcn's own date-and-time shape: the
 * date is a button that opens a calendar, the time is a plain time input.
 *
 * ## Why there is no text field to type into
 *
 * There used to be one, on the grounds that a picker you can only click is
 * unusable by keyboard. That reasoning does not apply here: the calendar is
 * Radix and react-day-picker, so the trigger is reachable by tab, the popover
 * takes focus, arrow keys move by day and week, and every day announces its
 * full date. Keeping a second way in was costing a `2026-10-04T06:00` box on
 * screen that nobody wants to look at.
 *
 * ## Why the sentence underneath stays
 *
 * A start time cannot be corrected once the event exists, and a date entered
 * one month off still looks plausible as digits. It stops looking plausible the
 * moment it names the wrong day of the week. That line is the last chance
 * anybody gets to notice, so it costs one line and keeps it.
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
import { formatEventDate, formatEventDateTimeLong, formatEventDayLong } from "@/utils/format";

interface DateTimeFieldProps {
  id: string;
  /** Names the pair. The two controls are labelled "<label> date" and "<label> time". */
  label: string;
  /** `YYYY-MM-DDTHH:mm`, or `YYYY-MM-DD` when `dateOnly`. */
  value: string;
  /**
   * Drops the time control. Used for the race date, whose hours belong to the
   * categories: a 5K and a half marathon on the same morning start in waves,
   * and asking for one time up here would make one of them wrong.
   */
  dateOnly?: boolean;
  onChange: (value: string) => void;
  hint?: string;
  /** Why this field matters, behind an info button. See `elements/Help.tsx`. */
  help?: ReactNode;
  error?: string;
  required?: boolean;
  /** Warn when the moment is already gone. Used for the start time. */
  warnIfPast?: boolean;
}

export function DateTimeField({
  id,
  label,
  value,
  onChange,
  hint,
  help,
  error,
  dateOnly = false,
  required = false,
  warnIfPast = false,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  /**
   * Read once, when the field mounts. `Date.now()` in the render body is an
   * impure call, and the difference it would make is nothing: this only decides
   * whether a date already went by, and a "now" that is a few minutes stale
   * answers that identically.
   */
  const [mountedAt] = useState(() => Date.now());
  const [date, time] = splitValue(value);

  /**
   * The shape is checked before the value is parsed, because `new Date` is far
   * too forgiving: `new Date("2026-10")` is a perfectly good date in October.
   */
  const complete = dateOnly
    ? /^\d{4}-\d{2}-\d{2}$/.test(value)
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
  const asDate = complete ? new Date(dateOnly ? `${value}T00:00` : value) : null;
  const valid = asDate !== null && !Number.isNaN(asDate.getTime());
  const isPast = valid && asDate.getTime() < mountedAt;

  const chosen = date ? new Date(`${date}T00:00`) : null;
  const chosenValid = chosen !== null && !Number.isNaN(chosen.getTime());

  function setDate(next: Date | undefined) {
    if (!next) return;
    // The time is kept. Picking a day should not silently reset an hour that
    // was already chosen, and 00:00 would be a plausible wrong answer rather
    // than an obvious one.
    onChange(dateOnly ? toDateValue(next) : `${toDateValue(next)}T${time || "06:00"}`);
    setOpen(false);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <LabelText label={label} required={required} />
        {help ? <Help label={label}>{help}</Help> : null}
      </legend>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-date`} className="text-muted-foreground">
            Date
          </Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                id={`${id}-date`}
                type="button"
                variant="outline"
                aria-label={`${label} date`}
                className="w-44 justify-between font-normal"
              >
                {chosenValid ? formatEventDate(toUnix(chosen)) : "Select date"}
                <ChevronDownIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto overflow-hidden p-0" align="start">
              <Calendar
                mode="single"
                selected={chosenValid ? chosen : undefined}
                onSelect={setDate}
                defaultMonth={chosenValid ? chosen : undefined}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {dateOnly ? null : (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-time`} className="text-muted-foreground">
              Time
            </Label>
            <Input
              id={`${id}-time`}
              aria-label={`${label} time`}
              type="time"
              value={time}
              onChange={(e) => onChange(`${date || toDateValue(new Date())}T${e.target.value}`)}
              className="numeric w-32"
            />
          </div>
        )}
      </div>

      {valid ? (
        <p className="text-sm text-muted-foreground">
          {dateOnly ? formatEventDayLong(toUnix(asDate)) : formatEventDateTimeLong(toUnix(asDate))}
        </p>
      ) : null}

      {valid && isPast && warnIfPast ? (
        <p className="text-sm text-warning">
          That is in the past. Nothing stops you, but a race that already started reads as a
          mistake to anyone browsing.
        </p>
      ) : null}

      <FieldMessage hint={hint} error={error} />
    </fieldset>
  );
}

function splitValue(value: string): [string, string] {
  const [date = "", time = ""] = value.split("T");
  return [date, time.slice(0, 5)];
}

function toUnix(date: Date): bigint {
  return BigInt(Math.floor(date.getTime() / 1000));
}

/** Local calendar date as `YYYY-MM-DD`, never through toISOString (that is UTC). */
function toDateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
