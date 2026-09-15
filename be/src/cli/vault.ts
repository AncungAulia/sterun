#!/usr/bin/env tsx
/**
 * STE-50 — `pnpm vault <command>`. Operator commands on the PII vault.
 *
 *   pnpm vault sweep    delete entries submitted and never confirmed, now
 *
 * The API already sweeps every hour (src/retention.ts). This exists so an
 * operator can run it on demand and see the count, for instance right after a
 * deploy, without waiting for the next tick or restarting the API.
 */
import { loadEnvFile } from "../env.js";
import { loadConfig } from "../config.js";
import { createPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { Vault } from "../vault.js";

loadEnvFile();

const USAGE = `sterun vault — operator commands on the PII vault

  pnpm vault sweep     delete entries submitted and never confirmed, older than
                       VAULT_UNCONFIRMED_TTL_HOURS (default 24). Prints a count only.

Needs DATABASE_URL, PII_KEYS and PII_INDEX_KEY.`;

const command = process.argv[2] ?? "";
if (command === "" || command === "--help" || command === "-h") {
  console.log(USAGE);
  process.exit(command === "" ? 2 : 0);
}

const config = loadConfig();
if (!config.vault) {
  console.error("error: DATABASE_URL and PII_KEYS are not set — there is no vault to operate on.\n");
  console.error(USAGE);
  process.exit(2);
}

const pool = createPool({ connectionString: config.vault.databaseUrl });
try {
  await migrate(pool);
  const vault = new Vault(pool, config.vault.keyring, config.vault.indexKey);

  switch (command) {
    case "sweep": {
      const hours = config.retention.unconfirmedHours;
      const removed = await vault.sweepUnconfirmed(hours);
      // A count, never rows: this output ends up in terminals and logs.
      console.log(`removed ${removed} unconfirmed entries older than ${hours}h`);
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
