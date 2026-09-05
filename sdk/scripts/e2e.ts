/**
 * STE-15 (C5) — the third-party scenario, run against live testnet.
 *
 * The ticket's acceptance criterion is a Node script that drives the whole
 * flow through the SDK and nothing else: create an event, add categories, open
 * it, enter, check in, publish a result, verify — with zero Rust, zero Stellar
 * CLI, and zero hand-built XDR. This is that script, and what it prints is
 * meant to be pasted into docs/deployments.md as evidence.
 *
 * ## What it proves that the unit tests cannot
 *
 * The unit tests drive fakes, so they prove the branches. They cannot prove the
 * fakes describe reality. This runs the same code against the deployed
 * contracts, so it proves the shapes: that a simulation really does carry
 * `Error(Contract, #N)` where errors.ts expects it, that a `u64` really does
 * arrive as a bigint, that `enter` really is one transaction, and that the
 * lifecycle guards really do refuse what INTERFACE.md says they refuse.
 *
 * ## Accounts
 *
 * Every actor is a fresh Friendbot account created here and thrown away, so a
 * run costs nothing, needs no secret from anybody's machine, and cannot exhaust
 * a shared quota. Notably it does NOT reuse the rehearsal event from STE-33:
 * that event's only category has one slot left, and spending it here would take
 * it from STE-25's mock race.
 *
 * ## The one leg that needs a secret
 *
 * A *paid* entry moves sUSD, and sUSD comes from the distributor. Without
 * SUSD_DISTRIBUTOR_SECRET the script runs everything else and says clearly that
 * it skipped the fee — it does not quietly pass a weaker test. With the secret,
 * it funds the runner, enters the paid category, and asserts the organiser's
 * balance rose by exactly the entry fee, which is what proves the SEP-41
 * transfer really happened inside the same atomic invocation.
 *
 *     pnpm --filter @sterun/sdk e2e
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { SterunClient } from "../src/client.js";
import { SterunContractError } from "../src/errors.js";
import { formatStroops } from "../src/types.js";
// The frozen reference implementation, imported rather than reimplemented: the
// participant_hash this script sends is then the same one the contract's own
// tests are pinned to, so a passing verify() means something.
// @ts-expect-error — a plain .mjs reference artefact with no type declarations.
import { participantHash } from "../../docs/specs/reference/node/verify-vectors.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RPC_URL = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const HORIZON_URL = process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const FRIENDBOT = process.env.STELLAR_FRIENDBOT_URL ?? "https://friendbot.stellar.org";
const PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET;
const ENTRY_FEE = 50_000_000n; // 5 sUSD, the rehearsal event's own price

const log = (message: string) => console.log(message);
const step = (message: string) => console.log(`\n▸ ${message}`);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

/**
 * Contract ids, from the environment or from the deploy evidence.
 *
 * Same rule as be/src/deployments.ts: docs/deployments.md is the record, and a
 * second hardcoded copy would drift from it the first time anything moved. The
 * parse is narrow and the result is strkey-validated, so a truncated or
 * prose-wrapped value fails here rather than at a live invocation.
 */
function contractIds(): { eventRegistry: string; raceRecord: string } {
  const doc = readFileSync(resolve(REPO_ROOT, "docs", "deployments.md"), "utf8");
  const fromDoc = (label: string): string => {
    for (const line of doc.split("\n")) {
      if (!new RegExp(`^\\|\\s*\\*\\*${label}\\*\\*`).test(line.trim())) continue;
      const match = /\bC[A-Z2-7]{55}\b/.exec(line);
      if (match && StrKey.isValidContract(match[0])) return match[0];
    }
    throw new Error(`docs/deployments.md has no valid ${label} contract address`);
  };
  return {
    eventRegistry: process.env.EVENT_REGISTRY ?? fromDoc("EventRegistry"),
    raceRecord: process.env.RACE_RECORD ?? fromDoc("RaceRecord"),
  };
}

async function friendbot(address: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT}?addr=${encodeURIComponent(address)}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`friendbot failed for ${address}: ${res.status} ${body.slice(0, 200)}`);
  }
}

async function newAccount(label: string): Promise<Keypair> {
  const kp = Keypair.random();
  await friendbot(kp.publicKey());
  log(`  ${label.padEnd(9)} ${kp.publicKey()}`);
  return kp;
}

/** Expect a revert, and expect it to be exactly this variant from this band. */
async function expectRevert(
  label: string,
  variant: string,
  source: string,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
  } catch (e) {
    assert(
      e instanceof SterunContractError,
      `${label}: expected a contract revert, got ${(e as Error).constructor.name}: ${(e as Error).message}`,
    );
    assert(
      e.variant === variant && e.source === source,
      `${label}: expected ${variant} (${source}), got ${e.variant} #${e.code} (${e.source})`,
    );
    log(`  ✓ ${label} → ${e.variant} #${e.code} (${e.source})`);
    return;
  }
  throw new Error(`ASSERTION FAILED: ${label}: expected ${variant}, but the call succeeded`);
}

async function main(): Promise<void> {
  const contracts = contractIds();
  log("Sterun SDK end-to-end — live testnet");
  log(`  RPC            ${RPC_URL}`);
  log(`  EventRegistry  ${contracts.eventRegistry}`);
  log(`  RaceRecord     ${contracts.raceRecord}`);

  step("Funding fresh accounts (Friendbot)");
  const organiser = await newAccount("organiser");
  const runner = await newAccount("runner");
  const scanner = await newAccount("scanner");

  // One client for every actor: the source account and the signer travel with
  // each call. This is what an organiser console does.
  const sterun = new SterunClient({ rpcUrl: RPC_URL, networkPassphrase: PASSPHRASE, contracts });
  const asOrganiser = SterunClient.as(organiser);
  const asRunner = SterunClient.as(runner);
  const asScanner = SterunClient.as(scanner);

  step("Sanity: the RaceRecord we are about to use is wired to this registry");
  const wired = await sterun.wiredRegistry();
  assert(
    wired === contracts.eventRegistry,
    `RaceRecord points at ${wired}, not at ${contracts.eventRegistry}`,
  );
  const feeToken = await sterun.feeToken();
  log(`  ✓ registry matches; entry fees are paid in ${feeToken}`);

  step("createEvent");
  const metadataHash = randomBytes(32).toString("hex");
  const created = await sterun.createEvent(
    {
      organiser: organiser.publicKey(),
      name: `Sterun SDK e2e ${new Date().toISOString().slice(0, 10)}`,
      metadataHash,
      uri: "https://sterun.xyz/events/sdk-e2e.json",
      startsAt: BigInt(Math.floor(Date.now() / 1000) + 86_400),
    },
    asOrganiser,
  );
  const eventId = created.value;
  log(`  ✓ event_id ${eventId} — tx ${created.txHash}`);

  step("addCategory ×2 (one free, one paid), quota 1 each");
  const freeCategory = (
    await sterun.addCategory(
      { eventId, code: "FUN5K", distanceM: 5_000, quota: 1, priceStroops: 0n },
      asOrganiser,
    )
  ).value;
  const paidCategory = (
    await sterun.addCategory(
      { eventId, code: "R10K", distanceM: 10_000, quota: 1, priceStroops: ENTRY_FEE },
      asOrganiser,
    )
  ).value;
  log(`  ✓ category ${freeCategory} free, category ${paidCategory} at ${formatStroops(ENTRY_FEE)} sUSD`);

  const participant = {
    name: "Sri Wahyuni",
    nationalId: "3204012509900001",
    emergencyContact: "+62 812-3456-7890",
  };
  const salt = randomBytes(32);
  const hash: string = participantHash(
    participant.name,
    participant.nationalId,
    participant.emergencyContact,
    salt,
  );
  log(`  participant_hash ${hash}`);

  step("Negative: a Draft event refuses entries");
  await expectRevert("enter while Draft", "EventNotOpen", "event-registry", () =>
    sterun.enter(
      { runner: runner.publicKey(), eventId, categoryId: freeCategory, participantHash: hash },
      asRunner,
    ),
  );

  step("setEventStatus → Open");
  const opened = await sterun.setEventStatus(eventId, "Open", asOrganiser);
  assert((await sterun.getEvent(eventId)).status === "Open", "event did not reach Open");
  log(`  ✓ open — tx ${opened.txHash}`);

  step("Negative: an illegal status transition is refused");
  await expectRevert("Open → Open", "InvalidStatus", "event-registry", () =>
    sterun.setEventStatus(eventId, "Open", asOrganiser),
  );

  step("enter (free category)");
  const entered = await sterun.enter(
    { runner: runner.publicKey(), eventId, categoryId: freeCategory, participantHash: hash },
    asRunner,
  );
  const tokenId = entered.value;
  log(`  ✓ token_id ${tokenId} — tx ${entered.txHash}`);

  step("recordsOf returns the new token, and the record reads back correctly");
  const owned = await sterun.recordsOf(runner.publicKey());
  assert(owned.includes(tokenId), `recordsOf ${owned} does not contain ${tokenId}`);
  const record = await sterun.recordOf(tokenId);
  assert(record.state === "Entered", `expected Entered, got ${record.state}`);
  assert(record.eventId === eventId, "record points at the wrong event");
  assert(record.categoryId === freeCategory, "record points at the wrong category");
  assert(record.participantHash === hash, "stored hash is not the one we sent");
  assert(record.claimedAt === null && record.finishTimeS === null, "a fresh entry has no result");
  assert((await sterun.ownerOf(tokenId)) === runner.publicKey(), "record has the wrong owner");
  log(`  ✓ bib ${record.bibNo}, state ${record.state}, owner is the runner`);

  step("Negative: the free category's single slot is now gone");
  const other = await newAccount("runner-2");
  await expectRevert("enter a full category", "QuotaFull", "event-registry", () =>
    sterun.enter(
      {
        runner: other.publicKey(),
        eventId,
        categoryId: freeCategory,
        participantHash: randomBytes(32).toString("hex"),
      },
      SterunClient.as(other),
    ),
  );

  step("Negative: a finish cannot be published before a race pack is collected");
  await expectRevert("recordFinish before claim", "InvalidState", "race-record", () =>
    sterun.recordFinish(tokenId, 3161, asOrganiser),
  );

  step("Negative: a device that is not allowlisted cannot check anyone in");
  assert(!(await sterun.isScanner(eventId, scanner.publicKey())), "scanner should not be allowed yet");
  await expectRevert("claim by a stranger", "NotAuthorized", "race-record", () =>
    sterun.claimRacepack(tokenId, scanner.publicKey(), asScanner),
  );

  step("addScanner, then claimRacepack from the volunteer device");
  await sterun.addScanner(eventId, scanner.publicKey(), asOrganiser);
  assert(await sterun.isScanner(eventId, scanner.publicKey()), "scanner was not allowlisted");
  const claimed = await sterun.claimRacepack(tokenId, scanner.publicKey(), asScanner);
  assert((await sterun.recordOf(tokenId)).state === "RacepackClaimed", "state did not advance");
  log(`  ✓ RacepackClaimed — tx ${claimed.txHash}`);

  step("Negative: the anti-double-racepack guard");
  await expectRevert("second claim", "AlreadyClaimed", "race-record", () =>
    sterun.claimRacepack(tokenId, scanner.publicKey(), asScanner),
  );

  step("recordFinish");
  const finished = await sterun.recordFinish(tokenId, 3161, asOrganiser);
  const final = await sterun.recordOf(tokenId);
  assert(final.state === "Finished", `expected Finished, got ${final.state}`);
  assert(final.finishTimeS === 3161, `expected 3161s, got ${final.finishTimeS}`);
  assert(final.claimedAt !== null && final.resultAt !== null, "timestamps missing on a finish");
  log(`  ✓ Finished in ${final.finishTimeS}s — tx ${finished.txHash}`);

  step("Negative: Finished is terminal");
  await expectRevert("dnf after finish", "InvalidState", "race-record", () =>
    sterun.recordDnf(tokenId, asOrganiser),
  );

  step("verify — the whole point of the protocol");
  assert(await sterun.verify(tokenId, hash), "verify rejected the correct hash");
  assert(
    !(await sterun.verify(tokenId, randomBytes(32).toString("hex"))),
    "verify accepted a wrong hash",
  );
  assert(!(await sterun.verify(999_999, hash)), "verify should be false, not throw, for no such token");
  log("  ✓ correct hash true, wrong hash false, unknown token false");

  step("Every read again through a client with no wallet at all");
  const anonymous = sterun.readOnly();
  const publicRecords = await anonymous.recordsOfDetailed(runner.publicKey());
  assert(publicRecords.length === 1 && publicRecords[0]?.state === "Finished", "public read failed");
  assert(await anonymous.verify(tokenId, hash), "wallet-free verify failed");
  const category = await anonymous.getCategory(eventId, freeCategory);
  assert(category.slotsLeft === 0, `expected a full category, got ${category.slotsLeft} left`);
  log("  ✓ profile page data, verification and directory reads need no signer");

  const paid = await paidLeg({
    sterun,
    contracts,
    eventId,
    paidCategory,
    organiser,
    asOrganiser,
  });

  step("Evidence for docs/deployments.md");
  log("```");
  log(`event_id            ${eventId}`);
  log(`organiser           ${organiser.publicKey()}`);
  log(`runner              ${runner.publicKey()}`);
  log(`scanner             ${scanner.publicKey()}`);
  log(`token_id (free)     ${tokenId}  bib ${record.bibNo}  Finished ${final.finishTimeS}s`);
  log(`createEvent         ${created.txHash}`);
  log(`setEventStatus Open ${opened.txHash}`);
  log(`enter               ${entered.txHash}`);
  log(`claimRacepack       ${claimed.txHash}`);
  log(`recordFinish        ${finished.txHash}`);
  if (paid) {
    log(`token_id (paid)     ${paid.tokenId}`);
    log(`enter (5 sUSD)      ${paid.txHash}`);
    log(`fee received        ${formatStroops(paid.received)} sUSD`);
  }
  log("```");

  log(`\n✅ SDK e2e passed${paid ? "" : " — WITHOUT the paid-entry leg (see above)"}`);
}

/**
 * The paid entry, when the distributor secret is available.
 *
 * This is the leg that exercises `enter`'s atomicity claim end to end: one
 * transaction, one signature from the runner, and inside it a SEP-41 transfer
 * the runner never signed separately. The proof is the organiser's balance,
 * read after the fact — if the fee moved, the sub-invocation ran inside the
 * same invocation that minted the record.
 */
async function paidLeg(args: {
  sterun: SterunClient;
  contracts: { eventRegistry: string; raceRecord: string };
  eventId: number;
  paidCategory: number;
  organiser: Keypair;
  asOrganiser: ReturnType<typeof SterunClient.as>;
}): Promise<{ tokenId: number; txHash: string; received: bigint } | null> {
  const secret = process.env.SUSD_DISTRIBUTOR_SECRET;
  if (!secret) {
    step("Paid entry — SKIPPED");
    log("  SUSD_DISTRIBUTOR_SECRET is not set, so there is no way to fund a runner with");
    log("  sUSD. Everything above ran; the SEP-41 transfer inside `enter` did not.");
    log("  Set it in be/.env and re-run to cover the fee path.");
    return null;
  }

  step("Paid entry (5 sUSD), fee moving runner → organiser inside `enter`");
  const horizon = new Horizon.Server(HORIZON_URL);
  const issuer = process.env.SUSD_ISSUER ?? issuerFromDeployments();
  const susd = new Asset("sUSD", issuer);
  const distributor = Keypair.fromSecret(secret);

  const runner = await newAccount("runner-p");
  // Both the runner and the organiser need a trustline: one to pay, one to be
  // paid. `enter` reverts atomically without them, which is correct behaviour
  // and a terrible first experience, so they are opened up front.
  for (const kp of [runner, args.organiser]) {
    const account = await horizon.loadAccount(kp.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
      .addOperation(Operation.changeTrust({ asset: susd }))
      .setTimeout(180)
      .build();
    tx.sign(kp);
    await horizon.submitTransaction(tx);
  }

  const distributorAccount = await horizon.loadAccount(distributor.publicKey());
  const payment = new TransactionBuilder(distributorAccount, {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(
      Operation.payment({ destination: runner.publicKey(), asset: susd, amount: "10.0000000" }),
    )
    .setTimeout(180)
    .build();
  payment.sign(distributor);
  await horizon.submitTransaction(payment);
  log(`  funded ${runner.publicKey()} with 10 sUSD`);

  const before = await susdBalance(horizon, args.organiser.publicKey(), susd);
  const entered = await args.sterun.enter(
    {
      runner: runner.publicKey(),
      eventId: args.eventId,
      categoryId: args.paidCategory,
      participantHash: randomBytes(32).toString("hex"),
    },
    SterunClient.as(runner),
  );
  const after = await susdBalance(horizon, args.organiser.publicKey(), susd);
  const received = after - before;

  assert(
    received === ENTRY_FEE,
    `organiser received ${formatStroops(received)} sUSD, expected ${formatStroops(ENTRY_FEE)}`,
  );
  log(`  ✓ token_id ${entered.value}, organiser received exactly ${formatStroops(received)} sUSD`);
  log(`  ✓ one transaction did quota + fee + mint — tx ${entered.txHash}`);

  return { tokenId: entered.value, txHash: entered.txHash, received };
}

function issuerFromDeployments(): string {
  const doc = readFileSync(resolve(REPO_ROOT, "docs", "deployments.md"), "utf8");
  for (const line of doc.split("\n")) {
    if (!/^\|\s*`?sterun-susd-issuer/.test(line.trim())) continue;
    const match = /\bG[A-Z2-7]{55}\b/.exec(line);
    if (match && StrKey.isValidEd25519PublicKey(match[0])) return match[0];
  }
  throw new Error("docs/deployments.md has no valid sUSD issuer address");
}

/** Trustline balance in stroops, read as integers — never through a float. */
async function susdBalance(
  horizon: Horizon.Server,
  address: string,
  susd: Asset,
): Promise<bigint> {
  const account = await horizon.loadAccount(address);
  const line = account.balances.find(
    (b) =>
      "asset_code" in b &&
      b.asset_code === susd.getCode() &&
      "asset_issuer" in b &&
      b.asset_issuer === susd.getIssuer(),
  );
  if (!line) return 0n;
  const [whole = "0", frac = ""] = line.balance.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(frac.padEnd(7, "0"));
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}`);
  if (e instanceof SterunContractError) {
    console.error(`   code #${e.code} (${e.source}) from ${e.method}`);
  }
  process.exitCode = 1;
});
