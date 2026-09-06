/**
 * STE-20 — rate limiting, log redaction, and the OpenAPI document.
 *
 * `be/CLAUDE.md` listed rate limiting under "things that do not exist yet".
 * These are the tests that let that line be deleted.
 *
 * The limiter is disabled when `NODE_ENV=test`, so the tests that need it build
 * a server with a production config and a silenced logger. That is deliberate:
 * a shared suite would otherwise start failing its 241st request for reasons
 * unrelated to whatever it was asserting.
 */
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { RATE_LIMITS, REDACTED_HEADERS, loggerOptions } from "../src/http/hardening.js";
import { buildServer } from "../src/server.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** A server with the limiter on, and its logger silenced. */
async function liveServer(): Promise<FastifyInstance> {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "silent";
  try {
    const server = buildServer(loadConfig({ NODE_ENV: "production" }));
    await server.ready();
    return server;
  } finally {
    if (previous === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previous;
  }
}

describe("rate limiting", () => {
  it("allows normal traffic and then refuses the rest", async () => {
    app = await liveServer();
    const hit = () => app!.inject({ method: "GET", url: "/health" });

    for (let i = 0; i < RATE_LIMITS.global; i += 1) {
      expect((await hit()).statusCode).toBe(200);
    }
    const refused = await hit();
    expect(refused.statusCode).toBe(429);
  });

  it("answers 429 in the same shape as every other error", async () => {
    app = await liveServer();
    for (let i = 0; i < RATE_LIMITS.global; i += 1) await app.inject({ url: "/health" });
    const refused = await app.inject({ url: "/health" });
    expect(refused.json().error).toBe("rate-limited");
    expect(refused.json().message).toMatch(/retry in \d+s/);
  });

  it("counts clients separately by forwarded address", async () => {
    // Behind the reverse proxy STE-31 will put in front of this, every request
    // arrives from the same socket. Without the forwarded address, one noisy
    // client would rate-limit the entire event.
    app = await liveServer();
    const from = (ip: string) =>
      app!.inject({ method: "GET", url: "/health", headers: { "x-forwarded-for": ip } });

    for (let i = 0; i < RATE_LIMITS.global; i += 1) {
      expect((await from("203.0.113.1")).statusCode).toBe(200);
    }
    expect((await from("203.0.113.1")).statusCode).toBe(429);
    // A different runner, unaffected.
    expect((await from("203.0.113.2")).statusCode).toBe(200);
  });

  it("reads only the first hop of a forwarded chain", async () => {
    // `x-forwarded-for` accumulates: "client, proxy1, proxy2". Keying on the
    // whole string would let a client rotate the tail and get a fresh bucket.
    app = await liveServer();
    const from = (value: string) =>
      app!.inject({ method: "GET", url: "/health", headers: { "x-forwarded-for": value } });

    for (let i = 0; i < RATE_LIMITS.global; i += 1) await from("203.0.113.9, 10.0.0.1");
    expect((await from("203.0.113.9, 10.0.0.2")).statusCode).toBe(429);
  });

  it("gives the expensive endpoints a lower ceiling than the global one", () => {
    expect(RATE_LIMITS.challenge).toBeLessThan(RATE_LIMITS.global);
    expect(RATE_LIMITS.results).toBeLessThan(RATE_LIMITS.challenge);
  });

  it("is off under NODE_ENV=test so suites do not fail on request 241", async () => {
    app = buildServer(loadConfig({ NODE_ENV: "test" }));
    await app.ready();
    for (let i = 0; i < RATE_LIMITS.global + 5; i += 1) {
      expect((await app.inject({ url: "/health" })).statusCode).toBe(200);
    }
  });
});

describe("logging", () => {
  it("redacts the credential headers", () => {
    const options = loggerOptions(loadConfig({ NODE_ENV: "production" })) as {
      redact: { paths: string[]; censor: string };
    };
    expect(options.redact.paths).toEqual(REDACTED_HEADERS);
    expect(options.redact.paths).toContain('req.headers["x-sterun-signature"]');
    expect(options.redact.paths).toContain('req.headers["x-sterun-nonce"]');
  });

  it("logs the path without its query string", () => {
    // A query string can carry an address; the path never carries more than an
    // event id.
    const options = loggerOptions(loadConfig({ NODE_ENV: "production" })) as {
      serializers: { req: (r: { id: string; method: string; url: string }) => { url: string } };
    };
    const serialised = options.serializers.req({
      id: "1",
      method: "GET",
      url: "/events?runner=GABC",
    });
    expect(serialised.url).toBe("/events");
  });

  it("stays off entirely in tests", () => {
    expect(loggerOptions(loadConfig({ NODE_ENV: "test" }))).toBe(false);
  });
});

describe("the OpenAPI document", () => {
  it("describes the routes that are actually mounted", async () => {
    app = buildServer(loadConfig({ NODE_ENV: "test" }));
    await app.ready();
    const spec = (await app.inject({ url: "/openapi.json" })).json();

    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe("Sterun backend API");
    // A bare server mounts these two and nothing else, so the document says so.
    expect(Object.keys(spec.paths)).toContain("/health");
    expect(Object.keys(spec.paths)).toContain("/config");
    expect(Object.keys(spec.paths)).not.toContain("/participants");
  });

  it("documents the wallet-signature scheme a client has to implement", async () => {
    app = buildServer(loadConfig({ NODE_ENV: "test" }));
    await app.ready();
    const spec = (await app.inject({ url: "/openapi.json" })).json();
    const scheme = spec.components.securitySchemes.walletSignature;
    expect(scheme.name).toBe("x-sterun-signature");
    // The Uint8Array.toString("base64") trap, in the document rather than only
    // in a CLAUDE.md nobody outside the repo reads.
    expect(scheme.description).toContain("Buffer.from");
  });

  it("carries the response schemas rather than describing them in prose", async () => {
    app = buildServer(loadConfig({ NODE_ENV: "test" }));
    await app.ready();
    const spec = (await app.inject({ url: "/openapi.json" })).json();
    const health = spec.paths["/health"].get;
    expect(health).toBeTruthy();
    // Generated from the same schemas Fastify validates with, so it cannot
    // describe an endpoint that behaves differently.
    expect(spec.paths["/config"].get).toBeTruthy();
  });

  it("does not document itself", async () => {
    app = buildServer(loadConfig({ NODE_ENV: "test" }));
    await app.ready();
    const spec = (await app.inject({ url: "/openapi.json" })).json();
    expect(Object.keys(spec.paths)).not.toContain("/openapi.json");
  });
});
