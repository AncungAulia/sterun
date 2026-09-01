/**
 * This CLI prints secret keys and moves testnet funds. A typo that parses as
 * something else is the failure mode worth spending tests on, so every
 * malformed invocation must be an error with a usable message — never a
 * silently different action.
 */
import { describe, expect, it } from "vitest";
import { parseFaucetArgs } from "../src/cli/args.js";

const SECRET = "SCZANGBA5YHTNYVVV4C3U252E2B6P6F5T3U6MM63WBSBZATAQI3EBTQ4";

describe("parseFaucetArgs", () => {
  it("accepts --new on its own", () => {
    expect(parseFaucetArgs(["--new"])).toMatchObject({ generate: true, skipPayout: false });
  });

  it("accepts --secret with a value", () => {
    expect(parseFaucetArgs(["--secret", SECRET]).secret).toBe(SECRET);
  });

  it("converts --amount to stroops without a float in the path", () => {
    expect(parseFaucetArgs(["--new", "--amount", "2.5"]).amountStroops).toBe(25_000_000n);
    expect(parseFaucetArgs(["--new", "--amount", "0.0000001"]).amountStroops).toBe(1n);
  });

  it("supports the no-key mode a third party can actually run", () => {
    expect(parseFaucetArgs(["--new", "--no-payout"]).skipPayout).toBe(true);
  });

  it("returns early for --help without demanding an account", () => {
    expect(parseFaucetArgs(["--help"]).help).toBe(true);
  });

  it.each([
    [[], /exactly one of --new or --secret/],
    [["--new", "--secret", SECRET], /exactly one of --new or --secret/],
    [["--secret"], /--secret needs a value/],
    // The trap this guards: `--secret --new` would otherwise swallow the next
    // flag as the key and then complain about something unrelated.
    [["--secret", "--new"], /--secret needs a value/],
    // Real failure seen while testing the CLI: `--secret "$(stellar keys
    // secret <typo>)"` passes an empty string, which used to surface as a
    // strkey stack trace from inside the SDK.
    [["--secret", ""], /identity does not exist/],
    [["--secret", "GDI4WAKUXYGH2KCQOCBCX2VYIZ74SKG3CUUYPOXADS7TB2RNRUERUXPQ"], /not a valid Stellar secret seed/],
    [["--secret", "SNOPE"], /not a valid Stellar secret seed/],
    [["--new", "--amount"], /--amount needs a value/],
    [["--new", "--amount", "-5"], /up to 7 decimals/],
    [["--new", "--amount", "0"], /greater than zero/],
    [["--new", "--amout", "5"], /unknown argument/],
    [["-x"], /unknown argument/],
  ])("rejects %j", (argv, message) => {
    expect(() => parseFaucetArgs(argv as string[])).toThrow(message);
  });
});
