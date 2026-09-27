/**
 * Does this code belong to this runner, right now? (docs/specs/HASH_AND_TOTP.md §4.5)
 *
 * The whole check is local. The secret came down with the roster while there
 * was still signal, the clock is the phone's own, and the answer is an HMAC. No
 * part of a desk waits on a network, which is the point of the design.
 *
 * Two ways a code arrives, and they are not the same check:
 *
 *   - **From a QR**, the step comes with it. The pair is checked as a pair: a
 *     step outside tolerance is refused before anything is computed, because
 *     that is the forwarded-screenshot case and it deserves no maths.
 *   - **Typed by hand**, there is no step. Every step in the window is tried,
 *     which is the same 90 seconds of tolerance reached from the other side.
 *
 * `__tests__/verify.test.ts` runs this against the `verification` vectors in
 * docs/specs/vectors/totp.json, which is the same set the backend's
 * implementation answers.
 */
import { codeAt } from "@/lib/totp";

import { CODE_PATTERN } from "./payload";

export interface CodeCheck {
  secretHex: string;
  /** What the runner presented. Six characters or it is malformed. */
  code: string;
  /** The step the QR carried, or null when a volunteer typed the code. */
  step: number | null;
  /** The step the scanner's own clock is in. */
  nowStep: number;
  /** From the roster's `totp` block, not from a constant here. */
  toleranceSteps: number;
}

/** The steps a scanner will accept a code from, oldest first. */
export function stepWindow(nowStep: number, toleranceSteps: number): number[] {
  const steps: number[] = [];
  for (let offset = -toleranceSteps; offset <= toleranceSteps; offset++) {
    steps.push(nowStep + offset);
  }
  return steps;
}

/** True when the step the QR carried is one this scanner still accepts. */
export function stepIsCurrent(step: number, nowStep: number, toleranceSteps: number): boolean {
  return Math.abs(step - nowStep) <= toleranceSteps;
}

export async function verifyCode({
  secretHex,
  code,
  step,
  nowStep,
  toleranceSteps,
}: CodeCheck): Promise<boolean> {
  // Malformed before wrong. Five characters is what an implementation that held
  // the code as a number would send, and it is refused as a shape rather than
  // compared as a value (vf-08).
  if (!CODE_PATTERN.test(code)) return false;

  if (step !== null) {
    if (!stepIsCurrent(step, nowStep, toleranceSteps)) return false;
    return (await codeAt(secretHex, step)) === code;
  }

  for (const candidate of stepWindow(nowStep, toleranceSteps)) {
    if ((await codeAt(secretHex, candidate)) === code) return true;
  }
  return false;
}
