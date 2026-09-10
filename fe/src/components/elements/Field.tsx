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

import { Help } from "@/components/elements/Help";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  /**
   * Shown under the input, and kept to what somebody has to type: the accepted
   * format, the limit, the shape. Anything longer belongs in `help`, which is
   * opened on purpose rather than read past. See `elements/Help.tsx`.
   */
  hint?: ReactNode;
  /** Why this field matters, behind an info button on the label. */
  help?: ReactNode;
  /** Shown instead of the hint, in red, once the field has been asked for. */
  error?: string;
}

export function Field({ id, label, hint, help, error, required, ...props }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <LabelRow htmlFor={id} label={label} required={required} help={help} />
      <Input id={id} required={required} aria-invalid={error ? true : undefined} {...props} />
      <FieldMessage hint={hint} error={error} />
    </div>
  );
}

/**
 * One line under a field: the error if there is one, otherwise the hint.
 *
 * Never both. A field that is wrong needs one sentence about what to do, and
 * stacking the original advice under it buries the part that changed.
 */
export function FieldMessage({ hint, error }: { hint?: ReactNode; error?: string }) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    );
  }
  return hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null;
}

/**
 * A label and its required star, as one element.
 *
 * One element on purpose: shadcn's Label is a flex row with `gap-2`, so a star
 * passed as a second child sits eight pixels away from the word it belongs to.
 *
 * The star is decoration; the word beside it is the part that works. A screen
 * reader saying "asterisk" tells nobody anything, and `required` on the input
 * alone is silent until somebody tries to submit.
 */
export function LabelText({ label, required }: { label: string; required?: boolean }) {
  return (
    <span>
      {label}
      {required ? (
        <>
          <span aria-hidden="true" className="text-danger">
            *
          </span>
          <span className="sr-only">required</span>
        </>
      ) : null}
    </span>
  );
}

interface TextAreaFieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  help?: ReactNode;
  error?: string;
  required?: boolean;
  value: string;
  rows?: number;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function TextAreaField({
  id,
  label,
  hint,
  help,
  error,
  required,
  value,
  rows = 4,
  placeholder,
  onChange,
}: TextAreaFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <LabelRow htmlFor={id} label={label} required={required} help={help} />
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-input bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      />
      <FieldMessage hint={hint} error={error} />
    </div>
  );
}

/**
 * A label and, when there is one, the info button that explains the field.
 *
 * One row rather than the button living inside `Label`: a `<label>` wrapping a
 * `<button>` means clicking the button also focuses the input, so the tooltip
 * opens and the caret jumps at the same time.
 */
export function LabelRow({
  htmlFor,
  label,
  required,
  help,
}: {
  htmlFor: string;
  label: string;
  required?: boolean;
  help?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={htmlFor}>
        <LabelText label={label} required={required} />
      </Label>
      {help ? <Help label={label}>{help}</Help> : null}
    </div>
  );
}
