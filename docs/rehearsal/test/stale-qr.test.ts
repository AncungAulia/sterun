/**
 * STE-67 — the wait before the stale screenshot is presented is never shorter
 * than what the scanner enforces.
 *
 * Run: pnpm --filter be exec tsx --test ../docs/rehearsal/test/stale-qr.test.ts
 *
 * The boundary is checked against the pass's own step function
 * (fe/src/lib/totp) and the scanner's rule |step − now| ≤ toleranceSteps
 * (fe/src/modules/scanner/lib/verify.ts `stepIsCurrent`), restated here because
 * verify.ts resolves `@/` imports this runner cannot.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { timeStepOf } from "../../../fe/src/lib/totp";
import { FILMING_NOTE, STALE_QR_CLAIM, honestyNote, screenshotLife, staleFrom, waitUntilStale } from "../src/stale-qr";

const ROSTER = { stepSeconds: 30, toleranceSteps: 1 };
const accepted = (step: number, nowStep: number, tol: number) => Math.abs(step - nowStep) <= tol;

test("the last accepted second and the first refused one sit either side of staleFrom", () => {
  // The first, second and last second of one 30-second step.
  for (const takenAt of [1_790_000_010, 1_790_000_011, 1_790_000_039]) {
    const step = timeStepOf(takenAt);
    const boundary = staleFrom(step, ROSTER);
    assert.ok(accepted(step, timeStepOf(boundary - 1), ROSTER.toleranceSteps), "still accepted one second before");
    assert.ok(!accepted(step, timeStepOf(boundary), ROSTER.toleranceSteps), "refused at the boundary");
    const age = boundary - takenAt;
    assert.ok(age > 30 && age <= 60, `a screenshot taken at ${takenAt} lives ${age}s`);
  }
});

test("the tolerance comes from the roster, not from a constant", () => {
  const step = 59_666_666;
  assert.equal(staleFrom(step, { stepSeconds: 30, toleranceSteps: 2 }) - staleFrom(step, ROSTER), 30);
  assert.deepEqual(screenshotLife(ROSTER), { minSeconds: 30, maxSeconds: 60 });
  assert.deepEqual(screenshotLife({ stepSeconds: 30, toleranceSteps: 2 }), { minSeconds: 60, maxSeconds: 90 });
});

test("the wait reaches past the boundary and is never negative", () => {
  const step = timeStepOf(1_790_000_000);
  const now = 1_790_000_000 * 1000;
  const wait = waitUntilStale(step, ROSTER, now);
  assert.ok(timeStepOf((now + wait) / 1000) > step + ROSTER.toleranceSteps);
  assert.equal(waitUntilStale(step, ROSTER, now + 10 * 60_000), 0);
});

test("the wording admits a fresh screenshot passes and keeps the wait in the film", () => {
  const note = honestyNote(ROSTER);
  assert.match(note, new RegExp(STALE_QR_CLAIM));
  assert.match(note, /30–60 seconds of being taken DOES pass/);
  assert.match(note, /does NOT prove: that a forwarded QR is rejected/);
  assert.match(FILMING_NOTE, /Do not cut the wait/);
});
