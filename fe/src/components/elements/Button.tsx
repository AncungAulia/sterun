/**
 * Base button. Every value comes from a token in app/tokens.css; no raw hex,
 * font name or pixel value appears here (see fe/guides/ARCHITECTURE.md §6.3).
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  // Teal means actionable. That is the whole rule, so the default button is teal.
  primary: "bg-teal-500 text-paper hover:bg-teal-600 active:bg-teal-700 disabled:bg-n-300",
  secondary: "bg-n-100 text-n-800 hover:bg-n-200 active:bg-n-300 disabled:text-n-400",
  ghost: "bg-transparent text-teal-500 hover:bg-teal-50 active:bg-teal-100 disabled:text-n-400",
  danger: "bg-danger text-paper hover:opacity-90 active:opacity-80 disabled:bg-n-300",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-base",
  lg: "h-12 px-6 text-lg",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
