/**
 * STE-61 — two scanner desks claiming one runner's race pack at the same moment,
 * on live testnet, through the SDK.
 *
 *     pnpm --filter be e2e:claim-race
 *
 * The situation the offline scanner design exists for: two desks hand over a
 * pack to the same runner, and both sync together. The chain keeps one claim.
 * When both transactions are submitted before either lands, the losing one
 * simulates cleanly and then FAILS ON THE LEDGER. Before STE-61 the SDK threw
 * `SterunNetworkError: ... could not be simulated: Cannot read properties of
 * undefined (reading 'type')` for that, and the contract error was lost.
 *
 * This script creates the race, then claims one runner from both desks at once,
 * runner after runner, until a same-ledger loss happens, and asserts:
 *   - exactly one claim wins, and the record ends `RacepackClaimed`;
 *   - the loser throws `SterunContractError` `AlreadyClaimed` (#102), whether it
 *     lost at simulation or on the ledger;
 *   - a ledger loss carries its transaction hash and ledger, and RPC confirms
 *     that transaction FAILED.
 * If no same-ledger loss happens in MAX_RUNNERS attempts it FAILS rather than
 * passing on the easier case.
 *
 * Needs STERUN_ADMIN_SECRET (testnet) in be/.env. The category is free.
 */
import { randomBytes } from "node:crypto";
import { Keypair, rpc } from "@stellar/stellar-sdk";
import { SterunClient, SterunContractError, TESTNET } from "@sterunxyz/sdk";
import { loadConfig } from "../src/config.js";
import { loadEnvFile } from "../src/env.js";

const MAX_RUNNERS = 6;
const log = (message: string) => console.log(message);
const step = (message: string) => console.log(`\n▸ ${message}`);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const adminSecret = process.env.STERUN_ADMIN_SECRET;
  assert(adminSecret, "STERUN_ADMIN_SECRET is not set (be/.env, testnet only)");

  const contracts = { eventRegistry: config.addresses.eventRegistry, raceRecord: config.addresses.raceRecord };
  const sterun = new SterunClient({ ...TESTNET, contracts });
  const server = new rpc.Server(config.network.rpcUrl);
  const friendbot = async (address: string) => {
    const res = await fetch(`${config.network.friendbotUrl}?addr=${address}`);
    assert(res.ok, `friendbot answered ${res.status} for ${address}`);
  };
  log("Sterun two-desk claim race — live testnet");

  step("A throwaway organiser, a free race, and two scanner desks");
  const organiser = Keypair.random();
  const deskA = Keypair.random();
  const deskB = Keypair.random();
  for (const kp of [organiser, deskA, deskB]) await friendbot(kp.publicKey());
  const asOrganiser = SterunClient.as(organiser);
  await sterun.addOrganiser(organiser.publicKey(), SterunClient.as(Keypair.fromSecret(adminSecret)));
  const { value: eventId } = await sterun.createEvent(
    {
      organiser: organiser.publicKey(),
      name: `Sterun claim race e2e ${new Date().toISOString().slice(0, 10)}`,
      metadataHash: randomBytes(32).toString("hex"),
      uri: "https://sterun.xyz/events/claim-race-e2e.json",
      startsAt: BigInt(Math.floor(Date.now() / 1000) + 86_400),
    },
    asOrganiser,
  );
  const { value: categoryId } = await sterun.addCategory(
    { eventId, code: "C5K", distanceM: 5_000, quota: 20, priceStroops: 0n },
    asOrganiser,
  );
  await sterun.setEventStatus(eventId, "Open", asOrganiser);
  await sterun.addScanner(eventId, deskA.publicKey(), asOrganiser);
  await sterun.addScanner(eventId, deskB.publicKey(), asOrganiser);
  log(`  event ${eventId}, category ${categoryId}, desks ${deskA.publicKey().slice(0, 6)}… and ${deskB.publicKey().slice(0, 6)}…`);

  let ledgerLoss: SterunContractError | undefined;
  let simulationLosses = 0;

  for (let attempt = 1; attempt <= MAX_RUNNERS && !ledgerLoss; attempt += 1) {
    step(`Runner ${attempt}: enters, then both desks claim the pack at the same moment`);
    const runner = Keypair.random();
    await friendbot(runner.publicKey());
    const { value: tokenId } = await sterun.enter(
      { runner: runner.publicKey(), eventId, categoryId, participantHash: randomBytes(32).toString("hex") },
      SterunClient.as(runner),
    );

    const outcomes = await Promise.allSettled([
      sterun.claimRacepack(tokenId, deskA.publicKey(), SterunClient.as(deskA)),
      sterun.claimRacepack(tokenId, deskB.publicKey(), SterunClient.as(deskB)),
    ]);
    const won = outcomes.filter((o) => o.status === "fulfilled");
    const lost = outcomes.filter((o): o is PromiseRejectedResult => o.status === "rejected");
    assert(won.length === 1 && lost.length === 1, `token ${tokenId}: ${won.length} claims won, ${lost.length} lost`);

    const error = lost[0]!.reason as unknown;
    assert(
      error instanceof SterunContractError,
      `token ${tokenId}: the losing desk got ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}, not a contract error`,
    );
    assert(error.is("AlreadyClaimed", "race-record"), `token ${tokenId}: loser reverted ${error.variant} (#${error.code})`);

    const record = await sterun.recordOf(tokenId);
    assert(record.state === "RacepackClaimed", `token ${tokenId} ended ${record.state}`);

    if (error.phase === "ledger") {
      ledgerLoss = error;
      log(`  token ${tokenId}: one claim won; the other FAILED ON THE LEDGER with ${error.variant} (#${error.code})`);
      log(`  failed tx ${error.txHash}, ledger ${error.ledger}`);
    } else {
      simulationLosses += 1;
      log(`  token ${tokenId}: one claim won; the other was refused at simulation (${error.variant}) — no same-ledger race this time`);
    }
  }

  assert(
    ledgerLoss,
    `no same-ledger loss in ${MAX_RUNNERS} runners (${simulationLosses} refused at simulation instead); the race was not reproduced, so the fix is not proven`,
  );

  step("RPC confirms the losing transaction failed on the ledger");
  assert(ledgerLoss.txHash, "the ledger loss carried no transaction hash");
  const tx = await server.getTransaction(ledgerLoss.txHash);
  assert(tx.status === "FAILED", `RPC reports ${tx.status} for ${ledgerLoss.txHash}`);
  assert(!("ledger" in tx) || tx.ledger === ledgerLoss.ledger, `RPC ledger ${"ledger" in tx ? tx.ledger : "?"} vs error ${ledgerLoss.ledger}`);
  log(`  getTransaction ${ledgerLoss.txHash.slice(0, 12)}…: FAILED in ledger ${ledgerLoss.ledger}`);
  log(`  https://stellar.expert/explorer/testnet/tx/${ledgerLoss.txHash}`);

  log("\n✓ a desk that loses a same-ledger claim race gets AlreadyClaimed with the failed transaction, not a crash");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
