/**
 * STE-11 — the Postgres connection pool.
 *
 * `pg` with no ORM. What this service does to the database is a handful of
 * hand-written statements over one table; an ORM would add a mapping layer, a
 * query DSL and a set of generated SQL surprises in exchange for convenience
 * this codebase does not need.
 */
import { Pool } from "pg";

export interface DbConfig {
  connectionString: string;
  /** Small on purpose: this service is not the bottleneck, Postgres is. */
  max?: number;
  /**
   * Postgres `search_path` for every connection in this pool.
   *
   * Defaults to whatever the server does, which is `public`. It exists because
   * the test suite gives each file its own schema — several suites truncating
   * `public` in parallel is a flaky suite, and a flaky suite gets ignored — and
   * because a deployment that does not own `public` needs the same knob.
   */
  searchPath?: string;
}

export function createPool(config: DbConfig): Pool {
  const pool = new Pool({
    connectionString: config.connectionString,
    max: config.max ?? 10,
    ...(config.searchPath ? { options: `-c search_path=${config.searchPath}` } : {}),
    // A registration request that cannot get a connection should fail fast and
    // let the caller retry, rather than pile up behind a stuck pool.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });

  // Without this, a connection dropped by the server (restart, failover, an
  // idle timeout on a managed instance) surfaces as an unhandled 'error' event
  // and takes the whole process down.
  pool.on("error", (err) => {
    console.error("postgres pool error on an idle client:", err.message);
  });

  return pool;
}

/** The URL to reach Postgres, or a message explaining that there is none. */
export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The PII vault needs Postgres; start one with " +
        "`docker compose up -d postgres` (see compose.yaml) and copy be/.env.example to be/.env.",
    );
  }
  return url;
}
