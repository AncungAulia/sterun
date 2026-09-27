/**
 * A field a form still needs, and how to take somebody to it.
 *
 * Shared by the create wizard (`organiser/create/lib/missing.ts`) and the entry
 * form (`entry/lib/details.ts`), which split "empty" from "impossible" the same
 * way and both answer a pressed Continue by focusing the first gap rather than
 * disabling the button.
 */
export interface Missing {
  /** The key the form uses to mark the field. */
  field: string;
  /** The element to focus. Date fields focus their date button. */
  focusId: string;
  message: string;
}

/** Sends the person to a field rather than making them hunt for it. */
export function focusField(focusId: string): void {
  const element = document.getElementById(focusId);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.focus({ preventScroll: true });
}
