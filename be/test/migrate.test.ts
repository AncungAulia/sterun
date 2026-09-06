/**
 * The migration runner's immutability guard.
 *
 * The guard is supposed to catch "somebody edited a migration that has already
 * run". It is NOT supposed to catch "git checked this file out on Windows",
 * which is what it did until the checksum was normalised: `core.autocrlf` is on
 * by default there, so the same commit lands with CRLF on one machine and LF on
 * every other, and a plain `git checkout` turned into a hard failure at startup
 * for a file nobody had touched.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, migrationChecksum } from "../src/db/migrate.js";
import { DATABASE_URL, SKIP_REASON, freshDatabase } from "./helpers/db.js";

const SQL = "CREATE TABLE widgets (id integer PRIMARY KEY);\n";

describe("migrationChecksum", () => {
  it("is the same for LF and CRLF", () => {
    expect(migrationChecksum(SQL)).toBe(migrationChecksum(SQL.replace(/\n/g, "\r\n")));
  });

  it("is the same with or without a trailing newline", () => {
    expect(migrationChecksum(SQL)).toBe(migrationChecksum(SQL.trimEnd()));
    expect(migrationChecksum(SQL)).toBe(migrationChecksum(`${SQL}\n\n`));
  });

  it("still changes when the SQL changes", () => {
    // The whole point of the guard. Normalising line endings must not
    // normalise away an actual edit.
    expect(migrationChecksum(SQL)).not.toBe(
      migrationChecksum("CREATE TABLE widgets (id bigint PRIMARY KEY);\n"),
    );
  });

  it("notices whitespace changes inside the file, only not at the very end", () => {
    expect(migrationChecksum("SELECT 1;\n")).not.toBe(migrationChecksum("SELECT  1;\n"));
  });
});

describe.skipIf(!DATABASE_URL)(`migrate (${DATABASE_URL ? "postgres" : SKIP_REASON})`, () => {
  let pool: Pool;
  let close: () => Promise<void>;
  let dir: string;

  beforeEach(async () => {
    ({ pool, close } = await freshDatabase());
    dir = mkdtempSync(join(tmpdir(), "sterun-migrations-"));
  });

  afterEach(async () => {
    await close();
  });

  const write = (name: string, sql: string): void => writeFileSync(join(dir, name), sql);

  it("applies a file once and recognises it the second time", async () => {
    write("100_widgets.sql", SQL);
    expect(await migrate(pool, dir)).toEqual([{ name: "100_widgets.sql", alreadyApplied: false }]);
    expect(await migrate(pool, dir)).toEqual([{ name: "100_widgets.sql", alreadyApplied: true }]);
  });

  it("does not complain when the same file comes back with CRLF", async () => {
    // The failure this test exists for: apply on a machine with LF, then let
    // git hand the same commit back with CRLF.
    write("100_widgets.sql", SQL);
    await migrate(pool, dir);

    write("100_widgets.sql", SQL.replace(/\n/g, "\r\n"));
    expect(await migrate(pool, dir)).toEqual([{ name: "100_widgets.sql", alreadyApplied: true }]);
  });

  it("upgrades a checksum the old code recorded, instead of failing on it", async () => {
    // A database migrated before the checksum was normalised holds the hash of
    // the raw bytes. That is not tampering; it is a format change, and it gets
    // rewritten in place rather than turned into an outage on next startup.
    const crlf = SQL.replace(/\n/g, "\r\n");
    write("100_widgets.sql", crlf);
    await migrate(pool, dir);
    await pool.query("UPDATE schema_migrations SET sha256 = $2 WHERE name = $1", [
      "100_widgets.sql",
      createHash("sha256").update(crlf).digest("hex"),
    ]);

    expect(await migrate(pool, dir)).toEqual([{ name: "100_widgets.sql", alreadyApplied: true }]);
    const { rows } = await pool.query<{ sha256: string }>(
      "SELECT sha256 FROM schema_migrations WHERE name = $1",
      ["100_widgets.sql"],
    );
    expect(rows[0]?.sha256).toBe(migrationChecksum(SQL));
  });

  it("still refuses a checksum that matches neither form", async () => {
    write("100_widgets.sql", SQL);
    await migrate(pool, dir);
    await pool.query("UPDATE schema_migrations SET sha256 = $2 WHERE name = $1", [
      "100_widgets.sql",
      "not-a-hash-of-anything",
    ]);
    await expect(migrate(pool, dir)).rejects.toThrow(/contents have changed/);
  });

  it("refuses a migration whose SQL actually changed", async () => {
    write("100_widgets.sql", SQL);
    await migrate(pool, dir);

    write("100_widgets.sql", "DROP TABLE widgets;\n");
    await expect(migrate(pool, dir)).rejects.toThrow(/Applied migrations are immutable/);
  });

  it("runs files in filename order", async () => {
    write("200_second.sql", "CREATE TABLE b (id integer REFERENCES a (id));\n");
    write("100_first.sql", "CREATE TABLE a (id integer PRIMARY KEY);\n");
    // The foreign key only resolves if 100 ran first.
    expect((await migrate(pool, dir)).map((m) => m.name)).toEqual([
      "100_first.sql",
      "200_second.sql",
    ]);
  });

  it("leaves nothing behind when a migration fails halfway", async () => {
    write("100_widgets.sql", "CREATE TABLE ok (id integer);\nSELECT nonexistent_function();\n");
    await expect(migrate(pool, dir)).rejects.toThrow(/failed/);
    // Postgres has transactional DDL, so the half-applied table is gone too.
    const { rows } = await pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'ok'",
    );
    expect(rows[0]?.n).toBe("0");
  });
});
