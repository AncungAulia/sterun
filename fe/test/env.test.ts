/**
 * `lib/env.ts` reads process.env at module load, which is the whole point: a
 * missing address should stop the app at boot rather than surface as a failed
 * contract call three screens in. Testing it therefore means re-importing the
 * module per case with a different environment.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const PUBLIC_PASSPHRASE = "Public Global Stellar Network ; September 2015";

const VALID = {
  NEXT_PUBLIC_RPC_URL: "https://soroban-testnet.stellar.org",
  NEXT_PUBLIC_NETWORK_PASSPHRASE: TESTNET_PASSPHRASE,
  NEXT_PUBLIC_EVENT_REGISTRY: "CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64",
  NEXT_PUBLIC_RACE_RECORD: "CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4",
  NEXT_PUBLIC_SUSD_SAC: "CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU",
};

async function loadEnv(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...VALID, ...overrides })) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
  return import("@/lib/env");
}

afterEach(() => vi.unstubAllEnvs());

describe("positive", () => {
  it("reads the network and all three contract ids", async () => {
    const env = await loadEnv();

    expect(env.NETWORK.rpcUrl).toBe("https://soroban-testnet.stellar.org");
    expect(env.NETWORK.networkPassphrase).toBe(TESTNET_PASSPHRASE);
    expect(env.CONTRACTS.eventRegistry).toBe(VALID.NEXT_PUBLIC_EVENT_REGISTRY);
    expect(env.CONTRACTS.raceRecord).toBe(VALID.NEXT_PUBLIC_RACE_RECORD);
    expect(env.CONTRACTS.susdSac).toBe(VALID.NEXT_PUBLIC_SUSD_SAC);
  });

  it("accepts the deployed addresses from docs/deployments.md", async () => {
    // Guards against a regex that happens to pass a hand-written fixture but
    // rejects the real ids the app has to run against.
    const env = await loadEnv();
    for (const id of Object.values(env.CONTRACTS)) {
      expect(id).toMatch(/^C[A-Z2-7]{55}$/);
    }
  });
});

describe("negative", () => {
  it.each([
    ["NEXT_PUBLIC_RPC_URL"],
    ["NEXT_PUBLIC_NETWORK_PASSPHRASE"],
    ["NEXT_PUBLIC_EVENT_REGISTRY"],
    ["NEXT_PUBLIC_RACE_RECORD"],
    ["NEXT_PUBLIC_SUSD_SAC"],
  ])("fails at import when %s is missing, and names it", async (key) => {
    await expect(loadEnv({ [key]: undefined })).rejects.toThrow(key);
  });

  it("names the file to copy, so the fix does not need a maintainer", async () => {
    await expect(loadEnv({ NEXT_PUBLIC_RPC_URL: undefined })).rejects.toThrow(/\.env\.example/);
  });

  it.each([
    ["lowercase", "cdl6a734h5ditofc5vgsaaioqbbgsh2niidu4kjdao734i3zrl4gta64"],
    ["wrong prefix", "GDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64"],
    ["one character short", "CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA6"],
    ["base32 padding character", "CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA6="],
    ["a URL pasted by mistake", "https://stellar.expert/explorer/testnet"],
  ])("rejects a contract id that is %s", async (_label, value) => {
    await expect(loadEnv({ NEXT_PUBLIC_EVENT_REGISTRY: value })).rejects.toThrow(
      /not a contract id/,
    );
  });

  it("rejects an address that is valid base32 but the wrong length", async () => {
    // 0 and 1 are not in the base32 alphabet Stellar uses, so an id carrying
    // them is a typo rather than a different network's address.
    await expect(
      loadEnv({ NEXT_PUBLIC_RACE_RECORD: "C01L6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4G" }),
    ).rejects.toThrow(/not a contract id/);
  });
});

describe("edge", () => {
  it("leaves the API URL empty rather than failing, since nothing calls it yet", async () => {
    const env = await loadEnv({ NEXT_PUBLIC_API_URL: undefined });
    expect(env.API_URL).toBe("");
  });

  it("points the explorer at testnet", async () => {
    const env = await loadEnv();
    expect(env.EXPLORER_BASE).toBe("https://stellar.expert/explorer/testnet");
  });

  it("points the explorer at the public network when configured for it", async () => {
    const env = await loadEnv({ NEXT_PUBLIC_NETWORK_PASSPHRASE: PUBLIC_PASSPHRASE });
    expect(env.EXPLORER_BASE).toBe("https://stellar.expert/explorer/public");
  });

  it("returns no explorer for a network that has none, instead of a dead link", async () => {
    const env = await loadEnv({
      NEXT_PUBLIC_NETWORK_PASSPHRASE: "Standalone Network ; February 2017",
    });
    expect(env.EXPLORER_BASE).toBe("");
  });
});
