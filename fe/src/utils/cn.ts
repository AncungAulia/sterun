/**
 * Merge Tailwind classes so a later one wins over an earlier one of the same
 * kind, which is what makes a `className` prop able to override a variant.
 *
 * Required by every shadcn component. Kept in `utils/` rather than `lib/`
 * because it is a pure string function with no knowledge of chain, backend or
 * storage (ARCHITECTURE.md §4.7), and `components.json` points at it.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
