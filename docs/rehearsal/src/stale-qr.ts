/**
 * STE-67 — how long a QR screenshot stays usable, from the roster's own numbers.
 *
 * A desk accepts a code whose step is within `toleranceSteps` of its own step
 * (`stepIsCurrent` in fe/src/modules/scanner/lib/verify.ts: |step − now| ≤ tol).
 * A screenshot cannot come from the future, so only the backward half matters:
 * a code for step `s` is accepted up to the last second of step `s + tol`, and
 * refused from the first second of step `s + tol + 1`.
 *
 * With the roster's 30-second step and ±1 step that is 30 to 60 seconds after
 * the screenshot, depending on where in its step it was taken — and up to 90
 * if the desk's clock runs a step behind the phone's. The numbers are passed
 * in, never assumed: the rehearsal reads them from the roster the desk
 * downloaded, which is what the scanner itself reads.
 */

export interface TotpWindow {
  stepSeconds: number;
  toleranceSteps: number;
}

/** The first unix second at which a desk on the same clock refuses a code for `step`. */
export function staleFrom(step: number, totp: TotpWindow): number {
  return (step + totp.toleranceSteps + 1) * totp.stepSeconds;
}

/** The shortest and longest a screenshot stays usable, with the desk's clock agreeing. */
export function screenshotLife(totp: TotpWindow): { minSeconds: number; maxSeconds: number } {
  return {
    minSeconds: totp.toleranceSteps * totp.stepSeconds,
    maxSeconds: (totp.toleranceSteps + 1) * totp.stepSeconds,
  };
}

/**
 * Milliseconds to wait, from `nowMs`, until a code for `step` is refused, plus
 * a margin so the desk's own `Date.now()` is safely past the boundary. Never
 * negative, and never shorter than what the scanner enforces.
 */
export function waitUntilStale(step: number, totp: TotpWindow, nowMs: number, marginMs = 2_000): number {
  return Math.max(0, staleFrom(step, totp) * 1000 + marginMs - nowMs);
}

/**
 * What the step may claim, word for word. A forwarded screenshot shown quickly
 * enough DOES pass; the evidence must not say otherwise.
 */
export const STALE_QR_CLAIM =
  "a screenshot goes stale in under a minute, and even a fresh one can only be used once";

export function honestyNote(totp: TotpWindow): string {
  const { minSeconds, maxSeconds } = screenshotLife(totp);
  const window = (2 * totp.toleranceSteps + 1) * totp.stepSeconds;
  return (
    `What this step proves: ${STALE_QR_CLAIM}. What it does NOT prove: that a forwarded QR is rejected. ` +
    `The desk accepts the code's step ±${totp.toleranceSteps} (a ${window}-second window around its own clock), ` +
    `so a screenshot forwarded and shown within ${minSeconds}–${maxSeconds} seconds of being taken DOES pass ` +
    `(longer if the desk's clock runs behind the phone's). ` +
    `That does not help an attacker: the code turns over every ${totp.stepSeconds} seconds, so the screenshot is ` +
    `worthless within a minute, and a fresh one is worth exactly what the runner's own pass is worth: one claim on ` +
    `one record. Used by someone else it spends the runner's claim, not a new one — the runner is then refused ` +
    `"Already claimed" (5.1, 5.2), and if two offline desks both hand a pack over, that is the duplicate-collection ` +
    `case: the chain keeps one claim and the other desk flags it (6.1).`
  );
}

export const FILMING_NOTE =
  "FOR WHOEVER FILMS THIS: take the screenshot, WAIT on camera until the desk would refuse it, present it, " +
  "show the refusal. Do not cut the wait. Without the wait the clip shows a fresh screenshot being refused, " +
  "which the product does not do — a fresh screenshot passes (see above). Then show the runner's own live pass " +
  "being accepted at the next desk.";
