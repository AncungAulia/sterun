/**
 * The API skeleton. Small surface, but two things are worth locking down now:
 * /health must not depend on the network, and /config must never leak a secret
 * while still being useful enough to diagnose "the client is talking to the
 * wrong contract" in one request.
 */
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildServer } from "../src/server.js";

const config = loadConfig({ NODE_ENV: "test" });

describe("GET /health", () => {
  it("answers ok without touching Horizon or RPC", async () => {
    // No network mocking anywhere in this file — if /health reached out, this
    // test would be slow and flaky, which is the failure we want to prevent.
    const app = buildServer(config);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
    expect(res.json().uptimeSeconds).toBeTypeOf("number");
    await app.close();
  });
});

describe("GET /config", () => {
  it("reports the addresses this process actually resolved", async () => {
    const app = buildServer(config);
    const body = (await app.inject({ method: "GET", url: "/config" })).json();
    expect(body.addresses).toEqual(config.addresses);
    expect(body.network.passphrase).toBe("Test SDF Network ; September 2015");
    await app.close();
  });

  it("never serialises the distributor secret, only whether one is set", async () => {
    const withSecret = loadConfig({
      NODE_ENV: "test",
      SUSD_DISTRIBUTOR_SECRET: "SCZANGBA5YHTNYVVV4C3U252E2B6P6F5T3U6MM63WBSBZATAQI3EBTQ4",
    });
    const app = buildServer(withSecret);
    const res = await app.inject({ method: "GET", url: "/config" });
    expect(res.body).not.toContain("SCZANGBA");
    expect(res.json().faucet.payoutConfigured).toBe(true);
    await app.close();
  });

  it("says payouts are unconfigured when the key is absent", async () => {
    const app = buildServer(loadConfig({ NODE_ENV: "test" }));
    const res = await app.inject({ method: "GET", url: "/config" });
    expect(res.json().faucet.payoutConfigured).toBe(false);
    await app.close();
  });
});

describe("unknown routes", () => {
  it("404s rather than falling through to something", async () => {
    const app = buildServer(config);
    expect((await app.inject({ method: "GET", url: "/nope" })).statusCode).toBe(404);
    await app.close();
  });
});

describe("readiness is a different question from liveness", () => {
  it("reports ready with no database, because there is nothing to wait for", async () => {
    // A deployment with neither Postgres nor keys is a legitimate one — it
    // serves /health and /config — and it is ready the moment it is alive.
    const app = buildServer(loadConfig({ NODE_ENV: "test" }));
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready", checks: { database: "not-configured" } });
  });

  it("reports ready when the database answers", async () => {
    const pool = { query: async () => ({ rows: [{ "?column?": 1 }] }) };
    const app = buildServer(loadConfig({ NODE_ENV: "test" }), { pool: pool as never });
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json().checks.database).toBe("ok");
  });

  it("answers 503 when it does not, so a proxy stops sending traffic here", async () => {
    const pool = {
      query: async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
      },
    };
    const app = buildServer(loadConfig({ NODE_ENV: "test" }), { pool: pool as never });
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "not-ready", checks: { database: "unreachable" } });
    // The reason belongs in the log. This endpoint is public and unauthenticated.
    expect(res.payload).not.toContain("ECONNREFUSED");
    expect(res.payload).not.toContain("10.0.0.5");
  });

  it("still reports /health as ok when the database is down", async () => {
    // The distinction that matters: a liveness probe that failed here would
    // restart a perfectly good process because Postgres hiccuped.
    const pool = {
      query: async () => {
        throw new Error("down");
      },
    };
    const app = buildServer(loadConfig({ NODE_ENV: "test" }), { pool: pool as never });
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
  });
});
