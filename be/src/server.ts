/**
 * The Sterun API.
 *
 * Two shapes of process come out of this factory, and which one you get is
 * decided by configuration rather than by a flag:
 *
 *   without a vault  /health and /config only. This is what `pnpm dev` gives
 *                    someone who has just cloned the repo, and it is useful —
 *                    it answers "which contracts am I pointed at?" with no
 *                    Postgres, no keys, no setup.
 *   with a vault     the participant routes as well. Reached by setting
 *                    DATABASE_URL and PII_KEYS together; setting one without
 *                    the other is refused in config.ts rather than half-served
 *                    here.
 *
 * `buildServer` is a factory rather than a module-level singleton so tests use
 * inject() without opening a socket.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { ChallengeStore } from "./auth.js";
import type { Config } from "./config.js";
import { participantRoutes } from "./routes/participants.js";
import type { Vault } from "./vault.js";

export interface ServerDeps {
  /** Present exactly when this process runs the PII vault. */
  vault?: Vault;
  /** Injectable so auth tests can control the clock. */
  challenges?: ChallengeStore;
}

export function buildServer(config: Config, deps: ServerDeps = {}): FastifyInstance {
  // `logger: false` in tests silences request logging on its own — Fastify 5
  // deprecated the separate `disableRequestLogging` flag, and setting both
  // would print a deprecation warning on every buildServer call.
  const app = Fastify({
    logger: config.env !== "test" && { level: process.env.LOG_LEVEL ?? "info" },
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

  /**
   * Liveness. Deliberately does NOT touch the network or the database: a health
   * check that calls Horizon reports someone else's outage as our own, and gets
   * a container restarted for it.
   */
  app.get("/health", async () => ({ status: "ok", uptimeSeconds: Math.floor(process.uptime()) }));

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
  app.get("/config", async () => ({
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
    vault: {
      enabled: deps.vault !== undefined,
      // The key IDS, never the keys. Which key is active is what you need to
      // know when a decrypt fails after a rotation, and it is not a secret.
      keyIds: config.vault?.keyring.keyIds ?? [],
      activeKeyId: config.vault?.keyring.activeKeyId ?? null,
    },
  }));

  if (deps.vault) {
    const vault = deps.vault;
    const challenges = deps.challenges ?? new ChallengeStore();
    void app.register(async (instance) => participantRoutes(instance, { vault, challenges }));
  }

  return app;
}
