/**
 * STE-56 — a second batch, end to end against a running deployment.
 *
 *     pnpm --filter be e2e:quota https://api-sterun.jameshub.fun
 *
 * On testnet: a throwaway organiser raises a category's quota through
 * `SterunClient.increaseQuota`; the same number again is refused with
 * `QuotaNotIncreased(19)`; and the deployment's index then serves the new quota
 * together with the rise as a dated fact, which is what the event page and the
 * console read.
 *
 * Needs STERUN_ADMIN_SECRET (testnet) in be/.env: since STE-36 only an
 * allowlisted organiser can create an event. No sUSD moves.
 */
import { randomBytes } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { SterunClient, SterunContractError, TESTNET } from "@sterunxyz/sdk";
import { loadConfig } from "../src/config.js";
import { loadEnvFile } from "../src/env.js";

const base = (process.argv[2] ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
const log = (message: string) => console.log(message);
const step = (message: string) => console.log(`\n▸ ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

interface CategoryJson {
  category_id: number;
  quota: number;
  entered_count: number;
  quota_history: { previous: number; current: number; at: string; ledger: number; tx_hash: string }[];
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const adminSecret = process.env.STERUN_ADMIN_SECRET;
  assert(adminSecret, "STERUN_ADMIN_SECRET is not set (be/.env, testnet only)");

  const contracts = { eventRegistry: config.addresses.eventRegistry, raceRecord: config.addresses.raceRecord };
  const sterun = new SterunClient({ ...TESTNET, contracts });
  log(`Sterun second batch — ${base}`);

  step("A throwaway organiser publishes a 5K with 2 places");
  const organiser = Keypair.random();
  const funded = await fetch(`${config.network.friendbotUrl}?addr=${organiser.publicKey()}`);
  assert(funded.ok, `friendbot answered ${funded.status}`);
  const asOrganiser = SterunClient.as(organiser);
  await sterun.addOrganiser(organiser.publicKey(), SterunClient.as(Keypair.fromSecret(adminSecret)));
  const { value: eventId } = await sterun.createEvent(
    {
      organiser: organiser.publicKey(),
      name: `Sterun second batch e2e ${new Date().toISOString().slice(0, 10)}`,
      metadataHash: randomBytes(32).toString("hex"),
      uri: "https://sterun.xyz/events/quota-e2e.json",
      startsAt: BigInt(Math.floor(Date.now() / 1000) + 86_400),
    },
    asOrganiser,
  );
  const { value: categoryId } = await sterun.addCategory(
    { eventId, code: "Q5K", distanceM: 5_000, quota: 2, priceStroops: 0n },
    asOrganiser,
  );
  log(`  event ${eventId}, category ${categoryId}, quota 2`);

  step("It sells out and opens a second batch: quota 2 -> 3");
  const raised = await sterun.increaseQuota({ eventId, categoryId, newQuota: 3 }, asOrganiser);
  const onChain = await sterun.getCategory(eventId, categoryId);
  assert(onChain.quota === 3, `get_category says quota ${onChain.quota}, expected 3`);
  log(`  tx ${raised.txHash}, get_category quota ${onChain.quota}`);

  step("The same number again is refused: a quota only ever rises");
  let refusal: unknown;
  try {
    await sterun.increaseQuota({ eventId, categoryId, newQuota: 3 }, asOrganiser);
  } catch (error) {
    refusal = error;
  }
  assert(refusal instanceof SterunContractError, `expected a contract error, got ${String(refusal)}`);
  assert(refusal.code === 19, `expected code 19, got ${refusal.code} (${refusal.variant})`);
  log(`  reverted ${refusal.code} ${refusal.variant}`);

  step("The index serves the new quota and the rise as a dated fact (waiting for the poller)");
  let category: CategoryJson | undefined;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const res = await fetch(`${base}/events/${eventId}`);
    if (res.ok) {
      const body = (await res.json()) as { categories: CategoryJson[] };
      category = body.categories.find((c) => c.category_id === categoryId);
      if (category?.quota === 3 && category.quota_history.length === 1) break;
    }
    await sleep(5_000);
  }
  assert(category, `event ${eventId} category ${categoryId} never reached the index`);
  assert(category.quota === 3, `index says quota ${category.quota}, chain says 3`);
  const [rise] = category.quota_history;
  assert(rise && rise.previous === 2 && rise.current === 3, `history is ${JSON.stringify(category.quota_history)}`);
  assert(rise.tx_hash === raised.txHash, `history tx ${rise.tx_hash}, the raise was ${raised.txHash}`);
  log(`  quota ${category.quota}, history ${rise.previous} -> ${rise.current} at ${new Date(Number(rise.at) * 1000).toISOString()}, ledger ${rise.ledger}`);

  log("\n✓ a second batch is on chain, refused when it is not a rise, and shown as a dated fact");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
