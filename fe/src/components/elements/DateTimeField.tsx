"use client";

/**
 * A date and time, picked from a calendar or typed, with the result read back
 * in words.
 *
 * ## Why not the native input alone
 *
 * `datetime-local` is correct and ugly, and it shows `2026-10-04T06:00` back to
 * you, which is exactly the format a wrong month hides in. `starts_at` cannot
 * be changed after `create_event`, so the confirmation line under this field is
 * not decoration: it names the weekday, and a date entered one month off stops
 * looking plausible the moment it says the wrong day.
 *
 * ## Why the text input stays
 *
 * The calendar is an assist, not the only way in. The input is a real labelled
 * text field, so it can be typed, pasted, tabbed to and read by a screen
 * reader, and the calendar is a button beside it. Replacing the field with a
 * grid of buttons is how date pickers become unusable by keyboard.
 *
 * ## Why react-day-picker, and why none of its CSS
 *
 * Keyboard navigation, focus management and the accessible names for a month
 * grid are a lot to get right, and getting them wrong is invisible until
 * somebody who needs them tries. The library brings that. Its stylesheet is not
 * imported: every class here comes from app/tokens.css, so the calendar cannot
 * quietly introduce a colour or a size that is not Nabil's.
 */
import { useState } from "react";
import { DayPicker } from "react-day-picker";

import { formatEventDateTimeLong } from "@/utils/format";

interface DateTimeFieldProps {
  id: string;
  label: string;
  /** `YYYY-MM-DDTHH:mm`, the same shape `datetime-local` produces. */
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  /** Warn when the moment is already gone. Used for the gun start. */
  warnIfPast?: boolean;
}

const CALENDAR_CLASSES = {
  root: "text-sm text-ink",
  months: "flex flex-col",
  month: "flex flex-col gap-2",
  month_caption: "flex h-8 items-center justify-center",
  caption_label: "heading-strong text-base text-n-700",
  nav: "flex items-center justify-between",
  button_previous: "h-8 rounded-md px-2 text-teal-500 hover:bg-teal-50",
  button_next: "h-8 rounded-md px-2 text-teal-500 hover:bg-teal-50",
  month_grid: "w-full border-collapse",
  weekdays: "text-n-500",
  weekday: "h-8 w-9 text-xs font-medium",
  week: "",
  day: "p-0 text-center",
  day_button:
    "numeric h-9 w-9 rounded-md hover:bg-teal-50 disabled:cursor-not-allowed disabled:text-n-300",
  today: "font-medium text-teal-600",
  selected: "bg-teal-500 text-paper hover:bg-teal-600",
  outside: "text-n-400",
  disabled: "text-n-300",
  hidden: "invisible",
};

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
   * the organiser never chose.
   */
  const complete = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
  const asDate = complete ? new Date(value) : null;
  const valid = asDate !== null && !Number.isNaN(asDate.getTime());
  const isPast = valid && asDate.getTime() < mountedAt;

  function setDate(next: Date | undefined) {
    if (!next) return;
    // The time is kept. Picking a day should not silently reset an hour that
    // was already chosen, and 00:00 for a race start would be a plausible
    // wrong answer rather than an obvious one.
    onChange(`${toDateValue(next)}T${time || "06:00"}`);
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-n-700">
        {label}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="2026-10-04T06:00"
          className="numeric h-10 w-52 rounded-md border border-n-300 bg-paper px-3 text-base text-ink placeholder:text-n-400"
        />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-calendar`}
          onClick={() => setOpen((was) => !was)}
          className="h-10 rounded-md border border-n-300 bg-n-100 px-3 text-base text-n-700 hover:bg-n-200"
        >
          {open ? "Close calendar" : "Pick a date"}
        </button>
        <input
          aria-label={`${label} time`}
          type="time"
          value={time}
          onChange={(e) => onChange(`${date || toDateValue(new Date())}T${e.target.value}`)}
          className="numeric h-10 rounded-md border border-n-300 bg-paper px-3 text-base text-ink"
        />
      </div>

      {open ? (
        <div
          id={`${id}-calendar`}
          className="mt-2 w-fit rounded-lg border border-n-200 bg-paper p-3 shadow-lifted"
        >
          <DayPicker
            mode="single"
            selected={valid ? (asDate ?? undefined) : undefined}
            onSelect={setDate}
            defaultMonth={valid ? (asDate ?? undefined) : undefined}
            showOutsideDays
            classNames={CALENDAR_CLASSES}
          />
        </div>
      ) : null}

      {valid ? (
        <p className="text-sm text-n-600">
          {formatEventDateTimeLong(BigInt(Math.floor(asDate.getTime() / 1000)))}
        </p>
      ) : null}

      {valid && isPast && warnIfPast ? (
        <p className="text-sm text-warning">
          That is in the past. Nothing stops you, and the contract will store it, but a race that
          already started reads as a mistake on the directory.
        </p>
      ) : null}

      {hint ? <p className="text-sm text-n-500">{hint}</p> : null}
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
