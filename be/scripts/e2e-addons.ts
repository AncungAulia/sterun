/**
 * STE-17 — race pack add-ons, exercised against live testnet.
 *
 * The acceptance question this answers is not "does the column exist" but the
 * one the feature was built for: **can an organiser count what to order?**
 * Migration 005 keeps `add_ons` unencrypted precisely so the answer is yes, and
 * that trade is only worth making if the whole path works — a runner picks a
 * size at submit, the entry is confirmed against a real on-chain record, and
 * the choice comes back out in the roster in bulk.
 *
 * Nothing here is faked except the socket: the chain is testnet, the database
 * is Postgres, and the request goes through the same Fastify instance
 * `pnpm dev` serves. `inject()` rather than a port because a port would add a
 * race and prove nothing extra.
 *
 *     docker compose up -d postgres
 *     DATABASE_URL=... PII_KEYS=... pnpm --filter be e2e:addons
 *
 * Every account is a throwaway Friendbot account, so this needs no secret from
 * anybody's machine. The category is free (`price_stroops = 0`), which skips
 * the SEP-41 transfer: the fee path is not what this script is about.
 */
import { randomBytes } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { Pool } from "pg";
import { SterunClient, TESTNET } from "@sterun/sdk";
import { ChallengeStore } from "../src/auth.js";
import { ChainReader, RpcContractCaller } from "../src/chain/reader.js";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/db/migrate.js";
import { Indexer } from "../src/indexer/indexer.js";
import { RpcEventSource } from "../src/indexer/source.js";
import { loadEnvFile } from "../src/env.js";
import { buildServer } from "../src/server.js";
import { Vault } from "../src/vault.js";

const log = (message: string) => console.log(message);
const step = (message: string) => console.log(`\n▸ ${message}`);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function friendbot(address: string, url: string): Promise<void> {
  const res = await fetch(`${url}?addr=${encodeURIComponent(address)}`);
  if (!res.ok) throw new Error(`friendbot failed for ${address}: ${res.status}`);
}

/**
 * The contract admin. Since STE-36 `create_event` is gated on the admin's
 * organiser allowlist, so a throwaway organiser has to be granted access
 * before it can create anything — an organiser cannot grant it to itself,
 * which is the point of the gate.
 */
function adminKeypair(): Keypair {
  const secret = process.env.STERUN_ADMIN_SECRET;
  if (!secret) {
    throw new Error(
      "STERUN_ADMIN_SECRET is not set. Since STE-36 `create_event` needs the admin's " +
        "organiser allowlist, so this script cannot create an event without it. It is the " +
        "sterun-admin secret from the repo root .env (testnet only).",
    );
  }
  return Keypair.fromSecret(secret);
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  assert(config.vault, "set DATABASE_URL and PII_KEYS (see be/.env.example)");

  const contracts = {
    eventRegistry: config.addresses.eventRegistry,
    raceRecord: config.addresses.raceRecord,
  };
  log("Sterun race pack add-ons — live testnet");
  log(`  EventRegistry  ${contracts.eventRegistry}`);

  step("Funding a throwaway organiser and two runners");
  const organiser = Keypair.random();
  const runners = [Keypair.random(), Keypair.random()];
  for (const kp of [organiser, ...runners]) {
    await friendbot(kp.publicKey(), config.network.friendbotUrl);
  }
  log(`  organiser ${organiser.publicKey()}`);

  const sterun = new SterunClient({ ...TESTNET, contracts });
  const asOrganiser = SterunClient.as(organiser);

  step("Allowlisting the throwaway organiser (admin, STE-36)");
  await sterun.addOrganiser(organiser.publicKey(), SterunClient.as(adminKeypair()));
  assert(
    await sterun.isOrganiser(organiser.publicKey()),
    "the organiser is still not on the allowlist after add_organiser",
  );

  step("Creating an event with one free category");
  const { value: eventId } = await sterun.createEvent(
    {
      organiser: organiser.publicKey(),
      name: `Sterun add-ons e2e ${new Date().toISOString().slice(0, 10)}`,
      metadataHash: randomBytes(32).toString("hex"),
      uri: "https://sterun.xyz/events/addons-e2e.json",
      startsAt: BigInt(Math.floor(Date.now() / 1000) + 86_400),
    },
    asOrganiser,
  );
  const categoryId = (
    await sterun.addCategory(
      { eventId, code: "A10K", distanceM: 10_000, quota: 5, priceStroops: 0n },
      asOrganiser,
    )
  ).value;
  await sterun.setEventStatus(eventId, "Open", asOrganiser);
  log(`  event ${eventId}, category ${categoryId}`);

  const pool = new Pool({ connectionString: config.vault.databaseUrl });
  await migrate(pool);
  const reader = new ChainReader(
    new RpcContractCaller(
      config.network.rpcUrl,
      config.network.passphrase,
      config.indexer.simulationSource,
    ),
    config.addresses,
  );
  const challenges = new ChallengeStore();
  const app = buildServer(config, {
    pool,
    vault: new Vault(pool, config.vault.keyring),
    reader,
    challenges,
  });
  await app.ready();

  /** A spendable credential, signed the way a browser wallet signs (SEP-53). */
  const credentials = async (kp: Keypair): Promise<Record<string, string>> => {
    const { nonce } = await challenges.issue(kp.publicKey());
    return {
      "x-sterun-address": kp.publicKey(),
      "x-sterun-nonce": nonce,
      "x-sterun-signature": Buffer.from(kp.signMessage(nonce)).toString("base64"),
    };
  };

  step("Two runners submit PII, each picking different add-ons");
  /**
   * Deliberately different choices, and one runner picking nothing. Counting an
   * order is the point, so a fixture where everyone picks the same thing would
   * pass even if the column were ignored and a constant returned.
   */
  const picks = [
    [
      { item: "Event jersey", choice: "L" },
      { item: "Cap", choice: "One size" },
    ],
    [{ item: "Event jersey", choice: "S" }],
  ];

  const participantIds: string[] = [];
  const hashes: string[] = [];
  for (const [i, runner] of runners.entries()) {
    const response = await app.inject({
      method: "POST",
      url: "/participants",
      headers: { ...(await credentials(runner)), "content-type": "application/json" },
      payload: {
        name: i === 0 ? "Budi Santoso" : "Siti Rahayu",
        national_id: `320123456789000${i}`,
        emergency_contact: `+62812345678${i}0`,
        event_id: eventId,
        category_id: categoryId,
        runner_address: runner.publicKey(),
        add_ons: picks[i],
      },
    });
    assert(response.statusCode === 201, `submit ${i} answered ${response.statusCode}`);

    const body = response.json();
    // The submit response is the one place secrets are shown, and it must not
    // start echoing anything else back.
    for (const forbidden of ["name", "national_id", "emergency_contact", "add_ons"]) {
      assert(!(forbidden in body), `submit response must not carry ${forbidden}`);
    }
    participantIds.push(body.participant_id);
    hashes.push(body.participant_hash);
  }
  log(`  ${participantIds.length} participants submitted`);

  step("Entering both on-chain with the hashes the vault issued");
  const tokens: number[] = [];
  for (const [i, runner] of runners.entries()) {
    const { value: tokenId } = await sterun.enter(
      {
        runner: runner.publicKey(),
        eventId,
        categoryId,
        participantHash: hashes[i] as string,
      },
      SterunClient.as(runner),
    );
    tokens.push(tokenId);

    const confirmed = await app.inject({
      method: "POST",
      url: `/participants/${participantIds[i]}/confirm`,
      headers: { ...(await credentials(runner)), "content-type": "application/json" },
      payload: { token_id: tokenId, enter_tx_hash: randomBytes(32).toString("hex") },
    });
    assert(confirmed.statusCode === 200, `confirm ${i} answered ${confirmed.statusCode}`);
  }
  log(`  tokens ${tokens.join(", ")} entered and confirmed`);

  step("Indexing from contract state");
  /**
   * Not optional, and the reason is the roster's shape: it walks the INDEXED
   * records and looks each one's vault material up by token id. The vault rows
   * exist the moment `confirm` returns, but a roster built from them alone
   * would be a list of entries the chain has not been asked about. So an
   * unindexed event has an empty roster — correct, and confusing enough the
   * first time that it is worth this comment.
   */
  const indexer = new Indexer(
    pool,
    reader,
    new RpcEventSource(config.network.rpcUrl, [
      config.addresses.eventRegistry,
      config.addresses.raceRecord,
    ]),
    config.addresses,
  );
  await indexer.rebuild();
  log("  rebuild complete");

  step("The organiser reads the roster and counts the order");
  const roster = await app.inject({
    method: "GET",
    url: `/events/${eventId}/roster`,
    headers: await credentials(organiser),
  });
  assert(roster.statusCode === 200, `roster answered ${roster.statusCode}`);
  const entries = roster.json().entries as Array<{
    token_id: number;
    add_ons: Array<{ item: string; choice: string }>;
    name_fragment: string | null;
  }>;
  assert(entries.length === 2, `roster carried ${entries.length} entries, expected 2`);

  const byToken = new Map(entries.map((e) => [e.token_id, e]));
  for (const [i, tokenId] of tokens.entries()) {
    const entry = byToken.get(tokenId);
    assert(entry, `roster is missing token ${tokenId}`);
    assert(
      JSON.stringify(entry.add_ons) === JSON.stringify(picks[i]),
      `token ${tokenId} carried ${JSON.stringify(entry.add_ons)}, expected ${JSON.stringify(picks[i])}`,
    );
  }
  log("  each runner's choices came back against the right token");

  // The reason the column is unencrypted: an order has to be countable.
  const sizes = entries
    .flatMap((e) => e.add_ons)
    .filter((a) => a.item === "Event jersey")
    .reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.choice]: (acc[a.choice] ?? 0) + 1 }), {});
  assert(sizes.L === 1 && sizes.S === 1, `jersey count wrong: ${JSON.stringify(sizes)}`);
  log(`  jersey order countable from one request: ${JSON.stringify(sizes)}`);

  step("And the roster still carries no PII");
  // The roster goes to volunteers' phones and works offline, so this is the
  // assertion that matters most in this file.
  const raw = roster.body;
  for (const leaked of ["Budi Santoso", "Siti Rahayu", "3201234567890000", "+628123456780"]) {
    assert(!raw.includes(leaked), `roster leaked ${leaked}`);
  }
  for (const entry of entries) {
    assert(!("name" in entry), "roster entry must not carry a name");
    assert(!("national_id" in entry), "roster entry must not carry a national id");
  }
  log("  no name, no national id, no contact anywhere in the response");

  await app.close();
  await pool.end();
  log("\n✓ add-ons survive the whole path: submit -> enter -> confirm -> roster");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
