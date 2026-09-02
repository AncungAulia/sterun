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
 *
 * **Each caller gets its own schema.** Vitest runs test files in parallel, and
 * these tests assert on row counts and truncate tables; sharing `public` means
 * one file's TRUNCATE lands in the middle of another file's assertions, and the
 * failure looks like a bug in the code rather than in the harness. A schema per
 * database is cheap, and it is dropped on close.
 */
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
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

export interface TestDatabase {
  pool: Pool;
  keyring: Keyring;
  schema: string;
  close: () => Promise<void>;
}

/**
 * A migrated, empty database in a schema of its own.
 *
 * Every run starts from nothing: these tests assert on row counts and unique
 * constraints, and leftovers from a previous run would make them pass or fail
 * for reasons unrelated to the code.
 */
export async function freshDatabase(): Promise<TestDatabase> {
  // `t_` prefix and hex only: this is interpolated into DDL, so it must not be
  // able to contain anything a quote could escape out of.
  const schema = `t_${randomBytes(8).toString("hex")}`;

  const admin = new Pool({ connectionString: DATABASE_URL as string, max: 1 });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
  } finally {
    await admin.end();
  }

  const pool = createPool({ connectionString: DATABASE_URL as string, searchPath: schema });
  await migrate(pool);

  return {
    pool,
    keyring: testKeyring(),
    schema,
    close: async () => {
      await pool.end();
      const cleanup = new Pool({ connectionString: DATABASE_URL as string, max: 1 });
      try {
        await cleanup.query(`DROP SCHEMA ${schema} CASCADE`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
