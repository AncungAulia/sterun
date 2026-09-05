/**
 * The Sterun API.
 *
 * What this factory mounts is decided by configuration rather than by a flag,
 * and every combination is a shape somebody actually runs:
 *
 *   nothing set     /health and /config only. This is what `pnpm dev` gives
 *                   someone who has just cloned the repo, and it is useful —
 *                   it answers "which contracts am I pointed at?" with no
 *                   Postgres, no keys, no setup.
 *   + a vault       the participant routes (STE-11). Reached by setting
 *                   DATABASE_URL and PII_KEYS together; setting one without
 *                   the other is refused in config.ts rather than half-served
 *                   here.
 *   + a pool        the directory and history endpoints (STE-16), reading the
 *                   indexer's tables.
 *   + a reader      the roster bundle, which needs the chain to say who counts
 *                   as a scanner and is not mounted without it.
 *
 * `buildServer` is a factory rather than a module-level singleton so tests use
 * inject() without opening a socket.
 */
import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { ChallengeStore } from "./auth.js";
import type { ChainReader } from "./chain/reader.js";
import type { Config } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { registerErrorHandler } from "./http/errors.js";
import { loggerOptions, registerHardening } from "./http/hardening.js";
import { directoryRoutes } from "./routes/directory.js";
import { participantRoutes } from "./routes/participants.js";
import { resultsRoutes } from "./routes/results.js";
import { rosterRoutes } from "./routes/roster.js";
import type { Vault } from "./vault.js";

export interface ServerDeps {
  /** Present exactly when this process runs the PII vault. */
  vault?: Vault;
  /** Injectable so auth tests can control the clock. */
  challenges?: ChallengeStore;
  /**
   * Present when Postgres is configured — mounts the STE-16 read endpoints.
   * They serve the indexer's tables, which are empty rather than absent before
   * the first poll, so mounting them without an indexer running is honest: the
   * answer is "nothing indexed yet", not a 404 on the route itself.
   */
  pool?: Pool;
  /**
   * Present when RPC is reachable. Required for the roster bundle and nothing
   * else: the scanner allowlist is read from the chain on every request, so
   * without a reader there is no safe way to answer and the route is not
   * mounted at all.
   */
  reader?: ChainReader;
}

export function buildServer(config: Config, deps: ServerDeps = {}): FastifyInstance {
  // `logger: false` in tests silences request logging on its own — Fastify 5
  // deprecated the separate `disableRequestLogging` flag, and setting both
  // would print a deprecation warning on every buildServer call.
  const app = Fastify({
    logger: loggerOptions(config),
    ajv: {
      customOptions: {
        // Fastify defaults to removeAdditional: true, which silently STRIPS a
        // property the schema does not name. For an API two other people are
        // writing clients against, that turns a version mismatch or a typo'd
        // field name into a request that succeeds having quietly discarded
        // something the caller believed they sent. Rejecting is the honest
        // answer: `additionalProperties: false` now means 400, not "deleted".
        removeAdditional: false,
        // Report every problem in one response instead of making the client
        // fix one field per round trip.
        allErrors: true,
      },
    },
  });

  // STE-20. Before the routes: a rate limit registered afterwards would not
  // cover them, and the OpenAPI document has to see every schema.
  registerHardening(app, config);
  registerErrorHandler(app);

  /**
   * The core routes go through `register` like every other router, and that is
   * not decoration. `app.register` queues a plugin; a route added synchronously
   * runs before the queue does, which means it is mounted before
   * @fastify/swagger has installed its onRoute hook and never appears in the
   * OpenAPI document. Registering them the same way as everything else puts
   * them in the same queue, after swagger.
   */
  void app.register(async (instance) => {
    /**
     * Liveness. Deliberately does NOT touch the network or the database: a health
     * check that calls Horizon reports someone else's outage as our own, and gets
     * a container restarted for it.
     */
    instance.get("/health", async () => ({ status: "ok", uptimeSeconds: Math.floor(process.uptime()) }));

    /**
     * What this process believes about the world — the addresses it resolved and
     * which capabilities are switched on. This is the endpoint you hit first when
     * a client is talking to the wrong contract, and it answers that in one
     * request instead of a debugging session.
     *
     * Safe to expose: every value here is public on-chain data already published
     * in docs/deployments.md. No secret is read or reported, only whether one is
     * configured at all.
     */
    instance.get("/config", async () => ({
      network: {
        name: config.network.name,
        passphrase: config.network.passphrase,
        rpcUrl: config.network.rpcUrl,
        horizonUrl: config.network.horizonUrl,
      },
      addresses: config.addresses,
      faucet: {
        amountStroops: config.faucetAmount.toString(),
        payoutConfigured: config.distributorSecret !== undefined,
      },
      indexer: {
        // Whether the read endpoints are mounted, not whether a poller is running
        // — those are different processes, and /indexer/status answers the second.
        enabled: deps.pool !== undefined,
      },
      roster: {
        enabled: deps.pool !== undefined && deps.vault !== undefined && deps.reader !== undefined,
      },
      results: {
        enabled: deps.pool !== undefined && deps.reader !== undefined,
      },
      vault: {
        enabled: deps.vault !== undefined,
        // The key IDS, never the keys. Which key is active is what you need to
        // know when a decrypt fails after a rotation, and it is not a secret.
        keyIds: config.vault?.keyring.keyIds ?? [],
        activeKeyId: config.vault?.keyring.activeKeyId ?? null,
      },
    }));
  });

  // One ChallengeStore for the whole process: a nonce issued at
  // /auth/challenge has to be spendable at /participants AND at the roster
  // endpoint, and two stores would make that depend on which router answered.
  const challenges = deps.challenges ?? new ChallengeStore();

  // STE-20. Mounted once, next to whatever needs it — never inside one router.
  // The results upload authenticates but needs no vault, so a deployment with
  // Postgres and RPC and no PII_KEYS must still be able to issue a nonce.
  if (deps.vault || (deps.pool && deps.reader)) {
    void app.register(async (instance) => authRoutes(instance, challenges));
  }

  if (deps.vault) {
    const vault = deps.vault;
    void app.register(async (instance) => participantRoutes(instance, { vault, challenges }));
  }

  if (deps.pool) {
    const pool = deps.pool;
    void app.register(async (instance) => directoryRoutes(instance, pool));
  }

  if (deps.pool && deps.vault && deps.reader) {
    const roster = { pool: deps.pool, vault: deps.vault, reader: deps.reader, challenges };
    void app.register(async (instance) => rosterRoutes(instance, roster));
  }

  // STE-20. Needs the index (to resolve bib -> token_id) and the chain (to ask
  // who the organiser is). No vault: a results file contains bib numbers and
  // times, and nothing that identifies a person.
  if (deps.pool && deps.reader) {
    const results = { pool: deps.pool, reader: deps.reader, challenges };
    void app.register(async (instance) => resultsRoutes(instance, results));
  }

  return app;
}
