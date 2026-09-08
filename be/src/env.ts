/**
 * Load `be/.env` into `process.env`, if it is there.
 *
 * `be/CLAUDE.md`, `be/OPERATIONS.md` and `.env.example` have all told people to
 * copy the template to `be/.env` and run `pnpm dev` since STE-6 — and nothing
 * ever read the file. The secrets sat there and the process started without
 * them, which looks exactly like a wrong key.
 *
 * Two rules, and the second one is the one that matters:
 *
 *   **A real environment variable always wins.** Values already in
 *   `process.env` are left alone. CI sets `DATABASE_URL`, a systemd unit sets
 *   the production one, and a stale `.env` on the same machine must never
 *   quietly override either. This is the opposite of `process.loadEnvFile()`,
 *   which assigns over what is there — which is why that is not used here.
 *
 *   **A missing file is not an error.** A fresh clone has no `.env` and should
 *   still start; that is the documented "no vault, /health and /config only"
 *   state.
 *
 * Hand-written rather than `dotenv` for the same reason `src/db/migrate.ts` is
 * hand-written: what this needs is `KEY=value`, comments, and optional quotes.
 * A dependency would add interpolation, multiline values and expansion rules
 * that nothing in this repo uses and that would silently change what a secret
 * containing a `$` means.
 *
 * Called from the process entry points only — never from `config.ts`, which
 * stays pure so tests can inject an environment instead of inheriting whatever
 * a developer happens to have in their `.env`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `be/.env`, resolved from this module rather than from the cwd. */
const DEFAULT_ENV_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");

export interface LoadedEnv {
  path: string;
  /** Names read from the file and applied. Never the values. */
  applied: string[];
  /** Names present in the file but already set in the environment. */
  skipped: string[];
}

/** Strip one layer of matching quotes, the way a shell would. */
function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    if ((first === '"' || first === "'") && trimmed.endsWith(first)) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

export function parseEnvFile(contents: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    // Only the shape a shell would export. Anything else is a typo, and
    // guessing at it would be worse than ignoring it.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    out.set(key, unquote(line.slice(eq + 1)));
  }
  return out;
}

export function loadEnvFile(path = DEFAULT_ENV_PATH, env: NodeJS.ProcessEnv = process.env): LoadedEnv {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return { path, applied: [], skipped: [] };
  }

  const applied: string[] = [];
  const skipped: string[] = [];
  for (const [key, value] of parseEnvFile(contents)) {
    // `!== undefined` rather than a truthiness check: `FOO=` in the real
    // environment is a deliberate "explicitly empty", and the file must not
    // reinterpret it.
    if (env[key] !== undefined) {
      skipped.push(key);
      continue;
    }
    env[key] = value;
    applied.push(key);
  }
  return { path, applied, skipped };
}
