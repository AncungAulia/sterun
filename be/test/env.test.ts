/**
 * `be/.env` loading.
 *
 * The rule worth testing is the precedence one: a real environment variable
 * beats the file, always. CI sets DATABASE_URL, a systemd unit sets the
 * production one, and a stale `.env` sitting on the same machine must never
 * quietly redirect either. `process.loadEnvFile()` assigns over what is there,
 * which is exactly why this module exists instead.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnvFile, parseEnvFile } from "../src/env.js";

const envFile = (contents: string): string => {
  const path = join(mkdtempSync(join(tmpdir(), "sterun-env-")), ".env");
  writeFileSync(path, contents);
  return path;
};

describe("parseEnvFile", () => {
  it("reads KEY=value", () => {
    expect(parseEnvFile("PORT=3001")).toEqual(new Map([["PORT", "3001"]]));
  });

  it("ignores comments and blank lines", () => {
    expect(parseEnvFile("# a comment\n\n  \nPORT=1\n")).toEqual(new Map([["PORT", "1"]]));
  });

  it("strips one layer of matching quotes, the way a shell would", () => {
    expect(parseEnvFile('A="Test SDF Network ; September 2015"').get("A")).toBe(
      "Test SDF Network ; September 2015",
    );
    expect(parseEnvFile("B='single'").get("B")).toBe("single");
  });

  it("leaves mismatched quotes alone rather than guessing", () => {
    expect(parseEnvFile(`C="oops'`).get("C")).toBe(`"oops'`);
  });

  it("keeps everything after the FIRST equals sign", () => {
    // A connection string is full of them.
    expect(parseEnvFile("DATABASE_URL=postgres://u:p@h:5432/db?opt=1").get("DATABASE_URL")).toBe(
      "postgres://u:p@h:5432/db?opt=1",
    );
  });

  it("does not expand anything", () => {
    // A secret containing a $ must arrive byte for byte. Expansion is the
    // feature this file exists without.
    expect(parseEnvFile("S=a$HOME${x}b").get("S")).toBe("a$HOME${x}b");
  });

  it("preserves an explicitly empty value", () => {
    expect(parseEnvFile("EMPTY=").get("EMPTY")).toBe("");
  });

  it("ignores lines that are not an assignment a shell would export", () => {
    expect(parseEnvFile("just a sentence\n=novalue\n1BAD=x\nOK=1")).toEqual(
      new Map([["OK", "1"]]),
    );
  });

  it("handles CRLF, which is what an editor on Windows writes", () => {
    expect(parseEnvFile("A=1\r\nB=2\r\n")).toEqual(
      new Map([
        ["A", "1"],
        ["B", "2"],
      ]),
    );
  });
});

describe("loadEnvFile", () => {
  it("applies values that are not already set", () => {
    const env: NodeJS.ProcessEnv = {};
    const result = loadEnvFile(envFile("PII_ACTIVE_KEY_ID=1\nPORT=3005\n"), env);
    expect(env.PII_ACTIVE_KEY_ID).toBe("1");
    expect(env.PORT).toBe("3005");
    expect(result.applied.sort()).toEqual(["PII_ACTIVE_KEY_ID", "PORT"]);
  });

  it("never overrides a variable the environment already has", () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: "postgres://ci/db" };
    const result = loadEnvFile(envFile("DATABASE_URL=postgres://stale/laptop\n"), env);
    expect(env.DATABASE_URL).toBe("postgres://ci/db");
    expect(result.skipped).toEqual(["DATABASE_URL"]);
    expect(result.applied).toEqual([]);
  });

  it("treats an explicitly empty environment variable as already set", () => {
    // `DATABASE_URL= pnpm test` is how the suite is run without a database.
    // The file must not undo that.
    const env: NodeJS.ProcessEnv = { DATABASE_URL: "" };
    loadEnvFile(envFile("DATABASE_URL=postgres://somewhere/db\n"), env);
    expect(env.DATABASE_URL).toBe("");
  });

  it("does nothing when there is no file", () => {
    // A fresh clone has none, and should still start: that is the documented
    // "no vault, /health and /config only" state.
    const env: NodeJS.ProcessEnv = {};
    expect(loadEnvFile("/definitely/not/here/.env", env)).toMatchObject({
      applied: [],
      skipped: [],
    });
    expect(env).toEqual({});
  });

  it("reports names, never values — this runs at startup and startup gets logged", () => {
    const env: NodeJS.ProcessEnv = {};
    const result = loadEnvFile(envFile("TTL_KEEPER_SECRET=SBSECRETVALUE\n"), env);
    expect(JSON.stringify(result)).not.toContain("SBSECRETVALUE");
    expect(result.applied).toEqual(["TTL_KEEPER_SECRET"]);
  });
});
