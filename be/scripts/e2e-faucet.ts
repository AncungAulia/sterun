/**
 * STE-49 — the web faucet, exercised end to end against a running deployment.
 *
 *     pnpm --filter be e2e:faucet https://api-sterun.jameshub.fun
 *
 * The same flow the web app's "Get test sUSD" button drives, with a throwaway
 * wallet made here: the route refuses an unauthenticated call; refuses a wallet
 * with no trustline and says so; pays once the trustline exists, and the payout
 * is visible through the SAC, which is the balance `enter` actually charges;
 * and refuses a second claim inside the window.
 *
 * Nothing is faked. The payment is a real testnet transaction from the
 * deployment's faucet account, so this spends one payout of the float each
 * run. No secret from anybody's machine is needed — the throwaway wallet is
 * funded by Friendbot.
 */
import { Keypair } from "@stellar/stellar-sdk";
import { loadConfig } from "../src/config.js";
import { loadEnvFile } from "../src/env.js";
import { StellarClient } from "../src/stellar.js";

const base = (process.argv[2] ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
const log = (message: string) => console.log(message);
const step = (message: string) => console.log(`\n▸ ${message}`);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

/** A spendable credential for `kp`, exactly as a wallet produces one. */
async function signedHeaders(kp: Keypair): Promise<Record<string, string>> {
  const res = await fetch(`${base}/auth/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: kp.publicKey() }),
  });
  assert(res.ok, `/auth/challenge answered ${res.status}`);
  const { nonce } = (await res.json()) as { nonce: string };
  return {
    "x-sterun-address": kp.publicKey(),
    "x-sterun-nonce": nonce,
    // Buffer.from: Keypair.sign returns a Uint8Array whose toString ignores "base64".
    "x-sterun-signature": Buffer.from(kp.sign(Buffer.from(nonce, "utf8"))).toString("base64"),
  };
}

const claim = async (headers: Record<string, string> = {}) =>
  fetch(`${base}/faucet`, { method: "POST", headers });

async function main(): Promise<void> {
  loadEnvFile();
  const stellar = new StellarClient(loadConfig());

  log(`Sterun web faucet — ${base}`);
  const config = (await (await fetch(`${base}/config`)).json()) as {
    faucet: { amountStroops: string; route: { available: boolean; reason: string | null } };
  };
  log(`  route ${JSON.stringify(config.faucet.route)}`);
  assert(config.faucet.route.available, `the faucet route is unavailable: ${config.faucet.route.reason}`);
  const amount = BigInt(config.faucet.amountStroops);

  step("An unauthenticated call is refused");
  const anonymous = await claim();
  assert(anonymous.status === 401, `unauthenticated claim answered ${anonymous.status}`);
  log("  401");

  const runner = Keypair.random();
  step(`A fresh wallet with XLM and no trustline: ${runner.publicKey()}`);
  await stellar.fundWithFriendbot(runner.publicKey());
  const noTrust = await claim(await signedHeaders(runner));
  const noTrustBody = (await noTrust.json()) as { error: string; message: string };
  assert(noTrust.status === 409, `no-trustline claim answered ${noTrust.status}`);
  assert(noTrustBody.error === "no-trustline", `expected no-trustline, got ${noTrustBody.error}`);
  log(`  409 no-trustline — "${noTrustBody.message}"`);

  step("The wallet opens its sUSD trustline, then asks");
  await stellar.ensureTrustline(runner.secret());
  const before = await stellar.sacBalance(runner.publicKey());
  const paid = await claim(await signedHeaders(runner));
  const paidBody = (await paid.json()) as { paid_stroops: string; tx_hash: string; next_claim_at: string };
  assert(paid.status === 200, `claim answered ${paid.status}: ${JSON.stringify(paidBody)}`);
  assert(paidBody.paid_stroops === amount.toString(), `paid ${paidBody.paid_stroops}, expected ${amount}`);
  log(`  200 paid ${paidBody.paid_stroops} stroops, tx ${paidBody.tx_hash}`);

  // Through the SAC: that is the balance RaceRecord.enter charges against.
  const after = await stellar.sacBalance(runner.publicKey());
  assert(after - before === amount, `SAC balance moved by ${after - before}, expected ${amount}`);
  log(`  SAC balance ${before} -> ${after}: the wallet can now pay an entry`);

  step("A second claim inside the window is refused, with when to come back");
  const again = await claim(await signedHeaders(runner));
  const againBody = (await again.json()) as { error: string; retry_at: string };
  assert(again.status === 429, `second claim answered ${again.status}`);
  assert(againBody.error === "rate-limited", `expected rate-limited, got ${againBody.error}`);
  assert(Number(again.headers.get("retry-after")) > 0, "429 carried no Retry-After");
  log(`  429 rate-limited, retry at ${againBody.retry_at}`);

  log("\n✓ the web faucet pays a trustlined wallet once, and says why when it does not");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
