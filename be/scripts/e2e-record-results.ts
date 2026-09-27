/**
 * STE-60 — many results for one event in one organiser signature, on live
 * testnet, through the SDK and the indexer's own decoder.
 *
 *     bash sc/scripts/throwaway-pair-testnet.sh e2e:record-results
 *
 * Run through that wrapper: it deploys a THROWAWAY pair built from this branch
 * (EventRegistry v2.5, RaceRecord v2.6), because the live pair is not upgraded
 * until the spec PR is approved. It hands over E2E_EVENT_REGISTRY,
 * E2E_RACE_RECORD and E2E_ADMIN_SECRET (the throwaway admin, never printed).
 *
 * What it asserts, against the real network:
 *   - a transaction of 121 timed rows is refused by the network and moves no
 *     record (simulation accepts it; the event-size limit is enforced on
 *     apply), the measurement behind RECORD_RESULTS_MAX_BATCH = 120;
 *   - a batch of 120 timed results lands in ONE transaction, every record ends
 *     Finished with its time, and the 120 record_finished events decode with
 *     be's decoder in row order;
 *   - a mixed batch (untimed, DNF after check-in, DNF no-show) lands too;
 *   - a batch with one unclaimed row is refused whole, one with a row from
 *     another event is ResultForAnotherEvent(108), a stranger cannot sign one,
 *     a replay of a recorded batch is InvalidState, and 121 rows are refused by
 *     the SDK before anything is signed.
 */
import { randomBytes } from "node:crypto";
import { BASE_FEE, Contract, Keypair, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";
import {
  RECORD_RESULTS_MAX_BATCH,
  SterunClient,
  SterunContractError,
  TESTNET,
  type SterunResult,
} from "@sterunxyz/sdk";
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

async function expectContractError(promise: Promise<unknown>, variant: string, what: string): Promise<SterunContractError> {
  try {
    await promise;
  } catch (error) {
    assert(
      error instanceof SterunContractError,
      `${what}: expected ${variant}, got ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
    );
    assert(error.variant === variant, `${what}: expected ${variant}, got ${error.variant} (#${error.code})`);
    return error;
  }
  throw new Error(`ASSERTION FAILED: ${what} succeeded, expected ${variant}`);
}

/** Runs `work` over `items` with at most `lanes` at a time, keeping order. */
async function inLanes<T, R>(items: T[], lanes: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await work(items[i]!, i);
      }
    }),
  );
  return out;
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
  log(`Sterun many results in one signature — throwaway RaceRecord ${contracts.raceRecord}`);

  const TIMED = RECORD_RESULTS_MAX_BATCH + 1;
  step(`One organiser, two races, five scanner desks, ${TIMED + 4} runners`);
  const organiser = Keypair.random();
  const stranger = Keypair.random();
  const desks = Array.from({ length: 5 }, () => Keypair.random());
  const runners = Array.from({ length: TIMED + 4 }, () => Keypair.random());
  await inLanes([organiser, stranger, ...desks, ...runners], 4, (kp) => friendbot(kp.publicKey()));
  const asOrganiser = SterunClient.as(organiser);
  await sterun.addOrganiser(organiser.publicKey(), SterunClient.as(admin));

  const race = async (label: string) => {
    const { value: eventId } = await sterun.createEvent(
      {
        organiser: organiser.publicKey(),
        name: `Sterun results e2e ${label} ${new Date().toISOString().slice(0, 10)}`,
        metadataHash: randomBytes(32).toString("hex"),
        uri: `https://sterun.xyz/events/results-e2e-${label}.json`,
        startsAt: BigInt(Math.floor(Date.now() / 1000) + 86_400),
      },
      asOrganiser,
    );
    const { value: categoryId } = await sterun.addCategory(
      { eventId, code: "C10K", distanceM: 10_000, quota: 200, priceStroops: 0n },
      asOrganiser,
    );
    await sterun.setEventStatus(eventId, "Open", asOrganiser);
    return { eventId, categoryId };
  };
  const mainRace = await race("main");
  const other = await race("other");
  for (const desk of desks) {
    await sterun.addScanner(mainRace.eventId, desk.publicKey(), asOrganiser);
    await sterun.addScanner(other.eventId, desk.publicKey(), asOrganiser);
  }
  log(`  race ${mainRace.eventId} and race ${other.eventId}; ${desks.length} desks allowlisted on both`);

  // TIMED timed, 1 untimed, 1 DNF after check-in, 1 no-show in the main race; 1 in the other race.
  const plan = runners.map((kp, i) => ({
    kp,
    race: i === TIMED + 3 ? other : mainRace,
    claim: i !== TIMED + 2,
  }));
  // One at a time: `enter` mints the next token id, which simulation picks and
  // puts in the footprint, so two entries landing in one ledger collide on it.
  // Check-ins touch different records and do run in parallel below.
  const tokens = await inLanes(plan, 1, ({ kp, race: r }) =>
    sterun
      .enter({ runner: kp.publicKey(), eventId: r.eventId, categoryId: r.categoryId, participantHash: randomBytes(32).toString("hex") }, SterunClient.as(kp))
      .then((sent) => sent.value),
  );
  const toClaim = plan.map((p, i) => ({ ...p, tokenId: tokens[i]! })).filter((p) => p.claim);
  await Promise.all(
    desks.map(async (desk, laneIndex) => {
      for (const p of toClaim.filter((_, i) => i % desks.length === laneIndex)) {
        await sterun.claimRacepack(p.tokenId, desk.publicKey(), SterunClient.as(desk));
      }
    }),
  );
  const timedTokens = tokens.slice(0, TIMED);
  const [untimedToken, droppedToken, noShowToken, otherRaceToken] = tokens.slice(TIMED).map((t) => t!) as [number, number, number, number];
  log(`  ${tokens.length} entered, ${toClaim.length} checked in; timed ${timedTokens[0]}..${timedTokens[TIMED - 1]}, untimed ${untimedToken}, DNF ${droppedToken}, no-show ${noShowToken}, other race ${otherRaceToken}`);

  const timedRows = (n: number): SterunResult[] =>
    timedTokens.slice(0, n).map((tokenId, i) => ({ tokenId, kind: "timed", finishTimeS: 86_399 - i }));

  step("What the network's own simulation reports for 1 and 120 timed rows");
  // Straight to RPC, not through the SDK, which refuses 121 before simulating.
  const organiserAccount = await server.getAccount(organiser.publicKey());
  const scRows = (n: number) =>
    timedRows(n).map((r) =>
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("outcome"),
          val: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Timed"), xdr.ScVal.scvU32(r.kind === "timed" ? r.finishTimeS : 0)]),
        }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("token_id"), val: xdr.ScVal.scvU32(r.tokenId) }),
      ]),
    );
  const simulate = async (n: number) => {
    const tx = new TransactionBuilder(organiserAccount, { fee: BASE_FEE, networkPassphrase: config.network.passphrase })
      .addOperation(new Contract(contracts.raceRecord).call("record_results", xdr.ScVal.scvU32(mainRace.eventId), xdr.ScVal.scvVec(scRows(n))))
      .setTimeout(60)
      .build();
    return server.simulateTransaction(tx);
  };
  for (const n of [1, RECORD_RESULTS_MAX_BATCH]) {
    const sim = await simulate(n);
    assert(!rpc.Api.isSimulationError(sim), `${n} rows did not simulate: ${rpc.Api.isSimulationError(sim) ? sim.error.split("\n")[0] : ""}`);
    const resources = sim.transactionData.build() as unknown as {
      resources?: { footprint?: { readOnly?: unknown[]; readWrite?: unknown[] }; instructions?: number; writeBytes?: number };
    };
    const fp = resources.resources?.footprint;
    log(
      `  ${String(n).padStart(3)} rows simulate: footprint ${fp?.readOnly?.length ?? "?"} read + ${fp?.readWrite?.length ?? "?"} written, ` +
        `${resources.resources?.instructions ?? "?"} instructions, ${resources.resources?.writeBytes ?? "?"} write bytes`,
    );
  }
  // Simulation does not enforce the event-size limit: 121 rows simulate
  // cleanly. The limit is enforced when the transaction is applied, so the
  // only real proof is to submit 121 and watch the network refuse it.
  step(`${TIMED} timed rows, submitted anyway: the network refuses them and no record moves`);
  const over = await simulate(TIMED);
  assert(!rpc.Api.isSimulationError(over), `${TIMED} rows did not even simulate: ${rpc.Api.isSimulationError(over) ? over.error.split("\n")[0] : ""}`);
  const overTx = rpc.assembleTransaction(
    new TransactionBuilder(await server.getAccount(organiser.publicKey()), { fee: BASE_FEE, networkPassphrase: config.network.passphrase })
      .addOperation(new Contract(contracts.raceRecord).call("record_results", xdr.ScVal.scvU32(mainRace.eventId), xdr.ScVal.scvVec(scRows(TIMED))))
      .setTimeout(60)
      .build(),
    over,
  ).build();
  overTx.sign(organiser);
  const submitted = await server.sendTransaction(overTx);
  let overOutcome: string;
  if (submitted.status === "ERROR" || submitted.status === "TRY_AGAIN_LATER") {
    const code = JSON.stringify(submitted.errorResult ?? "").match(/tx[A-Z][A-Za-z]+/)?.[0];
    overOutcome = `refused at submission (${submitted.status}${code ? `, ${code}` : ""})`;
  } else {
    let final = await server.getTransaction(submitted.hash);
    for (let i = 0; i < 30 && final.status === "NOT_FOUND"; i += 1) {
      await sleep(2_000);
      final = await server.getTransaction(submitted.hash);
    }
    assert(final.status !== "SUCCESS", `${TIMED} rows were RECORDED in ${submitted.hash}; the measured maximum of 120 is wrong`);
    assert(final.status === "FAILED", `${TIMED} rows: transaction ${submitted.hash} is ${final.status}`);
    const reason = JSON.stringify(final.resultXdr ?? "").match(/[A-Za-z]*[Rr]esource[A-Za-z]*|txFailed|invokeHostFunction[A-Za-z]*/)?.[0] ?? "no result code read";
    overOutcome = `FAILED on the ledger in ${submitted.hash} (${reason})`;
  }
  const untouched = await inLanes(timedTokens, 8, (tokenId) => sterun.recordOf(tokenId));
  assert(untouched.every((r) => r.state === "RacepackClaimed"), `a record moved after the ${TIMED}-row transaction was refused`);
  log(`  ${overOutcome}; all ${TIMED} records still RacepackClaimed`);

  step(`Refused before signing: ${TIMED} rows`);
  let refusedLocally = false;
  try {
    await sterun.recordResults(mainRace.eventId, timedRows(TIMED), asOrganiser);
  } catch (error) {
    refusedLocally = error instanceof RangeError && /at most 120/.test(error.message);
  }
  assert(refusedLocally, `${TIMED} rows were not refused before signing`);
  log("  RangeError: at most 120 results per call");

  step("Refused whole: an unclaimed row, a row from another race, a stranger's signature");
  await expectContractError(
    sterun.recordResults(mainRace.eventId, [...timedRows(2), { tokenId: noShowToken, kind: "timed", finishTimeS: 3_000 }], asOrganiser),
    "InvalidState",
    "a batch with an unclaimed timed row",
  );
  await expectContractError(
    sterun.recordResults(mainRace.eventId, [...timedRows(2), { tokenId: otherRaceToken, kind: "dnf" }], asOrganiser),
    "ResultForAnotherEvent",
    "a batch with a row from another race",
  );
  let strangerRecorded = false;
  try {
    await sterun.recordResults(mainRace.eventId, timedRows(2), SterunClient.as(stranger));
    strangerRecorded = true;
  } catch {
    // refused, as it should be
  }
  assert(!strangerRecorded, "a stranger recorded results");
  for (const tokenId of [...timedTokens.slice(0, 2), noShowToken, otherRaceToken]) {
    const state = (await sterun.recordOf(tokenId)).state;
    assert(state === (tokenId === noShowToken ? "Entered" : "RacepackClaimed"), `token ${tokenId} moved to ${state}`);
  }
  log("  InvalidState (#103), ResultForAnotherEvent (#108), stranger refused; no record moved");

  step(`${RECORD_RESULTS_MAX_BATCH} timed results in one transaction`);
  const batch = timedRows(RECORD_RESULTS_MAX_BATCH);
  const sent = await sterun.recordResults(mainRace.eventId, batch, asOrganiser);
  const landed = await server.getTransaction(sent.txHash);
  assert(landed.status === "SUCCESS", `the batch transaction is ${landed.status}`);
  const records = await inLanes(batch, 8, (row) => sterun.recordOf(row.tokenId));
  batch.forEach((row, i) => {
    assert(row.kind === "timed", "unexpected row kind");
    const record = records[i]!;
    assert(record.state === "Finished" && record.finishTimeS === row.finishTimeS, `token ${row.tokenId} ended ${record.state} ${record.finishTimeS}`);
  });
  log(`  tx ${sent.txHash} in ledger ${sent.ledger}; all ${batch.length} Finished with their times`);

  step("The events that transaction emitted, decoded by the indexer's own decoder");
  await sleep(6_000);
  const { events } = await server.getEvents({
    startLedger: sent.ledger ?? landed.latestLedger,
    filters: [{ type: "contract", contractIds: [contracts.raceRecord] }],
    limit: 200,
  });
  const finished = events
    .filter((e) => e.txHash === sent.txHash)
    .map((e) => decodeChainEvent(fromRpcEvent(e), contracts)?.event)
    .filter((e) => e?.name === "record_finished");
  assert(finished.length === batch.length, `decoded ${finished.length} record_finished events, not ${batch.length}`);
  finished.forEach((e, i) => {
    const row = batch[i]!;
    assert(
      e?.name === "record_finished" && e.tokenId === row.tokenId && row.kind === "timed" && e.finishTimeS === row.finishTimeS && e.eventId === mainRace.eventId,
      `event ${i} does not match row ${i}`,
    );
  });
  log(`  ${finished.length} record_finished, in row order, each matching its row`);

  step("A mixed batch: the last timed row, an untimed finish, a DNF after check-in, a no-show");
  const mixed: SterunResult[] = [
    { tokenId: timedTokens[TIMED - 1]!, kind: "timed", finishTimeS: 5_400 },
    { tokenId: untimedToken, kind: "untimed" },
    { tokenId: droppedToken, kind: "dnf" },
    { tokenId: noShowToken, kind: "dnf" },
  ];
  await sterun.recordResults(mainRace.eventId, mixed, asOrganiser);
  const [t47, u, d, n] = await Promise.all(mixed.map((r) => sterun.recordOf(r.tokenId)));
  assert(t47?.state === "Finished" && t47.finishTimeS === 5_400, "the last timed row");
  assert(u?.state === "Finished" && u.finishTimeS === null, "the untimed row");
  assert(d?.state === "Dnf" && d.claimedAt !== null, "the DNF after check-in");
  assert(n?.state === "Dnf" && n.claimedAt === null, "the no-show");
  log("  Finished 5400 s; Finished with no time; Dnf (checked in); Dnf (never checked in)");

  step("A replay of a recorded batch is refused");
  await expectContractError(sterun.recordResults(mainRace.eventId, mixed, asOrganiser), "InvalidState", "a replayed batch");
  log("  InvalidState (#103): results are terminal");

  log(`\n  https://stellar.expert/explorer/testnet/tx/${sent.txHash}`);
  log("\n✓ an organiser records a finish list 120 at a time, atomically, and the indexer reads what the chain emits");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
