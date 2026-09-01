/**
 * Test database wiring.
 *
 * The vault's central claim — the PII columns hold no plaintext — is only
 * meaningful when checked against bytes a real Postgres actually stored, so
 * these tests use one instead of a mock.
 *
 * Missing DATABASE_URL is handled differently depending on where you are, and
 * the asymmetry is the point: locally it skips with instructions, because an
 * outside contributor should get useful signal from `pnpm test` without Docker.
 * In CI it is a hard failure, because a suite that silently skips its most
 * important tests is worse than no suite.
 */
import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { createPool } from "../../src/db/pool.js";
import { migrate } from "../../src/db/migrate.js";
import { parseKeyring, type Keyring } from "../../src/crypto/keyring.js";

export const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL && process.env.CI) {
  throw new Error(
    "DATABASE_URL is not set and CI is. The vault tests must not be skipped in CI — " +
      "the typescript workflow provides a postgres service for exactly this.",
  );
}

export const SKIP_REASON =
  "no DATABASE_URL: run `docker compose up -d postgres` then export " +
  "DATABASE_URL=postgres://sterun:sterun@127.0.0.1:55432/sterun";

export const testKeyring = (): Keyring =>
  parseKeyring(`1:${randomBytes(32).toString("hex")}`, "1");

/**
 * A migrated, empty database.
 *
 * Every run starts from nothing: these tests assert on row counts and unique
 * constraints, and leftovers from a previous run would make them pass or fail
 * for reasons unrelated to the code.
 */
export async function freshDatabase(): Promise<{
  pool: Pool;
  keyring: Keyring;
  close: () => Promise<void>;
}> {
  const pool = createPool({ connectionString: DATABASE_URL as string });
  await pool.query("DROP TABLE IF EXISTS participants, schema_migrations CASCADE");
  await migrate(pool);
  return { pool, keyring: testKeyring(), close: () => pool.end() };
}
