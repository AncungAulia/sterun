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
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * The checksums of migrations production has already applied, as it recorded
 * them in `schema_migrations` (read from the live database on 2026-09-14).
 *
 * The runtime guard above only fires at startup, on the box — which is the most
 * expensive place to find out. This pins the same fact in CI instead. It is not
 * hypothetical: an English pass over the repository edited a comment inside
 * 006, the runtime guard would have refused to start the API on the next
 * deploy, and nothing before that deploy said so.
 *
 * Adding a migration means adding a line here once it has run in production.
 * Changing a line here means an applied migration was edited, which is the bug.
 */
describe("migrations already applied in production", () => {
  const APPLIED: Record<string, string> = {
    "001_pii_vault.sql": "19684fc1545af812887ea2985c3a5895e4de3899dd000908f08feef9fe143ff4",
    "002_indexer.sql": "ad6e2aad01d5f796f9a531811c6dfe84ea8cb8038fdb7b1524d28c235b12d3f9",
    "003_name_fragment.sql": "58d04ca0f79bb75f33890bf5b610ff7033c9159c0ff2ec0fd9a60d8bbe7d6d4c",
    "004_auth_nonces.sql": "708aad2328f108b128de2bf7b8ec87aa962a05db8ac11aae81e739ade7baefc1",
    "005_add_ons.sql": "353f85995c4de375bc511731b3bb75bd811c740bc9d41a0937562cdfe7922e6d",
    "006_cancelled_status.sql": "1bebfd8dbaa54e78c98d00d6bf02444390148d0712996ac506d6521813e44f8a",
    // Applied in production 2026-09-14, deploy of fc3ca31.
    "007_untimed_finish.sql": "6be88b02dfc602242e409f3d2301cad0a8e2ecd2ac6d550d81dc230d12913a9f",
    // Applied in production 2026-09-14, deploy of 5aa85ed.
    "008_record_addon_ids.sql": "438ce30e4c705f6b3d2ca9e333e8e305adaa501ee2b0e858b0aa5577ad6caec7",
    // Applied in production 2026-09-14, deploy of 2dcf42e.
    "009_entry_form_fields.sql": "36263a44121a68a35f0c64595eea54950329f0524470d0631f4e708fe9cf89e8",
    // Applied in production 2026-09-15, deploy of e5a1e7f.
    "010_faucet_payouts.sql": "d4bf5aa0796eea0e3b5acac909efff560046e5371cfcbe17de3488505831ab0f",
  };

  it.each(Object.entries(APPLIED))("%s is byte-for-byte what production ran", (name, sha256) => {
    const sql = readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
    // Compared through the runtime's own checksum, so this test and the startup
    // guard can never disagree about what "changed" means.
    expect(migrationChecksum(sql)).toBe(sha256);
  });
});
