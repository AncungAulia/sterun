"use client";

/**
 * A date and time, picked from a calendar or typed, with the result read back
 * in words.
 *
 * ## Why the confirmation line exists
 *
 * A start time cannot be corrected once the event is created, and a date typed
 * one month off still looks perfectly plausible as digits. It stops looking
 * plausible the moment it names the wrong day of the week, which is why the
 * line under the field spells the whole thing out.
 *
 * ## Why the text input stays
 *
 * The calendar is an assist, not the only way in. The input is a real labelled
 * text field, so it can be typed, pasted, tabbed to and read by a screen
 * reader. Replacing the field with a grid of buttons is how date pickers become
 * unusable by keyboard.
 *
 * ## Composition
 *
 * shadcn's Calendar (react-day-picker underneath) inside a Popover, which is
 * the pattern their own date-and-time example uses. Keyboard navigation, focus
 * handling, escape to close and the accessible name of every day come from
 * those two, and every colour comes from tokens.css through the mapping in
 * globals.css.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatEventDateTimeLong } from "@/utils/format";

interface DateTimeFieldProps {
  id: string;
  label: string;
  /** `YYYY-MM-DDTHH:mm`. */
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  /** Warn when the moment is already gone. Used for the start time. */
  warnIfPast?: boolean;
}

export function DateTimeField({
  id,
  label,
  value,
  onChange,
  hint,
  warnIfPast = false,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  /**
   * Read once, when the field mounts. `Date.now()` in the render body is an
   * impure call, and the difference it would make is nothing: this only decides
   * whether a date somebody is typing has already gone, and a "now" that is a
   * few minutes stale answers that identically.
   */
  const [mountedAt] = useState(() => Date.now());
  const [date, time] = splitValue(value);

  /**
   * The shape is checked before the value is parsed, because `new Date` is far
   * too forgiving: `new Date("2026-10")` is a perfectly good date in October,
   * so a half-typed value would render a confident confirmation line for a day
   * nobody chose.
   */
  const complete = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
  const asDate = complete ? new Date(value) : null;
  const valid = asDate !== null && !Number.isNaN(asDate.getTime());
  const isPast = valid && asDate.getTime() < mountedAt;

  function setDate(next: Date | undefined) {
    if (!next) return;
    // The time is kept. Picking a day should not silently reset an hour that
    // was already chosen, and 00:00 would be a plausible wrong answer rather
    // than an obvious one.
    onChange(`${toDateValue(next)}T${time || "06:00"}`);
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="2026-10-04T06:00"
          className="numeric w-48"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline">
              Pick a date
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={valid ? (asDate ?? undefined) : undefined}
              onSelect={setDate}
              defaultMonth={valid ? (asDate ?? undefined) : undefined}
              autoFocus
            />
          </PopoverContent>
        </Popover>
        <Input
          aria-label={`${label} time`}
          type="time"
          value={time}
          onChange={(e) => onChange(`${date || toDateValue(new Date())}T${e.target.value}`)}
          className="numeric w-32"
        />
      </div>

      {valid ? (
        <p className="text-sm text-muted-foreground">
          {formatEventDateTimeLong(BigInt(Math.floor(asDate.getTime() / 1000)))}
        </p>
      ) : null}

      {valid && isPast && warnIfPast ? (
        <p className="text-sm text-warning">
          That is in the past. Nothing stops you, but a race that already started reads as a
          mistake to anyone browsing.
        </p>
      ) : null}

      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function splitValue(value: string): [string, string] {
  const [date = "", time = ""] = value.split("T");
  return [date, time.slice(0, 5)];
}

/** Local calendar date as `YYYY-MM-DD`, never through toISOString (that is UTC). */
function toDateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
