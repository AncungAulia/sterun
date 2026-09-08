#!/usr/bin/env tsx
/**
 * STE-16 — `pnpm indexer <command>`.
 *
 *   pnpm indexer follow    poll getEvents forever, applying as it goes
 *   pnpm indexer poll      one page, then exit — what a test or a cron uses
 *   pnpm indexer rebuild   drop the materialised tables and replay from chain STATE
 *   pnpm indexer doctor    compare the index against the chain, field by field
 *   pnpm indexer status    what the cursor says, without touching the network
 *
 * `rebuild` is the procedure `be/OPERATIONS.md` documents and the ticket asks
 * for. It exists because testnet RPC only retains `getEvents` for a window, so
 * "replay the events" is not always available — but contract state always is.
 */
import { loadEnvFile } from "../env.js";
import { ChainReader, RpcContractCaller } from "../chain/reader.js";
import { loadConfig } from "../config.js";
import { createPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { Indexer } from "../indexer/indexer.js";
import { RpcEventSource } from "../indexer/source.js";
import * as store from "../indexer/store.js";

// The documented setup is "copy .env.example to be/.env"; config reads
// process.env. Real environment variables still win — see src/env.ts.
loadEnvFile();

const USAGE = `sterun indexer — materialise contract events into Postgres (STE-16)

  pnpm indexer follow     poll continuously (Ctrl-C to stop)
  pnpm indexer poll       apply exactly one page and exit
  pnpm indexer rebuild    truncate and replay from contract STATE, then verify
  pnpm indexer doctor     compare the index against the chain and report
  pnpm indexer status     print the cursor and row counts (no network)

Needs DATABASE_URL. Addresses come from docs/deployments.md; the RPC endpoint
from STELLAR_RPC_URL. Poll interval: INDEXER_POLL_INTERVAL_MS (default 7000).`;

const command = process.argv[2] ?? "";
if (command === "" || command === "--help" || command === "-h") {
  console.log(USAGE);
  process.exit(command === "" ? 2 : 0);
}

const config = loadConfig();
if (!config.vault) {
  console.error("error: DATABASE_URL (and PII_KEYS) are not set — the indexer needs Postgres.\n");
  console.error(USAGE);
  process.exit(2);
}

const pool = createPool({ connectionString: config.vault.databaseUrl });
await migrate(pool);

const reader = new ChainReader(
  new RpcContractCaller(
    config.network.rpcUrl,
    config.network.passphrase,
    config.indexer.simulationSource,
  ),
  { eventRegistry: config.addresses.eventRegistry, raceRecord: config.addresses.raceRecord },
);
const source = new RpcEventSource(config.network.rpcUrl, [
  config.addresses.eventRegistry,
  config.addresses.raceRecord,
]);
const indexer = new Indexer(
  pool,
  reader,
  source,
  { eventRegistry: config.addresses.eventRegistry, raceRecord: config.addresses.raceRecord },
  {
    pageLimit: config.indexer.pageLimit,
    ...(config.indexer.startLedger !== undefined
      ? { startLedger: config.indexer.startLedger }
      : {}),
    log: (level, message, detail) =>
      console[level === "warn" ? "warn" : "log"](
        `${level}: ${message}${detail ? ` ${JSON.stringify(detail)}` : ""}`,
      ),
  },
);

/** Set by SIGINT so `follow` finishes the page it is on instead of tearing out mid-transaction. */
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(130);
    console.log(`\n${signal} — finishing the current page, then stopping. Again to force.`);
    stopping = true;
  });
}

try {
  switch (command) {
    case "poll": {
      const result = await indexer.pollOnce();
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "follow": {
      console.log(
        `following ${config.addresses.eventRegistry} and ${config.addresses.raceRecord} ` +
          `every ${config.indexer.pollIntervalMs}ms`,
      );
      while (!stopping) {
        const result = await indexer.pollOnce();
        if (result.applied > 0 || result.orphans > 0) {
          console.log(
            `ledger ${result.lastLedger}/${result.latestLedger}: ` +
              `applied ${result.applied}, duplicates ${result.duplicates}, ` +
              `ignored ${result.ignored}, orphans ${result.orphans}`,
          );
        }
        // Sleep only when the index has actually reached the network's latest
        // ledger. A short or empty page is NOT the end: RPC scans a bounded
        // window per request and hands back a cursor to continue from, so
        // sleeping on `fetched === 0` would crawl through a backlog seven
        // seconds at a time.
        if (result.lastLedger >= result.latestLedger) {
          await sleep(config.indexer.pollIntervalMs);
        }
      }
      break;
    }

    case "rebuild": {
      console.log("reading contract state — nothing is written until the walk finishes");
      const result = await indexer.rebuild();
      console.log(
        `rebuilt in ${result.durationMs}ms: ${result.events} events, ` +
          `${result.categories} categories, ${result.records} records, ` +
          `${result.transitions} transitions. Following resumes at ledger ${result.fromLedger}.`,
      );
      // Verifying immediately is the point: a rebuild nobody checked is a
      // rebuild nobody can trust, and the check costs one more pass.
      const report = await indexer.doctor();
      console.log(report.ok ? "doctor: index matches the chain" : "doctor: MISMATCHES FOUND");
      for (const finding of report.findings) console.log(`  ${finding.kind}: ${finding.detail}`);
      if (!report.ok) process.exitCode = 1;
      break;
    }

    case "doctor": {
      const report = await indexer.doctor();
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
      break;
    }

    case "status": {
      const cursor = await store.getCursor(pool);
      console.log(
        JSON.stringify(
          {
            cursor: cursor
              ? { ...cursor, updatedAt: cursor.updatedAt.toISOString() }
              : "never polled",
            counts: await store.counts(pool),
          },
          null,
          2,
        ),
      );
      break;
    }

    default:
      console.error(`error: unknown command ${JSON.stringify(command)}\n`);
      console.error(USAGE);
      process.exitCode = 2;
  }
} finally {
  await pool.end();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
