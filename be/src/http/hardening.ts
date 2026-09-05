/**
 * STE-20 — rate limiting, request logging, and the OpenAPI document.
 *
 * `be/CLAUDE.md` listed rate limiting under "things that do not exist yet, do
 * not assume they do". This is that item, plus the two things a service about
 * to sit on a public VPS (STE-31) needs alongside it.
 */
import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import type { Config } from "../config.js";

/**
 * Requests per minute per client, by how expensive the endpoint is.
 *
 * These are not tuned against measured traffic — there is none yet — so they
 * are set where a wrong guess is cheap: high enough that a scanner PWA
 * refreshing a roster or an organiser retrying an upload never notices, low
 * enough that an unattended loop is stopped before it costs anything.
 */
export const RATE_LIMITS = {
  /** Everything not named below. */
  global: 240,
  /**
   * Nonce issuance. Cheap for us and cheap for an attacker, which is exactly
   * why it is worth a lower ceiling: it is the endpoint someone hammers while
   * guessing at signatures.
   */
  challenge: 30,
  /**
   * The results upload. Up to 5 MB parsed, plus a full read of an event's
   * records — the most expensive request in the API by a wide margin.
   */
  results: 10,
} as const;

/**
 * Headers that must never reach a log line.
 *
 * `x-sterun-signature` is a spent credential and `x-sterun-nonce` is what it
 * was spent on; together they are the whole handshake. They are single-use, so
 * a leak is not catastrophic, but a log aggregator is exactly the place a
 * credential should not sit indefinitely — and `authorization` and `cookie` are
 * here because this service will grow one eventually and nobody will remember
 * to add them then.
 */
export const REDACTED_HEADERS = [
  'req.headers["x-sterun-signature"]',
  'req.headers["x-sterun-nonce"]',
  "req.headers.authorization",
  "req.headers.cookie",
];

export function loggerOptions(config: Config): Record<string, unknown> | false {
  if (config.env === "test") return false;
  return {
    level: process.env.LOG_LEVEL ?? "info",
    redact: { paths: REDACTED_HEADERS, censor: "[redacted]" },
    // One id per request, echoed to the client, so a report of "it failed at
    // 14:02" becomes a single log query rather than a guess.
    serializers: {
      req: (request: { id: string; method: string; url: string }) => ({
        id: request.id,
        method: request.method,
        // The query string can carry an address; the path never does anything
        // more identifying than an event id.
        url: request.url.split("?")[0],
      }),
    },
  };
}

/**
 * Rate limiting, request ids, and the OpenAPI document.
 *
 * Registered before the routers so the limit covers them, and so `/openapi.json`
 * sees every schema.
 *
 * Synchronous on purpose. `app.register` queues a plugin rather than running it,
 * and awaiting the first one would defer every later registration until after
 * `ready()` — by which point the routes are already mounted and it is too late
 * for a global hook. Both plugins wrap themselves with fastify-plugin, so they
 * break encapsulation and apply to the whole instance without a wrapper here.
 */
export function registerHardening(app: FastifyInstance, config: Config): void {
  // Off in tests: a suite that shares a process would otherwise start failing
  // its 241st request for reasons that have nothing to do with the assertion,
  // and the limiter's own behaviour is tested explicitly instead.
  if (config.env !== "test") {
    void app.register(rateLimit, {
      global: true,
      max: RATE_LIMITS.global,
      timeWindow: "1 minute",
      // Behind a reverse proxy (STE-31) the socket address is the proxy's, so
      // the forwarded address is what identifies a client. Falls back to the
      // socket when the header is absent, which is the direct-connection case.
      keyGenerator: (request) => {
        const forwarded = request.headers["x-forwarded-for"];
        const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
        return first?.split(",")[0]?.trim() ?? request.ip;
      },
      errorResponseBuilder: (_request, context) => ({
        statusCode: 429,
        error: "rate-limited",
        message: `too many requests; retry in ${Math.ceil(context.ttl / 1000)}s`,
      }),
    });
  }

  app.addHook("onSend", async (request, reply) => {
    // Echoed so a client can quote it. The 500 body says nothing else.
    void reply.header("x-request-id", request.id);
  });

  void app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Sterun backend API",
        version: "1.0.0",
        description:
          "PII vault, event directory, scanner roster bundle and results review for Sterun " +
          "(https://github.com/AncungAulia/sterun). Authenticated endpoints use a Stellar " +
          "wallet signature: POST /auth/challenge for a nonce, sign it with the account key, " +
          "then send x-sterun-address / x-sterun-nonce / x-sterun-signature. Nonces are " +
          "single-use and expire after two minutes.",
      },
      servers: [{ url: `http://${config.host}:${config.port}`, description: config.env }],
      components: {
        securitySchemes: {
          walletSignature: {
            type: "apiKey",
            in: "header",
            name: "x-sterun-signature",
            description:
              "Base64 Ed25519 signature over the nonce, sent with x-sterun-address and " +
              "x-sterun-nonce. Buffer.from(keypair.sign(Buffer.from(nonce))).toString('base64') " +
              "— Uint8Array.toString('base64') ignores its argument and produces \"12,34,…\".",
          },
        },
      },
    },
  });

  /**
   * The document itself, served rather than committed.
   *
   * Generated from the same JSON schemas Fastify validates and serialises with,
   * so it cannot describe an endpoint that does not behave that way — which is
   * the failure mode of every hand-maintained API document.
   */
  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());
}
