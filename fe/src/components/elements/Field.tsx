/**
 * A labelled input. Every value from a token in app/tokens.css.
 *
 * The label is a real `<label>` bound by id rather than a styled span: the
 * organiser console is a form-heavy surface, and a label you can click to focus
 * is the difference between a form that feels built and one that feels drawn.
 */
import type { InputHTMLAttributes, ReactNode } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  /** Shown under the input. Say what the value is for, not what it looks like. */
  hint?: ReactNode;
}

export function Field({ id, label, hint, className = "", ...props }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-n-700">
        {label}
      </label>
      <input
        id={id}
        className={`h-10 rounded-md border border-n-300 bg-paper px-3 text-base text-ink placeholder:text-n-400 ${className}`}
        {...props}
      />
      {hint ? <p className="text-sm text-n-500">{hint}</p> : null}
    </div>
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
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-n-700">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-n-300 bg-paper px-3 py-2 text-base text-ink placeholder:text-n-400"
      />
      {hint ? <p className="text-sm text-n-500">{hint}</p> : null}
    </div>
  );
}
