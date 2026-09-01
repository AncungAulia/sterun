/**
 * STE-11 — migrations, deliberately the smallest thing that works.
 *
 * No ORM and no migration framework: this repo needs a handful of tables over
 * thirty days, and a framework would add a dependency, a DSL and a set of
 * failure modes to learn in exchange for features (multiple dialects,
 * auto-generated diffs) that nothing here will use.
 *
 * The rules are the ones every migration system eventually enforces anyway:
 * files run in filename order, exactly once, inside a transaction, and their
 * sha256 is recorded so an already-applied file that later changes on disk is
 * an error rather than a silent divergence between environments.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

export interface AppliedMigration {
  name: string;
  alreadyApplied: boolean;
}

export async function migrate(pool: Pool, dir = MIGRATIONS_DIR): Promise<AppliedMigration[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        text PRIMARY KEY,
      sha256      text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await pool.query<{ name: string; sha256: string }>(
    "SELECT name, sha256 FROM schema_migrations",
  );
  const applied = new Map(rows.map((r) => [r.name, r.sha256]));
  const result: AppliedMigration[] = [];

  for (const name of files) {
    const sql = readFileSync(join(dir, name), "utf8");
    const sha256 = createHash("sha256").update(sql).digest("hex");
    const previous = applied.get(name);

    if (previous !== undefined) {
      if (previous !== sha256) {
        throw new Error(
          `migration ${name} has already been applied but its contents have changed. ` +
            "Applied migrations are immutable — add a new file instead, or this database and " +
            "the next one will silently have different schemas.",
        );
      }
      result.push({ name, alreadyApplied: true });
      continue;
    }

    const client = await pool.connect();
    try {
      // Postgres has transactional DDL, so a migration that fails halfway
      // leaves nothing behind — no manual cleanup, no half-migrated database.
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, sha256) VALUES ($1, $2)", [
        name,
        sha256,
      ]);
      await client.query("COMMIT");
      result.push({ name, alreadyApplied: false });
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${name} failed: ${(e as Error).message}`, { cause: e });
    } finally {
      client.release();
    }
  }

  return result;
}
