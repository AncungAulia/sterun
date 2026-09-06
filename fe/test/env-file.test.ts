/**
 * The committed `fe/.env` may only ever hold values that are already public.
 *
 * Committing `.env` is Next.js convention — `.env` carries defaults for every
 * environment and `.env.local` is the one that stays on your machine — and
 * everything in it today is a `NEXT_PUBLIC_` value, which by definition ends up
 * in the browser bundle. So this is not a complaint about the current file.
 *
 * It is a guard about the next edit. The repo's root `.gitignore` lists `.env`,
 * but a file that is ALREADY tracked is exempt from `.gitignore` forever: a
 * secret added here later would be committed and pushed with nothing objecting.
 * The name `.env` is exactly where somebody would reach for one.
 *
 * `NEXT_PUBLIC_` is the right rule to enforce because Next.js already gives it
 * a meaning nobody can misread: the prefix is what puts a value in the bundle,
 * so a key without it is a key somebody expected to stay server-side — and this
 * file is the wrong place for that.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ENV_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");

const keys = (): string[] =>
  readFileSync(ENV_FILE, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#") && line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")).trim());

describe("the committed fe/.env", () => {
  it("holds nothing but NEXT_PUBLIC_ keys", () => {
    const offenders = keys().filter((key) => !key.startsWith("NEXT_PUBLIC_"));
    expect(
      offenders,
      `fe/.env is committed to git, so everything in it is public. ` +
        `${offenders.join(", ")} has no NEXT_PUBLIC_ prefix, which means it was meant to stay ` +
        `server-side. Put it in fe/.env.local instead — that one is gitignored.`,
    ).toEqual([]);
  });

  it("is not empty, so this guard cannot pass by reading nothing", () => {
    // A test that would also pass against a missing or empty file is a test
    // that stops meaning anything the moment the file moves.
    expect(keys().length).toBeGreaterThan(0);
  });
});
