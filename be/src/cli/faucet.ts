#!/usr/bin/env tsx
/**
 * STE-6 — `pnpm faucet`. Gets a testnet account from nothing to holding
 * spendable sUSD, which is what every runner needs before `RaceRecord.enter`
 * will work for a paid category.
 *
 *   pnpm faucet --new                     # generate a keypair, fund it, print the secret
 *   pnpm faucet --secret S...             # top up an account you already have
 *   pnpm faucet --new --no-payout         # account + trustline only (no distributor key needed)
 *   pnpm faucet --secret S... --amount 25 # 25 sUSD instead of the default
 *
 * A generated secret is printed once and stored nowhere. That is deliberate: a
 * testnet key written to a file in the repo is a key that eventually gets
 * committed.
 */
import { Keypair } from "@stellar/stellar-sdk";
import { loadConfig } from "../config.js";
import { runFaucet } from "../faucet.js";
import { parseFaucetArgs, USAGE } from "./args.js";

let args;
try {
  args = parseFaucetArgs(process.argv.slice(2));
} catch (e) {
  console.error(`error: ${(e as Error).message}\n`);
  console.error(USAGE);
  process.exit(2);
}

if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

const config = loadConfig();

let secret = args.secret;
if (args.generate) {
  const kp = Keypair.random();
  secret = kp.secret();
  console.log("generated a new testnet keypair — the secret is printed once and saved nowhere:");
  console.log(`  public  ${kp.publicKey()}`);
  console.log(`  secret  ${secret}`);
  console.log();
}

console.log(`network   ${config.network.name}`);
console.log(`sUSD      sUSD:${config.addresses.susdIssuer}`);
console.log(`SAC       ${config.addresses.susdSac}`);
console.log();

const result = await runFaucet(config, {
  recipientSecret: secret as string,
  skipPayout: args.skipPayout,
  log: (m: string) => console.log(m),
  ...(args.amountStroops !== undefined ? { amountStroops: args.amountStroops } : {}),
});

console.log();
console.log(
  result.sacBalanceStroops > 0n
    ? `READY — ${result.address} can pay a sUSD entry fee.`
    : "Account and trustline are ready, but the balance is 0. Get sUSD before calling enter.",
);
console.log(`https://stellar.expert/explorer/testnet/account/${result.address}`);
