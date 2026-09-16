/**
 * The check-in code, against docs/specs/vectors/totp.json rather than against
 * our own output: the backend and the scanner compute the same numbers, and a
 * test that only agrees with itself proves none of that.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { codeAt, qrPayload, secondsLeft, timeStepOf } from "@/lib/totp";

const vectors = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../../docs/specs/vectors/totp.json"), "utf8"),
) as {
  vectors: {
    id: string;
    secret_hex: string;
    token_id: number;
    unix_seconds: number;
    time_step: number;
    expected_code: string;
    qr_payload: string;
  }[];
};

describe("the frozen vectors", () => {
  it.each(vectors.vectors.map((v) => [v.id, v] as const))("%s", async (_id, v) => {
    expect(timeStepOf(v.unix_seconds)).toBe(v.time_step);
    const code = await codeAt(v.secret_hex, v.time_step);
    expect(code).toBe(v.expected_code);
    expect(qrPayload(v.token_id, v.time_step, code)).toBe(v.qr_payload);
  });

  it("keeps a leading zero, because a code is six characters and never a number", async () => {
    const leading = vectors.vectors.find((v) => v.id === "tp-02-leading-zero")!;
    const code = await codeAt(leading.secret_hex, leading.time_step);
    expect(code).toHaveLength(6);
    expect(code.startsWith("0")).toBe(true);
    expect(qrPayload(7, leading.time_step, code)).toContain('"c":"079663"');
  });

  it("refuses a secret that is not 32 bytes of lowercase hex", async () => {
    await expect(codeAt("nope", 59070111)).rejects.toThrow(/64 lowercase hex/);
    await expect(codeAt("A".repeat(64), 59070111)).rejects.toThrow(/64 lowercase hex/);
  });
});

describe("the clock", () => {
  it("holds one step for its whole 30 seconds", () => {
    expect(timeStepOf(1772100000)).toBe(timeStepOf(1772100029));
    expect(timeStepOf(1772100030)).toBe(timeStepOf(1772100000) + 1);
  });

  it("counts the seconds left in the step, never zero", () => {
    expect(secondsLeft(1772100000)).toBe(30);
    expect(secondsLeft(1772100011)).toBe(19);
    expect(secondsLeft(1772100029)).toBe(1);
  });
});
