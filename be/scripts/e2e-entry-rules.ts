/**
 * STE-51 + STE-52 — the entry rules and pass restore, against a running
 * deployment.
 *
 *     pnpm --filter be e2e:entry-rules https://api-sterun.jameshub.fun
 *
 * The flow the web app drives, over real HTTP, with records really entered on
 * testnet: a runner retries after an unconfirmed submit and is not locked out;
 * enters and confirms; gets their pass back on "another device" with the same
 * secret the scanner roster carries; a second wallet cannot read it; and the same
 * person entering again from that second wallet is refused, while a different
 * person is not.
 *
 * Needs STERUN_ADMIN_SECRET (testnet) in be/.env, because since STE-36 an event
 * can only be created by an allowlisted organiser. Every other account is a
 * throwaway funded by Friendbot, and the category is free, so no sUSD moves.
 *
 * It writes throwaway entries into the deployment's vault. The unconfirmed ones
 * are removed by the STE-50 sweep a day later; the confirmed ones stay, as they
 * would for a real runner.
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

async function friendbot(address: string, url: string): Promise<void> {
  const res = await fetch(`${url}?addr=${encodeURIComponent(address)}`);
  if (!res.ok) throw new Error(`friendbot failed for ${address}: ${res.status}`);
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const adminSecret = process.env.STERUN_ADMIN_SECRET;
  assert(adminSecret, "STERUN_ADMIN_SECRET is not set (be/.env, testnet only): create_event needs an allowlisted organiser");

  const contracts = { eventRegistry: config.addresses.eventRegistry, raceRecord: config.addresses.raceRecord };
  const sterun = new SterunClient({ ...TESTNET, contracts });
  log(`Sterun entry rules + pass restore — ${base}`);

  step("An unauthenticated pass request is refused");
  const anonymous = await fetch(`${base}/records/0/pass`);
  assert(anonymous.status === 401, `unauthenticated pass answered ${anonymous.status}`);
  log("  401");

  step("A throwaway organiser, event and free category on testnet");
  const organiser = Keypair.random();
  const runner = Keypair.random(); // the runner's wallet
  const secondWallet = Keypair.random(); // the same person, another wallet
  const unconfirmed = Keypair.random(); // enters on chain, never confirms
  for (const kp of [organiser, runner, secondWallet, unconfirmed]) {
    await friendbot(kp.publicKey(), config.network.friendbotUrl);
  }
  const asOrganiser = SterunClient.as(organiser);
  await sterun.addOrganiser(organiser.publicKey(), SterunClient.as(Keypair.fromSecret(adminSecret)));
  const { value: eventId } = await sterun.createEvent(
    {
      organiser: organiser.publicKey(),
      name: `Sterun entry rules e2e ${new Date().toISOString().slice(0, 10)}`,
      metadataHash: randomBytes(32).toString("hex"),
      uri: "https://sterun.xyz/events/entry-rules-e2e.json",
      startsAt: BigInt(Math.floor(Date.now() / 1000) + 86_400),
    },
    asOrganiser,
  );
  const { value: categoryId } = await sterun.addCategory(
    { eventId, code: "R5K", distanceM: 5_000, quota: 10, priceStroops: 0n },
    asOrganiser,
  );
  await sterun.setEventStatus(eventId, "Open", asOrganiser);
  log(`  event ${eventId}, category ${categoryId}, organiser ${organiser.publicKey()}`);

  // A fresh identity number per run, so a second run is not refused by the first.
  const idDigits = `3201${String(Date.now()).slice(-12)}`;
  const person = (address: string, nationalId: string, name = "Budi Santoso") => ({
    name,
    national_id: nationalId,
    emergency_contact: "+6281234567890",
    id_type: "national_id_card",
    bib_name: "BUDI E2E",
    email: "e2e-runner@example.com",
    phone: "+6281398765432",
    gender: "male",
    date_of_birth: "1990-05-17",
    emergency_contact_name: "Siti Rahayu",
    event_id: eventId,
    category_id: categoryId,
    runner_address: address,
  });
  const submit = async (kp: Keypair, body: Record<string, unknown>) =>
    fetch(`${base}/participants`, {
      method: "POST",
      headers: { ...(await signedHeaders(kp)), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const pass = async (tokenId: number, kp: Keypair) =>
    fetch(`${base}/records/${tokenId}/pass`, { headers: await signedHeaders(kp) });

  step("STE-51: a submit that is never paid does not lock the runner out");
  const firstTry = await submit(runner, person(runner.publicKey(), idDigits));
  assert(firstTry.status === 201, `first submit answered ${firstTry.status}`);
  const retry = await submit(runner, person(runner.publicKey(), idDigits));
  assert(retry.status === 201, `retry after an unconfirmed submit answered ${retry.status}`);
  const entry = (await retry.json()) as { participant_id: string; participant_hash: string; totp_secret: string };
  log("  201 twice for the same person while neither is confirmed");

  step("The runner enters on chain and confirms");
  const { value: tokenId } = await sterun.enter(
    { runner: runner.publicKey(), eventId, categoryId, participantHash: entry.participant_hash },
    SterunClient.as(runner),
  );
  const confirmed = await fetch(`${base}/participants/${entry.participant_id}/confirm`, {
    method: "POST",
    headers: { ...(await signedHeaders(runner)), "content-type": "application/json" },
    body: JSON.stringify({ token_id: tokenId, enter_tx_hash: randomBytes(32).toString("hex") }),
  });
  assert(confirmed.status === 200, `confirm answered ${confirmed.status}`);
  log(`  token ${tokenId} entered and confirmed`);

  step("STE-52: on another device, the same wallet gets its pass back");
  const restored = await pass(tokenId, runner);
  const restoredBody = (await restored.json()) as { token_id: number; totp_secret: string; bib_name: string };
  assert(restored.status === 200, `owner's pass answered ${restored.status}: ${JSON.stringify(restoredBody)}`);
  assert(restoredBody.totp_secret === entry.totp_secret, "restored secret differs from the one shown at submit");
  assert(restoredBody.bib_name === "BUDI E2E", `bib_name came back as ${restoredBody.bib_name}`);
  for (const leaked of ["Budi Santoso", idDigits, "+6281234567890", "e2e-runner@example.com"]) {
    assert(!JSON.stringify(restoredBody).includes(leaked), `pass response leaked ${leaked}`);
  }
  log(`  200, same secret as at submit, bib "${restoredBody.bib_name}", no PII`);

  step("Another wallet cannot read that pass");
  const stolen = await pass(tokenId, secondWallet);
  const stolenText = await stolen.text();
  assert(stolen.status === 403, `another wallet's pass request answered ${stolen.status}`);
  assert(!stolenText.includes(entry.totp_secret), "the 403 carried the secret");
  log("  403");

  step("STE-51: the same person entering again from that other wallet is refused");
  const formatted = `${idDigits.slice(0, 4)}-${idDigits.slice(4, 10)} ${idDigits.slice(10)}`;
  const again = await submit(secondWallet, person(secondWallet.publicKey(), formatted));
  const againBody = (await again.json()) as { error: string; message: string };
  assert(again.status === 409, `second entry answered ${again.status}`);
  assert(againBody.error === "already-entered", `expected already-entered, got ${againBody.error}`);
  assert(!JSON.stringify(againBody).includes(idDigits), "the 409 echoed the identity number");
  log(`  409 already-entered for "${formatted}" — "${againBody.message}"`);

  step("…and a different person from that wallet is not");
  const other = await submit(secondWallet, person(secondWallet.publicKey(), `${idDigits.slice(0, -1)}9`, "Siti Rahayu"));
  assert(other.status === 201, `a different person answered ${other.status}`);
  log("  201");

  step("STE-52: a record entered on chain but never confirmed has no pass");
  const pending = await submit(unconfirmed, person(unconfirmed.publicKey(), `55${idDigits.slice(2)}`, "Andi Wijaya"));
  assert(pending.status === 201, `third runner's submit answered ${pending.status}`);
  const pendingBody = (await pending.json()) as { participant_hash: string };
  const { value: pendingToken } = await sterun.enter(
    { runner: unconfirmed.publicKey(), eventId, categoryId, participantHash: pendingBody.participant_hash },
    SterunClient.as(unconfirmed),
  );
  const noPass = await pass(pendingToken, unconfirmed);
  const noPassBody = (await noPass.json()) as { error: string };
  assert(noPass.status === 404 && noPassBody.error === "no-pass", `unconfirmed pass answered ${noPass.status} ${noPassBody.error}`);
  log(`  token ${pendingToken}: 404 no-pass`);

  step("A token that does not exist on chain");
  const missing = await pass(4_000_000_000, runner);
  assert(missing.status === 404, `missing token answered ${missing.status}`);
  log("  404");

  step("The pass secret is the one the scanner roster carries (waiting for the poller)");
  let rosterSecret: string | undefined;
  for (let attempt = 0; attempt < 24 && !rosterSecret; attempt += 1) {
    const roster = await fetch(`${base}/events/${eventId}/roster`, { headers: await signedHeaders(organiser) });
    assert(roster.status === 200, `roster answered ${roster.status}`);
    const body = (await roster.json()) as { entries: { token_id: number; totp_secret: string }[] };
    rosterSecret = body.entries.find((e) => e.token_id === tokenId)?.totp_secret;
    if (!rosterSecret) await sleep(5_000);
  }
  assert(rosterSecret, `token ${tokenId} did not reach the roster within two minutes`);
  assert(rosterSecret === restoredBody.totp_secret, "roster secret differs from the restored pass");
  log("  roster and pass agree: the codes the phone shows are the codes the desk accepts");

  log("\n✓ one entry per person per race, and a pass restored only to its owner");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
