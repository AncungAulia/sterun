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
 *
 * The checksum is taken over the file with line endings normalised, and that is
 * not a detail. `core.autocrlf` is on by default on Windows, so the same commit
 * checks out with CRLF there and LF everywhere else. Hashing the raw bytes made
 * a plain `git checkout` look like someone had edited an applied migration —
 * which is a hard failure at startup, on a developer machine, for a file nobody
 * touched. The guard is supposed to catch a changed migration, not a changed
 * checkout.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

/**
 * The checksum of a migration's *content*, independent of how it was checked
 * out. CRLF and a trailing newline are the two things git and editors change
 * without anybody meaning to.
 */
export function migrationChecksum(sql: string): string {
  const normalised = `${sql.replace(/\r\n/g, "\n").trimEnd()}\n`;
  return createHash("sha256").update(normalised).digest("hex");
}

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
    const sha256 = migrationChecksum(sql);
    const previous = applied.get(name);

    if (previous !== undefined) {
      if (previous !== sha256) {
        // A database written before the checksum was normalised holds the hash
        // of the raw bytes. That is not tampering, so it is upgraded in place
        // rather than turned into an outage.
        if (previous === createHash("sha256").update(sql).digest("hex")) {
          await pool.query("UPDATE schema_migrations SET sha256 = $2 WHERE name = $1", [
            name,
            sha256,
          ]);
        } else {
          throw new Error(
            `migration ${name} has already been applied but its contents have changed. ` +
              "Applied migrations are immutable — add a new file instead, or this database and " +
              "the next one will silently have different schemas.",
          );
        }
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
