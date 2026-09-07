/**
 * A labelled input, built on the shadcn primitives.
 *
 * shadcn ships `Input` and `Label` and deliberately does not ship the pairing:
 * where the label sits, how a hint reads, whether an error appears under or
 * beside the field are product decisions, not library ones. This is that
 * decision, made once, so the console does not answer it differently on every
 * screen.
 *
 * `htmlFor` is not optional. The organiser console is form-heavy, and a label
 * you can click to focus is the difference between a form that feels built and
 * one that feels drawn.
 */
import type { InputHTMLAttributes, ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  /** Shown under the input. Say what the value is for, not what it looks like. */
  hint?: ReactNode;
}

export function Field({ id, label, hint, required, ...props }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        {required ? <RequiredMark /> : null}
      </Label>
      <Input id={id} required={required} {...props} />
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * The star is decoration; the word next to it is the part that works. A screen
 * reader saying "asterisk" tells nobody anything, and `required` on the input
 * alone is silent until somebody tries to submit.
 */
export function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-1 text-danger">
        *
      </span>
      <span className="sr-only">required</span>
    </>
  );
}

interface TextAreaFieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  value: string;
  rows?: number;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function TextAreaField({
  id,
  label,
  hint,
  value,
  rows = 4,
  placeholder,
  onChange,
}: TextAreaFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-input bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      />
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
