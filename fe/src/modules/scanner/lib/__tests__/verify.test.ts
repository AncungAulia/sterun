/**
 * The scanner's half of the frozen spec, against the `verification` vectors.
 *
 * That block exists for exactly this file: eight cases covering the same step,
 * one step either side, two steps either side, a leading zero, a wrong code and
 * a malformed one. The backend answers the same eight. A scanner that agreed
 * only with itself would be a scanner nobody could check.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { stepIsCurrent, stepWindow, verifyCode } from "@/modules/scanner/lib/verify";

const spec = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../../../../docs/specs/vectors/totp.json"), "utf8"),
) as {
  tolerance_steps: number;
  verification: {
    id: string;
    secret_hex: string;
    presented_code: string;
    presented_code_time_step: number | null;
    verify_at_time_step: number;
    expected_valid: boolean;
  }[];
};

const TOLERANCE = spec.tolerance_steps;

describe("the frozen verification vectors", () => {
  it.each(spec.verification.map((v) => [v.id, v] as const))("%s", async (_id, v) => {
    const valid = await verifyCode({
      secretHex: v.secret_hex,
      code: v.presented_code,
      step: v.presented_code_time_step,
      nowStep: v.verify_at_time_step,
      toleranceSteps: TOLERANCE,
    });
    expect(valid).toBe(v.expected_valid);
  });
});

describe("a code typed by hand, with no step to go on", () => {
  // The vectors that carry a step are the QR path. The same secret and code
  // must also verify when a volunteer reads six characters off a runner's
  // screen, because that is the fallback the spec names.
  const same = spec.verification.find((v) => v.id === "vf-01-same-step")!;
  const previous = spec.verification.find((v) => v.id === "vf-02-previous-step")!;
  const stale = spec.verification.find((v) => v.id === "vf-04-two-steps-old-rejected")!;

  it("accepts a code from any step inside the window", async () => {
    for (const v of [same, previous]) {
      const valid = await verifyCode({
        secretHex: v.secret_hex,
        code: v.presented_code,
        step: null,
        nowStep: same.verify_at_time_step,
        toleranceSteps: TOLERANCE,
      });
      expect(valid, v.id).toBe(true);
    }
  });

  it("still refuses one from outside it", async () => {
    const valid = await verifyCode({
      secretHex: stale.secret_hex,
      code: stale.presented_code,
      step: null,
      nowStep: stale.verify_at_time_step,
      toleranceSteps: TOLERANCE,
    });
    expect(valid).toBe(false);
  });
});

describe("a QR whose step and code disagree", () => {
  it("is refused, even though both halves are real", async () => {
    // A code from the previous step, presented as though it were this one. Both
    // values verify on their own; the pair does not, and the pair is what the
    // payload carries.
    const now = spec.verification.find((v) => v.id === "vf-01-same-step")!;
    const previous = spec.verification.find((v) => v.id === "vf-02-previous-step")!;

    const valid = await verifyCode({
      secretHex: now.secret_hex,
      code: previous.presented_code,
      step: now.verify_at_time_step,
      nowStep: now.verify_at_time_step,
      toleranceSteps: TOLERANCE,
    });
    expect(valid).toBe(false);
  });
});

describe("the window", () => {
  it("is the step either side, oldest first", () => {
    expect(stepWindow(59070000, 1)).toEqual([59069999, 59070000, 59070001]);
  });

  it("names which steps are still current", () => {
    expect(stepIsCurrent(59069999, 59070000, 1)).toBe(true);
    expect(stepIsCurrent(59070001, 59070000, 1)).toBe(true);
    expect(stepIsCurrent(59069998, 59070000, 1)).toBe(false);
    expect(stepIsCurrent(59070002, 59070000, 1)).toBe(false);
  });

  it("takes the tolerance it is given rather than assuming one", () => {
    // The roster sends `tolerance_steps`. A scanner that hardcoded 1 would
    // silently disagree with the backend the day that number changed.
    expect(stepWindow(59070000, 2)).toHaveLength(5);
    expect(stepIsCurrent(59069998, 59070000, 2)).toBe(true);
  });
});
