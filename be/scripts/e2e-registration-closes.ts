/**
 * STE-46 — entries close on their own at the registration close date, on live
 * testnet, through the SDK and the indexer's own decoder and reader.
 *
 *     bash sc/scripts/registration-closes-testnet.sh
 *
 * Run through that wrapper: it deploys a THROWAWAY EventRegistry built from this
 * branch (v2.5) with a current RaceRecord, because the live pair is not upgraded
 * until the spec PR is approved. It hands over E2E_EVENT_REGISTRY,
 * E2E_RACE_RECORD and E2E_ADMIN_SECRET (the throwaway admin, never printed).
 *
 * What it asserts, against the real network:
 *   - an event starts with no date, and takes entries;
 *   - with a date set, an entry before it gets in, and one after it reverts
 *     RegistrationClosed(20) while the status is still Open;
 *   - a Closed event says EventNotOpen(4) whatever its date, and moving the
 *     status back to Open does not reopen it past the date;
 *   - a later date does reopen it, and the bib numbering continues;
 *   - the same date again is accepted and emits nothing; a stranger cannot move
 *     the date; an unknown event is EventNotFound(2);
 *   - the events the chain actually emitted decode with be's decoder, including
 *     `previous` as None the first time;
 *   - be's ChainReader reads the date back from the throwaway registry, and
 *     answers null against the LIVE v2.4 registry, where the function does not
 *     exist yet.
 */
import { randomBytes } from "node:crypto";
import { Keypair, rpc } from "@stellar/stellar-sdk";
import { SterunClient, SterunContractError, TESTNET } from "@sterunxyz/sdk";
import { decodeChainEvent, fromRpcEvent } from "../src/chain/events.js";
import { ChainReader, RpcContractCaller } from "../src/chain/reader.js";
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
  assert(value, `${name} is not set; run this through sc/scripts/registration-closes-testnet.sh`);
  return value;
}

async function expectContractError(
  promise: Promise<unknown>,
  variant: string,
  what: string,
): Promise<SterunContractError> {
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

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const contracts = { eventRegistry: need("E2E_EVENT_REGISTRY"), raceRecord: need("E2E_RACE_RECORD") };
  const admin = Keypair.fromSecret(need("E2E_ADMIN_SECRET"));
  assert(
    contracts.eventRegistry !== config.addresses.eventRegistry,
    "E2E_EVENT_REGISTRY is the live registry; this script must run against a throwaway deployment",
  );

  const sterun = new SterunClient({ ...TESTNET, contracts });
  const server = new rpc.Server(config.network.rpcUrl);
  const friendbot = async (address: string) => {
    const res = await fetch(`${config.network.friendbotUrl}?addr=${address}`);
    assert(res.ok, `friendbot answered ${res.status} for ${address}`);
  };
  log(`Sterun registration close date — throwaway EventRegistry ${contracts.eventRegistry}`);

  step("An organiser, a free race with one distance, open, no close date");
  const organiser = Keypair.random();
  const stranger = Keypair.random();
  const runners = [Keypair.random(), Keypair.random(), Keypair.random(), Keypair.random()];
  for (const kp of [organiser, stranger, ...runners]) await friendbot(kp.publicKey());
  const asOrganiser = SterunClient.as(organiser);
  const startLedger = (await server.getLatestLedger()).sequence;

  await sterun.addOrganiser(organiser.publicKey(), SterunClient.as(admin));
  const { value: eventId } = await sterun.createEvent(
    {
      organiser: organiser.publicKey(),
      name: `Sterun close date e2e ${new Date().toISOString().slice(0, 10)}`,
      metadataHash: randomBytes(32).toString("hex"),
      uri: "https://sterun.xyz/events/close-date-e2e.json",
      startsAt: BigInt(Math.floor(Date.now() / 1000) + 7 * 86_400),
    },
    asOrganiser,
  );
  const { value: categoryId } = await sterun.addCategory(
    { eventId, code: "C5K", distanceM: 5_000, quota: 20, priceStroops: 0n },
    asOrganiser,
  );
  await sterun.setEventStatus(eventId, "Open", asOrganiser);
  assert((await sterun.getRegistrationCloses(eventId)) === null, "a new event already has a close date");
  log(`  event ${eventId}, category ${categoryId}; getRegistrationCloses → null`);

  const enter = (kp: Keypair) =>
    sterun.enter(
      { runner: kp.publicKey(), eventId, categoryId, participantHash: randomBytes(32).toString("hex") },
      SterunClient.as(kp),
    );

  const first = await enter(runners[0]!);
  const chainNow = (await sterun.recordOf(first.value)).enteredAt;
  log(`  runner 1 entered with no date: token ${first.value}, ledger clock ${chainNow}`);

  step("A close date 45 seconds ahead of the ledger clock: before it, entries still get in");
  const closesAt = chainNow + 45n;
  const set = await sterun.setRegistrationCloses(eventId, closesAt, asOrganiser);
  assert((await sterun.getRegistrationCloses(eventId)) === closesAt, "getRegistrationCloses did not return the date");
  const second = await enter(runners[1]!);
  const secondRecord = await sterun.recordOf(second.value);
  assert(secondRecord.enteredAt < closesAt, `runner 2 entered at ${secondRecord.enteredAt}, not before ${closesAt}`);
  log(`  set_registration_closes ${closesAt} (tx ${set.txHash.slice(0, 12)}…); runner 2 entered at ${secondRecord.enteredAt}, bib ${secondRecord.bibNo}`);

  step("Past the date: RegistrationClosed(20), and the status is still Open");
  while (BigInt(Math.floor(Date.now() / 1000)) < closesAt + 15n) await sleep(3_000);
  const closed = await expectContractError(enter(runners[2]!), "RegistrationClosed", "entry after the date");
  assert(closed.code === 20 && closed.source === "event-registry", `wrong code or band: #${closed.code} ${closed.source}`);
  assert((await sterun.getEvent(eventId)).status === "Open", "the status moved on its own");
  log(`  enter → ${closed.variant} (#${closed.code}, ${closed.source}); status still Open`);

  step("Closed says EventNotOpen whatever the date; Open again does not reopen past the date");
  await sterun.setEventStatus(eventId, "Closed", asOrganiser);
  await expectContractError(enter(runners[2]!), "EventNotOpen", "entry to a Closed event");
  await sterun.setEventStatus(eventId, "Open", asOrganiser);
  await expectContractError(enter(runners[2]!), "RegistrationClosed", "entry after reopening past the date");
  log("  Closed → EventNotOpen (#4); Open again → still RegistrationClosed (#20)");

  step("A later date is the extension that reopens it, and the bibs continue");
  const extended = closesAt + 7n * 86_400n;
  const extend = await sterun.setRegistrationCloses(eventId, extended, asOrganiser);
  const third = await enter(runners[2]!);
  const thirdRecord = await sterun.recordOf(third.value);
  assert(thirdRecord.bibNo === secondRecord.bibNo + 1, `bib ${thirdRecord.bibNo} after ${secondRecord.bibNo}`);
  log(`  extended to ${extended} (tx ${extend.txHash.slice(0, 12)}…); runner 3 entered, bib ${thirdRecord.bibNo}`);

  step("The same date again, a stranger, an unknown event");
  await sterun.setRegistrationCloses(eventId, extended, asOrganiser);
  let strangerMoved = false;
  try {
    await sterun.setRegistrationCloses(eventId, 1n, SterunClient.as(stranger));
    strangerMoved = true;
  } catch (error) {
    log(`  stranger refused: ${error instanceof Error ? error.name : String(error)}`);
  }
  assert(!strangerMoved, "a stranger moved the close date");
  assert((await sterun.getRegistrationCloses(eventId)) === extended, "the date changed after the refusals");
  await expectContractError(sterun.getRegistrationCloses(999_999), "EventNotFound", "an unknown event");
  log("  same date accepted; date unchanged; getRegistrationCloses(999999) → EventNotFound (#2)");

  step("What the chain emitted, decoded by the indexer's own decoder");
  await sleep(8_000);
  const { events } = await server.getEvents({
    startLedger,
    filters: [{ type: "contract", contractIds: [contracts.eventRegistry] }],
    limit: 200,
  });
  const decoded = events
    .map((e) => decodeChainEvent(fromRpcEvent(e), contracts))
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .map((e) => e.event)
    .filter((e) => e.name === "registration_closes_set");
  assert(
    JSON.stringify(decoded, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)) ===
      JSON.stringify([
        { name: "registration_closes_set", eventId, previous: null, current: closesAt.toString() },
        { name: "registration_closes_set", eventId, previous: closesAt.toString(), current: extended.toString() },
      ]),
    `expected exactly two moves, got ${JSON.stringify(decoded, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v))}`,
  );
  log(`  ${decoded.length} registration_closes_set: null → ${closesAt}, ${closesAt} → ${extended} (the repeat emitted nothing)`);

  step("The indexer's reader: the throwaway registry, and the live v2.4 one");
  const caller = new RpcContractCaller(config.network.rpcUrl, config.network.passphrase, admin.publicKey());
  const throwawayReader = new ChainReader(caller, contracts);
  assert((await throwawayReader.registrationCloses(eventId)) === extended, "ChainReader read a different date");
  const liveReader = new ChainReader(caller, {
    eventRegistry: config.addresses.eventRegistry,
    raceRecord: config.addresses.raceRecord,
  });
  assert((await liveReader.registrationCloses(0)) === null, "the live v2.4 registry did not read as null");
  log(`  throwaway: ${extended}; live ${config.addresses.eventRegistry.slice(0, 8)}… (v2.4, no such function): null`);

  log(`\n  https://stellar.expert/explorer/testnet/contract/${contracts.eventRegistry}`);
  log("\n✓ entries stop at the close date, only a later date reopens them, and the indexer reads what the chain emits");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
