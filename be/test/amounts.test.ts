/**
 * sUSD is an i128 of stroops, 7 decimals. Every conversion here is integer-only
 * on purpose: a float round-trip of 0.1 sUSD is off by a stroop, and a stroop
 * off in an entry fee is a failed `enter` nobody can explain.
 */
import { describe, expect, it } from "vitest";
import { formatSusd } from "../src/config.js";
import { decimalFromStroops } from "../src/stellar.js";
import { stroopsFromDecimal } from "../src/cli/args.js";

describe("stroops <-> decimal", () => {
  it.each([
    ["0", 0n],
    ["1", 10_000_000n],
    ["25", 250_000_000n],
    ["2.5", 25_000_000n],
    ["0.0000001", 1n], // one stroop, the smallest unit that exists
    ["1000000", 10_000_000_000_000n], // the whole initial supply
  ])("parses %s sUSD as %s stroops", (decimal, stroops) => {
    expect(stroopsFromDecimal(decimal)).toBe(stroops);
  });

  it.each([
    [0n, "0.0000000"],
    [1n, "0.0000001"],
    [50_000_000n, "5.0000000"], // the entry fee used in the STE-33 rehearsal
    [10_000_000_000_000n, "1000000.0000000"],
  ])("renders %s stroops for Horizon as %s", (stroops, decimal) => {
    expect(decimalFromStroops(stroops)).toBe(decimal);
  });

  it("round-trips every amount it accepts", () => {
    for (const d of ["0", "1", "2.5", "0.0000001", "99999.9999999"]) {
      expect(decimalFromStroops(stroopsFromDecimal(d))).toBe(
        d.includes(".") ? d.padEnd(d.indexOf(".") + 8, "0") : `${d}.0000000`,
      );
    }
  });

  it.each(["", "abc", "-1", "1.2.3", "0.00000001", "1e7", " 1", "1 "])(
    "rejects %j rather than coercing it",
    (bad) => {
      expect(() => stroopsFromDecimal(bad)).toThrow(/up to 7 decimals/);
    },
  );

  it("formats for humans without trailing-zero noise", () => {
    expect(formatSusd(0n)).toBe("0");
    expect(formatSusd(50_000_000n)).toBe("5");
    expect(formatSusd(25_000_000n)).toBe("2.5");
    expect(formatSusd(1n)).toBe("0.0000001");
    expect(formatSusd(-50_000_000n)).toBe("-5");
  });
});
