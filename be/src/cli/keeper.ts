#!/usr/bin/env tsx
/**
 * STE-16 — `pnpm keeper <command>`. Rent for race records.
 *
 *   pnpm keeper scan      dry run: report what is due, submit nothing
 *   pnpm keeper run       extend everything below the threshold
 *   pnpm keeper report    the last runs out of ttl_keeper_runs
 *   pnpm keeper restore   restore archived entries (the runbook's last resort)
 *
 * Intended as a weekly cron (SYSTEM_DESIGN.md §3.4 point 4). Running it more
 * often is harmless — `ExtendFootprintTTLOp` is a floor, never a shortening,
 * and an entry already above the threshold is skipped without a transaction.
 *
 * `run` needs TTL_KEEPER_SECRET: an account with XLM and nothing else.
 * Extending a TTL requires no authorization from anybody, which is exactly why
 * rent can be paid by a stranger — so this key controls no records and can
 * spend nothing but its own fees.
 */
import { Keypair } from "@stellar/stellar-sdk";
import { loadEnvFile } from "../env.js";
import { ChainReader, RpcContractCaller } from "../chain/reader.js";
import { loadConfig } from "../config.js";
import { createPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { TtlKeeper } from "../keeper/keeper.js";
import { RpcTtlKeeperClient } from "../keeper/rpc.js";
import { recentRuns } from "../keeper/runs.js";
import { DAY_IN_LEDGERS } from "../keeper/ttl.js";

// The documented setup is "copy .env.example to be/.env"; config reads
// process.env. Real environment variables still win — see src/env.ts.
loadEnvFile();

const USAGE = `sterun keeper — keep race records out of state archival (STE-16)

  pnpm keeper scan       report what is due; submits nothing (no key needed)
  pnpm keeper run        extend every entry below the threshold
  pnpm keeper report     print recent runs from ttl_keeper_runs
  pnpm keeper restore    restore entries RPC will no longer serve

Needs DATABASE_URL; \`run\` and \`restore\` also need TTL_KEEPER_SECRET.
Thresholds default to the contract's own: extend below ~120 days, up to ~180.
Override with TTL_THRESHOLD_LEDGERS / TTL_EXTEND_TO_LEDGERS.`;

const command = process.argv[2] ?? "";
if (command === "" || command === "--help" || command === "-h") {
  console.log(USAGE);
  process.exit(command === "" ? 2 : 0);
}

const config = loadConfig();
if (!config.vault) {
  console.error("error: DATABASE_URL (and PII_KEYS) are not set — the keeper reads the index.\n");
  console.error(USAGE);
  process.exit(2);
}

const needsKey = command === "run" || command === "restore";
if (needsKey && !config.keeper.secret) {
  console.error(
    "error: TTL_KEEPER_SECRET is not set. `pnpm keeper scan` works without it and shows\n" +
      "       exactly what `run` would submit.\n",
  );
  console.error(USAGE);
  process.exit(2);
}

const pool = createPool({ connectionString: config.vault.databaseUrl });
await migrate(pool);

const days = (ledgers: number): string => (ledgers / DAY_IN_LEDGERS).toFixed(1);

try {
  if (command === "report") {
    const runs = await recentRuns(pool, 10);
    if (runs.length === 0) console.log("no keeper runs recorded yet");
    for (const run of runs) {
      console.log(
        `#${run.id} ${run.startedAt.toISOString()} ${run.status.padEnd(7)} ` +
          `scanned ${run.scannedKeys}, due ${run.belowThreshold}, extended ${run.extendedKeys}, ` +
          `missing ${run.missingKeys}` +
          (run.error ? ` — ${run.error}` : ""),
      );
      for (const tx of run.transactions) {
        console.log(`     ${tx.status} ${tx.hash} (${tx.keys} keys)`);
      }
    }
  } else {
    const reader = new ChainReader(
      new RpcContractCaller(
        config.network.rpcUrl,
        config.network.passphrase,
        config.indexer.simulationSource,
      ),
      { eventRegistry: config.addresses.eventRegistry, raceRecord: config.addresses.raceRecord },
    );
    // `scan` never submits, so it never needs a real key — but the client still
    // has to construct one. A fresh random keypair costs nothing, funds nothing
    // and is discarded when the process exits; requiring an operator to produce
    // a funded key for a read-only command is the kind of friction that stops
    // people from checking.
    const rpc = new RpcTtlKeeperClient(
      config.network.rpcUrl,
      config.network.passphrase,
      config.keeper.secret ?? Keypair.random().secret(),
    );
    const keeper = new TtlKeeper(pool, reader, rpc, {
      thresholdLedgers: config.keeper.thresholdLedgers,
      extendToLedgers: config.keeper.extendToLedgers,
      dryRun: command === "scan",
    });

    switch (command) {
      case "scan":
      case "run": {
        console.log(
          `threshold ${config.keeper.thresholdLedgers} ledgers (~${days(config.keeper.thresholdLedgers)} days), ` +
            `extend to ${config.keeper.extendToLedgers} (~${days(config.keeper.extendToLedgers)} days)`,
        );
        const result = await keeper.run();
        console.log(
          `run #${result.runId} (${result.status}) at ledger ${result.atLedger}: ` +
            `scanned ${result.scannedKeys} keys, ${result.belowThreshold} due, ` +
            `${result.extendedKeys} extended, ${result.missingKeys} not served by RPC`,
        );
        for (const tx of result.transactions) {
          console.log(`  ${tx.status} ${tx.hash} (${tx.keys} keys)`);
          console.log(`  https://stellar.expert/explorer/testnet/tx/${tx.hash}`);
        }
        if (result.missingKeys > 0) {
          console.error(
            `\n${result.missingKeys} ledger entries are not served by RPC — archived, or never ` +
              "written. Extending cannot help those; see be/OPERATIONS.md, " +
              "'Restoring an archived entry', then `pnpm keeper restore`.",
          );
          process.exitCode = 1;
        }
        break;
      }

      case "restore": {
        // Deliberately re-scans instead of taking key XDR on the command line:
        // the set to restore is whatever RPC will not serve right now, and a
        // stale list pasted from an old run would restore the wrong entries.
        const keys = await keeper.collectKeys();
        const entries = await rpc.liveUntil(keys);
        const missing = entries.filter((e) => e.liveUntilLedgerSeq === null);
        if (missing.length === 0) {
          console.log("nothing to restore — RPC serves every entry the index depends on");
          break;
        }
        console.log(`restoring ${missing.length} archived entries`);
        for (const tx of await keeper.restore(missing.map((m) => m.key))) {
          console.log(`  ${tx.status} ${tx.hash} (${tx.keys} keys)`);
        }
        break;
      }

      default:
        console.error(`error: unknown command ${JSON.stringify(command)}\n`);
        console.error(USAGE);
        process.exitCode = 2;
    }
  }
} finally {
  await pool.end();
}
