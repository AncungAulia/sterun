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

  describe("PII_INDEX_KEY (STE-51)", () => {
    const VAULT = {
      DATABASE_URL: "postgres://sterun:sterun@127.0.0.1:55432/sterun",
      PII_KEYS: `1:${"cd".repeat(32)}`,
      PII_ACTIVE_KEY_ID: "1",
    };

    it("is required whenever the vault is on", () => {
      // Optional would mean a deployment that forgot one variable quietly
      // accepts a second entry by the same person.
      expect(() => loadConfig(VAULT)).toThrow(/PII_INDEX_KEY/);
    });

    it("is loaded as 32 bytes next to the keyring", () => {
      const hex = "ef".repeat(32);
      expect(loadConfig({ ...VAULT, PII_INDEX_KEY: hex }).vault?.indexKey.toString("hex")).toBe(hex);
    });

    it("refuses a malformed key without printing it", () => {
      const bad = "not-a-key-but-could-have-been-one";
      expect(() => loadConfig({ ...VAULT, PII_INDEX_KEY: bad })).toThrow(/64 lowercase hex/);
      expect(() => loadConfig({ ...VAULT, PII_INDEX_KEY: bad })).not.toThrow(new RegExp(bad));
    });

    it("is not needed when the vault is off", () => {
      expect(loadConfig({}).vault).toBeUndefined();
    });
  });

  describe("values that fail quietly when wrong are refused at startup", () => {
    it.each([
      ["FAUCET_AMOUNT_STROOPS", ""],
    ])("treats an empty %s as unset, not as zero", (name, value) => {
      // BigInt("") is 0n: a faucet that starts and then fails every payout.
      expect(loadConfig({ [name]: value }).faucetAmount).toBe(500_000_000n);
    });

    it.each([
      ["FAUCET_AMOUNT_STROOPS", "0", /greater than 0/],
      ["FAUCET_AMOUNT_STROOPS", "1.5", /whole number of stroops/],
      ["FAUCET_DAILY_CAP_STROOPS", "0", /greater than 0/],
      ["FAUCET_WINDOW_HOURS", "0", /between 1 and/],
      ["VAULT_UNCONFIRMED_TTL_HOURS", "0", /between 1 and/],
      ["VAULT_SWEEP_INTERVAL_MS", "0", /between 60000 and/],
      ["VAULT_SWEEP_INTERVAL_MS", "2147483648", /between 60000 and 2147483647/],
    ])("refuses %s=%s", (name, value, message) => {
      expect(() => loadConfig({ [name]: value })).toThrow(message);
    });

    it("keeps the defaults when nothing is set", () => {
      const c = loadConfig({});
      expect(c.faucetDailyCapStroops).toBe(50_000_000_000n);
      expect(c.retention).toEqual({ unconfirmedHours: 24, sweepIntervalMs: 3_600_000 });
    });
  });

  it("binds to loopback by default — deployment opts in to exposure", () => {
    expect(loadConfig({}).host).toBe("127.0.0.1");
    expect(loadConfig({ HOST: "0.0.0.0" }).host).toBe("0.0.0.0");
  });
});
