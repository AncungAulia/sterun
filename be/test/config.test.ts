/**
 * Precedence is the whole point of this module: environment beats the
 * document, the document beats nothing, and there is no third fallback. A
 * hardcoded address sneaking in as a "default" is the bug these tests exist to
 * prevent — it would let the backend keep working while pointing at a contract
 * nobody deployed from this repo.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { DEPLOYMENTS_MD } from "../src/deployments.js";

describe("loadConfig", () => {
  it("defaults every address to docs/deployments.md", () => {
    const c = loadConfig({});
    const doc = readFileSync(DEPLOYMENTS_MD, "utf8");
    for (const address of Object.values(c.addresses)) {
      expect(doc).toContain(address);
    }
  });

  it("lets the environment override one address without disturbing the rest", () => {
    const base = loadConfig({});
    const other = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const c = loadConfig({ RACE_RECORD: other });
    expect(c.addresses.raceRecord).toBe(other);
    expect(c.addresses.eventRegistry).toBe(base.addresses.eventRegistry);
  });

  it("defaults to testnet, and says so explicitly rather than by omission", () => {
    const c = loadConfig({});
    expect(c.network.name).toBe("testnet");
    expect(c.network.passphrase).toBe("Test SDF Network ; September 2015");
    expect(c.network.rpcUrl).toBe("https://soroban-testnet.stellar.org");
  });

  it("takes the faucet amount in stroops, as a bigint", () => {
    expect(loadConfig({}).faucetAmount).toBe(500_000_000n); // 50 sUSD
    expect(loadConfig({ FAUCET_AMOUNT_STROOPS: "1" }).faucetAmount).toBe(1n);
  });

  it("rejects a non-integer PORT instead of silently listening on NaN", () => {
    expect(() => loadConfig({ PORT: "3001.5" })).toThrow(/expected an integer/);
    expect(() => loadConfig({ PORT: "http" })).toThrow(/expected an integer/);
  });

  it("binds to loopback by default — deployment opts in to exposure", () => {
    expect(loadConfig({}).host).toBe("127.0.0.1");
    expect(loadConfig({ HOST: "0.0.0.0" }).host).toBe("0.0.0.0");
  });
});
