/**
 * STE-20 — the results upload, exercised against live testnet.
 *
 * The ticket's acceptance scenario: upload a CSV mixing valid rows with every
 * anomaly, and check the response flags each one with a reason while the valid
 * rows pass. This runs it for real — a fresh event created on testnet through
 * `@sterun/sdk`, indexed by the STE-16 indexer from contract state, then read
 * back through the actual route.
 *
 * Nothing here is faked except the socket: the chain is testnet, the database is
 * Postgres, and the request goes through the same Fastify instance `pnpm dev`
 * serves. `inject()` rather than a port because a port would add a race and
 * prove nothing extra.
 *
 *     docker compose up -d postgres
 *     DATABASE_URL=... PII_KEYS=... pnpm --filter be e2e:results
 *
 * Every account is a throwaway Friendbot account, so this needs no secret from
 * anybody's machine. Categories are free (`price_stroops = 0`), which skips the
 * SEP-41 transfer entirely — a paid entry would need the sUSD distributor key,
 * and the fee path is not what this script is about.
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

const log = (message: string) => console.log(message);
const step = (message: string) => console.log(`\n▸ ${message}`);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function friendbot(address: string, url: string): Promise<void> {
  const res = await fetch(`${url}?addr=${encodeURIComponent(address)}`);
  if (!res.ok) throw new Error(`friendbot failed for ${address}: ${res.status}`);
}

async function main(): Promise<void> {
  // Same as the API and both CLIs: real environment variables win, and a
  // missing file is not an error.
  loadEnvFile();
  const config = loadConfig();
  assert(config.vault, "set DATABASE_URL and PII_KEYS (see be/.env.example)");

  const contracts = {
    eventRegistry: config.addresses.eventRegistry,
    raceRecord: config.addresses.raceRecord,
  };
  log("Sterun results upload — live testnet");
  log(`  EventRegistry  ${contracts.eventRegistry}`);
  log(`  RaceRecord     ${contracts.raceRecord}`);

  step("Funding a throwaway organiser and three runners");
  const organiser = Keypair.random();
  const runners = [Keypair.random(), Keypair.random(), Keypair.random()];
  for (const kp of [organiser, ...runners]) {
    await friendbot(kp.publicKey(), config.network.friendbotUrl);
  }
  log(`  organiser ${organiser.publicKey()}`);

  const sterun = new SterunClient({ ...TESTNET, contracts });
  const asOrganiser = SterunClient.as(organiser);

  step("Creating an event with TWO free categories, both numbering bibs from 0");
  const { value: eventId } = await sterun.createEvent(
    {
      organiser: organiser.publicKey(),
      name: `Sterun results e2e ${new Date().toISOString().slice(0, 10)}`,
      metadataHash: randomBytes(32).toString("hex"),
      uri: "https://sterun.xyz/events/results-e2e.json",
      startsAt: BigInt(Math.floor(Date.now() / 1000) + 86_400),
    },
    asOrganiser,
  );
  const catA = (
    await sterun.addCategory(
      { eventId, code: "R10K", distanceM: 10_000, quota: 5, priceStroops: 0n },
      asOrganiser,
    )
  ).value;
  const catB = (
    await sterun.addCategory(
      { eventId, code: "FUN5K", distanceM: 5_000, quota: 5, priceStroops: 0n },
      asOrganiser,
    )
  ).value;
  await sterun.setEventStatus(eventId, "Open", asOrganiser);
  log(`  event ${eventId}, categories ${catA} (10km) and ${catB} (5km)`);

  step("Entering three runners, and checking two of them in");
  // Two in category A (bibs 0 and 1) and one in B (bib 0 again — which is what
  // makes a bare bib ambiguous, and is the whole reason for ambiguous_bib).
  const tokens: number[] = [];
  for (const [i, runner] of runners.entries()) {
    const category = i < 2 ? catA : catB;
    const { value: tokenId } = await sterun.enter(
      {
        runner: runner.publicKey(),
        eventId,
        categoryId: category,
        participantHash: randomBytes(32).toString("hex"),
      },
      SterunClient.as(runner),
    );
    tokens.push(tokenId);
  }
  // Only the first two collect a race pack; the third stays `Entered` so
  // `not_claimed` has something real to fire on.
  for (const tokenId of tokens.slice(0, 2)) {
    await sterun.claimRacepack(tokenId, organiser.publicKey(), asOrganiser);
  }
  log(`  tokens ${tokens.join(", ")} — first two RacepackClaimed, third still Entered`);

  step("Indexing from contract state");
  const pool = new Pool({ connectionString: config.vault.databaseUrl });
  await migrate(pool);
  const reader = new ChainReader(
    new RpcContractCaller(config.network.rpcUrl, config.network.passphrase, config.indexer.simulationSource),
    config.addresses,
  );
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

  step("Uploading a CSV mixing valid rows with every anomaly");
  const app = buildServer(config, { pool, reader, challenges: new ChallengeStore() });
  await app.ready();

  const csv = [
    "bib_no,category_id,finish_time",
    `0,${catA},52:41`, // valid — and proves mm:ss is read as 3161s
    `1,${catA},3200`, // valid
    `1,${catA},3300`, // duplicate_bib
    `99,${catA},3161`, // unknown_bib
    `0,,3161`, // ambiguous_bib — bib 0 exists in both categories
    `2,${catA},3161`, // unknown_bib (entered in B, not A)
    `0,${catB},120`, // impossible_time — 5km in two minutes
    `xx,${catA},3161`, // malformed_row
  ].join("\n");

  const challenge = await app.inject({
    method: "POST",
    url: "/auth/challenge",
    payload: { address: organiser.publicKey() },
  });
  const { nonce } = challenge.json();
  const res = await app.inject({
    method: "POST",
    url: `/events/${eventId}/results/preview`,
    headers: {
      "content-type": "text/csv",
      "x-sterun-address": organiser.publicKey(),
      "x-sterun-nonce": nonce,
      "x-sterun-signature": Buffer.from(organiser.sign(Buffer.from(nonce, "utf8"))).toString(
        "base64",
      ),
    },
    payload: csv,
  });

  assert(res.statusCode === 200, `expected 200, got ${res.statusCode}: ${res.payload}`);
  const body = res.json();

  log(`  sha256 of the uploaded file: ${body.source_sha256}`);
  log(`  ${body.row_count} rows, ${body.counts.publishable} publishable\n`);
  for (const row of body.rows) {
    const flags = row.anomalies.map((a: { kind: string }) => a.kind).join(", ") || "ok";
    log(`  line ${row.line}  bib ${row.bib_no ?? "?"}  ->  ${flags}`);
    for (const anomaly of row.anomalies) {
      log(`      ${anomaly.severity.padEnd(8)} ${anomaly.reason}`);
    }
  }

  step("Checking the response says what it should");
  assert(body.counts.publishable === 2, `expected 2 publishable, got ${body.counts.publishable}`);
  assert(body.counts.duplicate_bib === 1, "duplicate_bib not flagged");
  assert(body.counts.unknown_bib === 2, "unknown_bib not flagged twice");
  assert(body.counts.ambiguous_bib === 1, "ambiguous_bib not flagged");
  assert(body.counts.impossible_time === 1, "impossible_time not flagged");
  assert(body.counts.malformed_row === 1, "malformed_row not flagged");
  assert(
    body.publishable[0].finish_time_s === 3161,
    `52:41 must be 3161 seconds, got ${body.publishable[0].finish_time_s}`,
  );
  assert(/^[0-9a-f]{64}$/.test(body.source_sha256), "source hash is not a sha256");
  assert(!res.payload.includes(runners[0]!.publicKey()), "the response leaked a runner address");
  log("  ✓ every anomaly flagged with a reason, valid rows pass, hash present");

  step("The third runner is Entered, so their row would revert");
  const notClaimed = await app.inject({
    method: "POST",
    url: `/events/${eventId}/results/preview`,
    headers: {
      "content-type": "text/csv",
      ...(await (async () => {
        const c = await app.inject({
          method: "POST",
          url: "/auth/challenge",
          payload: { address: organiser.publicKey() },
        });
        const n = c.json().nonce;
        return {
          "x-sterun-address": organiser.publicKey(),
          "x-sterun-nonce": n,
          "x-sterun-signature": Buffer.from(organiser.sign(Buffer.from(n, "utf8"))).toString(
            "base64",
          ),
        };
      })()),
    },
    payload: `bib_no,category_id,finish_time\n0,${catB},1500\n`,
  });
  const row = notClaimed.json().rows[0];
  assert(row.anomalies[0]?.kind === "not_claimed", `expected not_claimed, got ${row.anomalies[0]?.kind}`);
  assert(row.anomalies[0].severity === "reverts", "not_claimed is a revert, not a wrong result");
  log(`  ✓ ${row.anomalies[0].reason}`);

  await app.close();
  await pool.end();

  step("Evidence for docs/deployments.md");
  log("```");
  log(`event_id        ${eventId}`);
  log(`organiser       ${organiser.publicKey()}`);
  log(`categories      ${catA} (10km), ${catB} (5km)`);
  log(`token_ids       ${tokens.join(", ")}`);
  log(`source_sha256   ${body.source_sha256}`);
  log(`publishable     ${body.counts.publishable} of ${body.row_count}`);
  log("```");
  log("\n✅ results upload e2e passed against live testnet");
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
