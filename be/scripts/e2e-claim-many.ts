/**
 * STE-66 — a race pack desk hands over its whole offline queue in one
 * signature, on live testnet, through the SDK and the indexer's own decoder.
 *
 *     bash sc/scripts/throwaway-pair-testnet.sh e2e:claim-many
 *
 * Run through that wrapper: it deploys a THROWAWAY pair built from this branch
 * (EventRegistry v2.5, RaceRecord v2.7), because the live pair is not upgraded
 * until the spec PR is approved.
 *
 * What it asserts, against the real network:
 *   - a full queue of CLAIM_MAX_BATCH packs is handed over in ONE transaction,
 *     every record ends RacepackClaimed, and the events decode with be's
 *     decoder — one per pack, in row order;
 *   - the two-desk case does not break the queue: a pack another desk already
 *     claimed comes back as `not-entered`, a token id with no record as
 *     `not-found`, and every other pack in the same call still lands;
 *   - a desk that is not allowlisted for an event reverts the whole batch with
 *     NotAuthorized, moving nothing;
 *   - the SDK refuses an empty queue and one over the cap before signing.
 */
import { randomBytes } from "node:crypto";
import { Keypair, rpc } from "@stellar/stellar-sdk";
import { CLAIM_MAX_BATCH, SterunClient, SterunContractError, TESTNET } from "@sterunxyz/sdk";
import { decodeChainEvent, fromRpcEvent } from "../src/chain/events.js";
import { loadConfig } from "../src/config.js";
import { loadEnvFile } from "../src/env.js";

const log = (message: string) => console.log(message);
const step = (message: string) => console.log(`\n▸ ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function need(name: string): string {
  const value = process.env[name];
  assert(value, `${name} is not set; run this through sc/scripts/throwaway-pair-testnet.sh`);
  return value;
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const contracts = { eventRegistry: need("E2E_EVENT_REGISTRY"), raceRecord: need("E2E_RACE_RECORD") };
  const admin = Keypair.fromSecret(need("E2E_ADMIN_SECRET"));
  assert(
    contracts.raceRecord !== config.addresses.raceRecord,
    "E2E_RACE_RECORD is the live RaceRecord; this script must run against a throwaway deployment",
  );

  const sterun = new SterunClient({ ...TESTNET, contracts });
  const server = new rpc.Server(config.network.rpcUrl);
  const friendbot = async (address: string) => {
    for (let attempt = 1; ; attempt += 1) {
      const res = await fetch(`${config.network.friendbotUrl}?addr=${address}`);
      if (res.ok) return;
      assert(attempt < 4, `friendbot answered ${res.status} for ${address}`);
      await sleep(2_000 * attempt);
    }
  };
  log(`Sterun race packs in one signature — throwaway RaceRecord ${contracts.raceRecord}`);

  step(`One race, two desks, ${CLAIM_MAX_BATCH + 1} runners`);
  const organiser = Keypair.random();
  const deskA = Keypair.random();
  const deskB = Keypair.random();
  const outsider = Keypair.random();
  const runners = Array.from({ length: CLAIM_MAX_BATCH + 1 }, () => Keypair.random());
  // Every runner signs their own `enter`, so every runner needs an account.
  const fundable = [organiser, deskA, deskB, outsider, ...runners];
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < fundable.length) await friendbot(fundable[next++]!.publicKey());
    }),
  );
  const asOrganiser = SterunClient.as(organiser);
  await sterun.addOrganiser(organiser.publicKey(), SterunClient.as(admin));

  const race = async (label: string) => {
    const { value: eventId } = await sterun.createEvent(
      {
        organiser: organiser.publicKey(),
        name: `Sterun claim-many e2e ${label} ${new Date().toISOString().slice(0, 10)}`,
        metadataHash: randomBytes(32).toString("hex"),
        uri: `https://sterun.xyz/events/claim-many-${label}.json`,
        startsAt: BigInt(Math.floor(Date.now() / 1000) + 86_400),
      },
      asOrganiser,
    );
    const { value: categoryId } = await sterun.addCategory(
      { eventId, code: "C10K", distanceM: 10_000, quota: 500, priceStroops: 0n },
      asOrganiser,
    );
    await sterun.setEventStatus(eventId, "Open", asOrganiser);
    return { eventId, categoryId };
  };
  const main = await race("main");
  const other = await race("other");
  for (const desk of [deskA, deskB]) await sterun.addScanner(main.eventId, desk.publicKey(), asOrganiser);
  log(`  race ${main.eventId} (both desks allowlisted) and race ${other.eventId} (neither)`);

  // One at a time: `enter` mints the next token id, which simulation puts in the
  // footprint, so two entries landing in one ledger collide on it.
  const tokens: number[] = [];
  for (const [i, kp] of runners.entries()) {
    const where = i === runners.length - 1 ? other : main;
    const { value } = await sterun.enter(
      { runner: kp.publicKey(), eventId: where.eventId, categoryId: where.categoryId, participantHash: randomBytes(32).toString("hex") },
      SterunClient.as(kp),
    );
    tokens.push(value);
  }
  const queue = tokens.slice(0, CLAIM_MAX_BATCH);
  const inOtherRace = tokens[tokens.length - 1]!;
  log(`  ${tokens.length} entered: queue ${queue[0]}..${queue[queue.length - 1]}, one runner in the other race (${inOtherRace})`);

  step("Desk A hands one pack over first, the way a second desk's queue goes stale");
  await sterun.claimRacepack(queue[0]!, deskA.publicKey(), SterunClient.as(deskA));
  log(`  token ${queue[0]} is RacepackClaimed before desk B sends anything`);

  step("Refused before signing: an empty queue, and one over the cap");
  for (const [ids, pattern] of [
    [[], /at least one token id/],
    [[...queue, inOtherRace], /at most 100 race packs per call/],
  ] as const) {
    let refused = false;
    try {
      await sterun.claimRacepackMany(ids, deskB.publicKey(), SterunClient.as(deskB));
    } catch (error) {
      refused = error instanceof RangeError && pattern.test(error.message);
    }
    assert(refused, `a queue of ${ids.length} was not refused before signing`);
  }
  log("  RangeError for 0 and for 101 ids");

  step("A desk that is not allowlisted for the race reverts the whole batch");
  try {
    await sterun.claimRacepackMany([inOtherRace], deskB.publicKey(), SterunClient.as(deskB));
    throw new Error("ASSERTION FAILED: an unallowlisted desk claimed a pack");
  } catch (error) {
    assert(error instanceof SterunContractError, `expected NotAuthorized, got ${String(error)}`);
    assert(error.variant === "NotAuthorized", `expected NotAuthorized, got ${error.variant}`);
  }
  assert((await sterun.recordOf(inOtherRace)).state === "Entered", "the other race's record moved");
  log("  NotAuthorized (#104); the record did not move");

  step(`Desk B sends its whole queue of ${CLAIM_MAX_BATCH} in one signature`);
  // The queue holds the pack desk A already handed over, plus a token id from a
  // roster this race never had — exactly what a stale offline queue looks like.
  const withStrays = [...queue.slice(0, CLAIM_MAX_BATCH - 1), 999_999];
  const sent = await sterun.claimRacepackMany(withStrays, deskB.publicKey(), SterunClient.as(deskB));
  const landed = await server.getTransaction(sent.txHash);
  assert(landed.status === "SUCCESS", `the batch transaction is ${landed.status}`);
  assert(
    JSON.stringify(sent.value) ===
      JSON.stringify([
        { tokenId: queue[0], reason: "not-entered" },
        { tokenId: 999_999, reason: "not-found" },
      ]),
    `skipped rows were ${JSON.stringify(sent.value)}`,
  );
  log(`  tx ${sent.txHash} in ledger ${sent.ledger}`);
  log(`  skipped: ${sent.value.map((s) => `${s.tokenId} ${s.reason}`).join(", ")}`);

  const states = [];
  for (const tokenId of withStrays.slice(0, CLAIM_MAX_BATCH - 1)) states.push((await sterun.recordOf(tokenId)).state);
  assert(states.every((state) => state === "RacepackClaimed"), `a pack in the queue is ${states.find((s) => s !== "RacepackClaimed")}`);
  log(`  every one of the ${states.length} real packs is RacepackClaimed, including the ones after the two strays`);

  step("The events that transaction emitted, decoded by the indexer's own decoder");
  await sleep(6_000);
  const { events } = await server.getEvents({
    startLedger: sent.ledger ?? landed.latestLedger,
    filters: [{ type: "contract", contractIds: [contracts.raceRecord] }],
    limit: 200,
  });
  const claimed = events
    .filter((e) => e.txHash === sent.txHash)
    .map((e) => decodeChainEvent(fromRpcEvent(e), contracts)?.event)
    .filter((e) => e?.name === "racepack_claimed");
  const expected = withStrays.slice(1, CLAIM_MAX_BATCH - 1);
  assert(claimed.length === expected.length, `decoded ${claimed.length} racepack_claimed events, not ${expected.length}`);
  claimed.forEach((e, i) => {
    assert(
      e?.name === "racepack_claimed" && e.tokenId === expected[i] && e.operator === deskB.publicKey() && e.eventId === main.eventId,
      `event ${i} does not match row ${i}`,
    );
  });
  log(`  ${claimed.length} racepack_claimed, in row order, operator desk B, and nothing for the two skipped rows`);

  log(`\n  https://stellar.expert/explorer/testnet/tx/${sent.txHash}`);
  log("\n✓ a desk drains a 100-pack queue with one signature, and a stale row costs that row alone");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
