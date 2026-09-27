import { describe, expect, it } from "vitest";

import { cleanAddress, isRunnerAddress } from "@/modules/profile/lib/runner-address";

const VALID = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";

describe("isRunnerAddress", () => {
  it("accepts an account address, including one pasted with spaces around it", () => {
    expect(isRunnerAddress(VALID)).toBe(true);
    expect(isRunnerAddress(`  ${VALID}\n`)).toBe(true);
    expect(cleanAddress(`  ${VALID}\n`)).toBe(VALID);
  });

  it("catches one mistyped character by its checksum, not only by its length", () => {
    const typo = `${VALID.slice(0, 20)}${VALID[20] === "A" ? "B" : "A"}${VALID.slice(21)}`;
    expect(typo).toHaveLength(56);
    expect(typo.startsWith("G")).toBe(true);
    expect(isRunnerAddress(typo)).toBe(false);
  });

  it("refuses a contract id, which is an address but can never own a record", () => {
    expect(isRunnerAddress("CAPB6NQPRPYBQIBRYR2ISXLFPYAXY6U64GKLBBUCE6VFPLIUHOIASHJU")).toBe(false);
  });

  it("refuses what is plainly not an address", () => {
    for (const text of ["", "banana", VALID.toLowerCase(), VALID.slice(0, 55), `${VALID}A`]) {
      expect(isRunnerAddress(text), text).toBe(false);
    }
  });
});
