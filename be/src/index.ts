/**
 * STE-6/STE-11 — process entry point.
 *
 * Order matters here. Config is loaded first, so an unreadable
 * docs/deployments.md or a half-configured vault kills startup instead of
 * producing a process that answers /health while pointing at nothing. Then
 * migrations run before the socket opens, so the service is never briefly
 * accepting registrations against a schema that does not exist yet.
 */
import { ChallengeStore } from "./auth.js";
import { PostgresNonces } from "./auth-postgres.js";
import { loadEnvFile } from "./env.js";
import { ChainReader, RpcContractCaller } from "./chain/reader.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { buildServer } from "./server.js";
import { Vault } from "./vault.js";

// The documented setup is "copy .env.example to be/.env"; config reads
// process.env. Real environment variables still win — see src/env.ts.
loadEnvFile();

const config = loadConfig();

const pool = config.vault ? createPool({ connectionString: config.vault.databaseUrl }) : undefined;
if (pool && config.vault) {
  const applied = await migrate(pool);
  const pending = applied.filter((m) => !m.alreadyApplied).map((m) => m.name);
  if (pending.length > 0) {
    console.log(`applied migrations: ${pending.join(", ")}`);
  }
}

// Constructing the reader costs nothing — no network call happens until the
// first roster request — so it is always available when the process can serve
// one. Whether the route mounts is decided by the pool and the vault.
const reader = new ChainReader(
  new RpcContractCaller(
    config.network.rpcUrl,
    config.network.passphrase,
    config.indexer.simulationSource,
  ),
  { eventRegistry: config.addresses.eventRegistry, raceRecord: config.addresses.raceRecord },
);

/**
 * STE-31. With Postgres, nonces live there; without it, in this process.
 *
 * That is not a performance choice. An in-memory store behind two instances
 * fails intermittently and reports it as "unknown-nonce", which sends whoever
 * is debugging it to look at their signing code. Postgres makes spending a
 * nonce a single `DELETE … RETURNING`, which is atomic across instances.
 *
 * A single process with no database keeps the memory store, and that is still
 * correct — there is no second instance for it to disagree with.
 */
const challenges = new ChallengeStore(Date.now, pool ? new PostgresNonces(pool) : undefined);

const app = buildServer(config, {
  ...(pool ? { pool } : {}),
  ...(pool && config.vault ? { vault: new Vault(pool, config.vault.keyring) } : {}),
  challenges,
  reader,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, "shutting down");
    void app
      .close()
      .then(() => pool?.end())
      .then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    {
      network: config.network.name,
      addresses: config.addresses,
      vault: config.vault ? { activeKeyId: config.vault.keyring.activeKeyId } : "disabled",
      nonces: pool ? "postgres" : "in-memory (single process only)",
    },
    "sterun backend ready",
  );
  if (!config.vault) {
    app.log.warn(
      "PII vault is OFF — /participants and the roster bundle are not mounted. " +
        "Set DATABASE_URL and PII_KEYS to enable them (be/OPERATIONS.md).",
    );
  }
  if (pool) {
    // The API serves the index; it does not fill it. Saying so here saves the
    // "why is /events empty" question, which otherwise gets asked once per
    // person who deploys this.
    app.log.info(
      "index read endpoints are mounted. The poller is a separate process: `pnpm indexer follow`.",
    );
  }
} catch (err) {
  app.log.error(err, "failed to start");
  await pool?.end();
  process.exit(1);
}
