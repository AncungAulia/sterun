/**
 * Argument parsing for `pnpm faucet`, in its own module so it can be tested.
 *
 * A CLI that silently accepts a typo is worse than one that refuses: this
 * moves money (well, testnet money) and prints secrets, so every unknown flag,
 * missing value and malformed amount is an error with a message that says what
 * to do instead.
 */
import { StrKey } from "@stellar/stellar-sdk";
import { STROOPS_PER_UNIT } from "../config.js";

export interface FaucetArgs {
  secret?: string;
  generate: boolean;
  amountStroops?: bigint;
  skipPayout: boolean;
  help: boolean;
}

export const USAGE = `sterun faucet — testnet sUSD

  pnpm faucet --new                      generate a keypair, fund + trustline + payout
  pnpm faucet --secret S...              top up an existing account
  pnpm faucet --new --no-payout          account + trustline only (no distributor key needed)
  pnpm faucet --secret S... --amount 25  pay out 25 sUSD instead of the default

Addresses come from docs/deployments.md; override with SUSD_ISSUER /
SUSD_DISTRIBUTOR / SUSD_SAC. Paying out needs SUSD_DISTRIBUTOR_SECRET.`;

/** sUSD units with up to 7 decimals -> stroops, without going through a float. */
export function stroopsFromDecimal(value: string): bigint {
  if (!/^\d+(\.\d{1,7})?$/.test(value)) {
    throw new Error(
      `amount must be sUSD units with up to 7 decimals, e.g. 25 or 2.5 — got ${JSON.stringify(value)}`,
    );
  }
  const [whole = "0", frac = ""] = value.split(".");
  return BigInt(whole) * STROOPS_PER_UNIT + BigInt(frac.padEnd(7, "0"));
}

export function parseFaucetArgs(argv: readonly string[]): FaucetArgs {
  const args: FaucetArgs = { generate: false, skipPayout: false, help: false };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--new":
        args.generate = true;
        break;
      case "--no-payout":
        args.skipPayout = true;
        break;
      case "--secret": {
        const v = argv[++i];
        if (v === undefined || v.startsWith("--")) throw new Error("--secret needs a value (S...)");
        // Checked here rather than deep inside the SDK. `--secret "$(stellar
        // keys secret some-typo)"` yields an empty string, and without this the
        // user gets a strkey stack trace from four frames down instead of being
        // told which argument was wrong.
        if (!StrKey.isValidEd25519SecretSeed(v)) {
          throw new Error(
            v === ""
              ? "--secret got an empty value — if it came from `stellar keys secret <name>`, that identity does not exist"
              : "--secret is not a valid Stellar secret seed (it should start with S and be 56 characters)",
          );
        }
        args.secret = v;
        break;
      }
      case "--amount": {
        const v = argv[++i];
        if (v === undefined || v.startsWith("--")) throw new Error("--amount needs a value");
        args.amountStroops = stroopsFromDecimal(v);
        break;
      }
      case "--help":
      case "-h":
        args.help = true;
        return args;
      default:
        throw new Error(`unknown argument ${JSON.stringify(a)} — try --help`);
    }
  }

  if (args.generate === (args.secret !== undefined)) {
    throw new Error("pass exactly one of --new or --secret S...");
  }
  if (args.amountStroops !== undefined && args.amountStroops <= 0n) {
    throw new Error("--amount must be greater than zero");
  }
  return args;
}
