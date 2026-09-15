/**
 * STE-59 — entering with two approvals, against a running deployment.
 *
 *     pnpm --filter be e2e:chain-link https://api-sterun.jameshub.fun
 *
 * The flow the web app moves to once the third approval is gone: a runner
 * submits their details (approval 1) and signs `enter` (approval 2), and never
 * calls confirm. The deployment's indexer links the vault row from the chain,
 * which this proves the only way a client can see it: the pass route, which
 * serves confirmed rows only, starts answering 200 with the secret shown at
 * submit. An older client that still calls confirm afterwards gets a success.
 *
 * Needs STERUN_ADMIN_SECRET (testnet) in be/.env for the throwaway event. Free
 * category, so no sUSD moves.
 */
import { randomBytes } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { SterunClient, TESTNET } from "@sterunxyz/sdk";
import { loadConfig } from "../src/config.js";
import { loadEnvFile } from "../src/env.js";

const base = (process.argv[2] ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
const log = (message: string) => console.log(message);
const step = (message: string) => console.log(`\n▸ ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

/** A spendable credential, signed the way a browser wallet signs (SEP-53). */
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
    "x-sterun-signature": Buffer.from(kp.signMessage(nonce)).toString("base64"),
  };
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const adminSecret = process.env.STERUN_ADMIN_SECRET;
  assert(adminSecret, "STERUN_ADMIN_SECRET is not set (be/.env, testnet only)");

  const contracts = { eventRegistry: config.addresses.eventRegistry, raceRecord: config.addresses.raceRecord };
  const sterun = new SterunClient({ ...TESTNET, contracts });
  log(`Sterun entry with two approvals — ${base}`);

  step("A throwaway organiser, event and free category on testnet");
  const organiser = Keypair.random();
  const runner = Keypair.random();
  for (const kp of [organiser, runner]) {
    const funded = await fetch(`${config.network.friendbotUrl}?addr=${kp.publicKey()}`);
    assert(funded.ok, `friendbot answered ${funded.status}`);
  }
  const asOrganiser = SterunClient.as(organiser);
  await sterun.addOrganiser(organiser.publicKey(), SterunClient.as(Keypair.fromSecret(adminSecret)));
  const { value: eventId } = await sterun.createEvent(
    {
      organiser: organiser.publicKey(),
      name: `Sterun two approvals e2e ${new Date().toISOString().slice(0, 10)}`,
      metadataHash: randomBytes(32).toString("hex"),
      uri: "https://sterun.xyz/events/chain-link-e2e.json",
      startsAt: BigInt(Math.floor(Date.now() / 1000) + 86_400),
    },
    asOrganiser,
  );
  const { value: categoryId } = await sterun.addCategory(
    { eventId, code: "L5K", distanceM: 5_000, quota: 5, priceStroops: 0n },
    asOrganiser,
  );
  await sterun.setEventStatus(eventId, "Open", asOrganiser);
  log(`  event ${eventId}, category ${categoryId}`);

  step("Approval 1: the runner submits their details");
  const submitted = await fetch(`${base}/participants`, {
    method: "POST",
    headers: { ...(await signedHeaders(runner)), "content-type": "application/json" },
    body: JSON.stringify({
      name: "Budi Santoso",
      national_id: `3201${String(Date.now()).slice(-12)}`,
      emergency_contact: "+6281234567890",
      id_type: "national_id_card",
      bib_name: "BUDI LINK",
      email: "e2e-link@example.com",
      phone: "+6281398765432",
      gender: "male",
      date_of_birth: "1990-05-17",
      emergency_contact_name: "Siti Rahayu",
      event_id: eventId,
      category_id: categoryId,
      runner_address: runner.publicKey(),
    }),
  });
  assert(submitted.status === 201, `submit answered ${submitted.status}`);
  const entry = (await submitted.json()) as { participant_id: string; participant_hash: string; totp_secret: string };
  log(`  201, participant ${entry.participant_id}`);

  step("Approval 2: the runner signs enter — and never calls confirm");
  const { value: tokenId } = await sterun.enter(
    { runner: runner.publicKey(), eventId, categoryId, participantHash: entry.participant_hash },
    SterunClient.as(runner),
  );
  log(`  token ${tokenId} entered on chain`);

  step("The indexer links the row: the pass route starts answering (waiting for the poller)");
  let pass: { token_id: number; totp_secret: string; bib_name: string | null } | undefined;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 30 && !pass; attempt += 1) {
    const res = await fetch(`${base}/records/${tokenId}/pass`, { headers: await signedHeaders(runner) });
    lastStatus = res.status;
    if (res.status === 200) pass = (await res.json()) as typeof pass;
    else await sleep(5_000);
  }
  assert(pass, `the pass never became available without confirm (last status ${lastStatus})`);
  assert(pass.totp_secret === entry.totp_secret, "the linked row's secret differs from the one shown at submit");
  log(`  200, same secret as at submit, bib "${pass.bib_name}" — linked with no third approval`);

  step("The row reads as confirmed to its owner");
  const summary = await fetch(`${base}/participants/${entry.participant_id}`, { headers: await signedHeaders(runner) });
  const summaryBody = (await summary.json()) as { token_id: number | null; confirmed_at: string | null };
  assert(summary.status === 200, `summary answered ${summary.status}`);
  assert(summaryBody.token_id === tokenId, `summary token ${summaryBody.token_id}, expected ${tokenId}`);
  assert(summaryBody.confirmed_at !== null, "summary has no confirmation time");
  log(`  token_id ${summaryBody.token_id}, confirmed_at ${summaryBody.confirmed_at}`);

  step("An older client that still calls confirm gets a success");
  const confirmed = await fetch(`${base}/participants/${entry.participant_id}/confirm`, {
    method: "POST",
    headers: { ...(await signedHeaders(runner)), "content-type": "application/json" },
    body: JSON.stringify({ token_id: tokenId, enter_tx_hash: randomBytes(32).toString("hex") }),
  });
  assert(confirmed.status === 200, `late confirm answered ${confirmed.status}`);
  log("  200");

  log("\n✓ an entry is linked from the chain with two approvals, and confirm stays safe to call");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
