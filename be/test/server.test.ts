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
