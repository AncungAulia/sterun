/**
 * STE-6 — the API skeleton.
 *
 * Deliberately small. This ticket is infrastructure: the point is that
 * `pnpm dev` starts something that answers, that CI can build and test it, and
 * that the next tickets (STE-11 PII vault, STE-16 indexer) have a server to
 * attach to. Routes with real behaviour arrive with those tickets.
 *
 * `buildServer` is a factory rather than a module-level singleton so tests can
 * spin one up with `inject()` and no listening socket.
 */
import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.js";

export function buildServer(config: Config): FastifyInstance {
  // `logger: false` in tests silences request logging on its own — Fastify 5
  // deprecated the separate `disableRequestLogging` flag, and setting both
  // would print a deprecation warning on every buildServer call.
  const app = Fastify({
    logger: config.env !== "test" && { level: process.env.LOG_LEVEL ?? "info" },
  });

  /**
   * Liveness. Deliberately does NOT touch the network: a health check that
   * calls Horizon reports someone else's outage as our own, and gets a
   * container restarted for it.
   */
  app.get("/health", async () => ({ status: "ok", uptimeSeconds: Math.floor(process.uptime()) }));

  /**
   * What this process believes about the world — the addresses it resolved and
   * where they came from. This is the endpoint you hit first when a client is
   * talking to the wrong contract, and it answers that question in one request
   * instead of a debugging session.
   *
   * Safe to expose: every value here is public on-chain data, already published
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
      // The API process is not meant to hold this. Reported so a deployment
      // can be told apart from a misconfiguration at a glance.
      payoutConfigured: config.distributorSecret !== undefined,
    },
  }));

  return app;
}
