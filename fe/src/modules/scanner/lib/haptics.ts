/**
 * One pulse for HAND OVER, two for any refusal (design §2, decision 4).
 *
 * No sound: audio needs a tap to unlock on a phone, and a quiet field is not
 * the case being designed for. iOS ignores `navigator.vibrate`, which is
 * acceptable because the verdict already carries its meaning in the word, the
 * icon and the ground before touch or colour.
 */
import type { Verdict } from "./verdict";

export const HAND_OVER_PATTERN = [120];
export const REFUSED_PATTERN = [90, 70, 90];

export function vibrateFor(kind: Verdict["kind"]): void {
  try {
    navigator.vibrate?.(kind === "green" ? HAND_OVER_PATTERN : REFUSED_PATTERN);
  } catch {
    // A browser that exposes vibrate but refuses it outside a gesture. Nothing to do.
  }
}
