/**
 * `lib/wallet.ts` is the only module allowed to touch Stellar Wallets Kit, so
 * the kit is mocked here and nowhere else. What is worth asserting is not that
 * the kit works, but that this wrapper behaves sanely around it: a cancelled
 * modal is not a crash, a first visit is not an error, and a passphrase the kit
 * does not know is refused rather than silently signing on another network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kit = {
  init: vi.fn(),
  authModal: vi.fn(),
  getAddress: vi.fn(),
  disconnect: vi.fn(),
  signTransaction: vi.fn(),
  on: vi.fn(),
};

const parseError = vi.fn();

vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  StellarWalletsKit: kit,
  parseError: (e: unknown) => parseError(e),
  Networks: {
    PUBLIC: "Public Global Stellar Network ; September 2015",
    TESTNET: "Test SDF Network ; September 2015",
    FUTURENET: "Test SDF Future Network ; October 2022",
    SANDBOX: "Local Sandbox Stellar Network ; September 2022",
    STANDALONE: "Standalone Network ; February 2017",
  },
  KitEventType: {
    STATE_UPDATED: "STATE_UPDATE",
    WALLET_SELECTED: "WALLET_SELECTED",
    DISCONNECT: "DISCONNECT",
  },
}));

vi.mock("@creit.tech/stellar-wallets-kit/modules/utils", () => ({
  defaultModules: () => [{ productId: "freighter" }],
}));

const ADDRESS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

async function loadWallet() {
  vi.resetModules();
  return import("@/lib/wallet");
}

beforeEach(() => {
  vi.clearAllMocks();
  parseError.mockImplementation((e: unknown) => ({ code: -1, message: String(e) }));
});

afterEach(() => vi.unstubAllEnvs());

describe("initWallet", () => {
  it("starts the kit on the configured network", async () => {
    const wallet = await loadWallet();
    wallet.initWallet();

    expect(kit.init).toHaveBeenCalledTimes(1);
    expect(kit.init.mock.calls[0][0]).toMatchObject({
      network: "Test SDF Network ; September 2015",
    });
  });

  it("is idempotent, because strict mode mounts effects twice", async () => {
    const wallet = await loadWallet();
    wallet.initWallet();
    wallet.initWallet();
    wallet.initWallet();

    expect(kit.init).toHaveBeenCalledTimes(1);
  });

  it("refuses a passphrase the kit does not know instead of guessing", async () => {
    vi.stubEnv("NEXT_PUBLIC_NETWORK_PASSPHRASE", "Definitely Not A Stellar Network");
    const wallet = await loadWallet();

    expect(() => wallet.initWallet()).toThrow(/not a network Stellar Wallets Kit knows/);
    expect(kit.init).not.toHaveBeenCalled();
  });
});

describe("connectWallet", () => {
  it("returns the address the modal resolved with", async () => {
    kit.authModal.mockResolvedValue({ address: ADDRESS });
    const wallet = await loadWallet();

    await expect(wallet.connectWallet()).resolves.toBe(ADDRESS);
  });

  it("propagates a rejection so the caller can treat it as a cancellation", async () => {
    kit.authModal.mockRejectedValue(new Error("User closed the modal"));
    const wallet = await loadWallet();

    await expect(wallet.connectWallet()).rejects.toThrow("User closed the modal");
  });
});

describe("restoreAddress", () => {
  it("returns the address the kit already holds", async () => {
    kit.getAddress.mockResolvedValue({ address: ADDRESS });
    const wallet = await loadWallet();

    await expect(wallet.restoreAddress()).resolves.toBe(ADDRESS);
  });

  it("returns null on a first visit rather than throwing", async () => {
    // Nothing connected is the normal case on first load, not a failure.
    kit.getAddress.mockRejectedValue(new Error("No wallet selected"));
    const wallet = await loadWallet();

    await expect(wallet.restoreAddress()).resolves.toBeNull();
  });

  it("treats an empty address as not connected", async () => {
    kit.getAddress.mockResolvedValue({ address: "" });
    const wallet = await loadWallet();

    await expect(wallet.restoreAddress()).resolves.toBeNull();
  });
});

describe("onWalletStateChange", () => {
  it("reports the account the wallet switched to", async () => {
    const seen: (string | null)[] = [];
    kit.on.mockImplementation((_type, callback) => {
      callback({ payload: { address: ADDRESS, networkPassphrase: "" } });
      return () => {};
    });
    const wallet = await loadWallet();

    wallet.onWalletStateChange((address) => seen.push(address));

    expect(seen).toEqual([ADDRESS]);
  });

  it("reports null when the wallet reports no account", async () => {
    const seen: (string | null)[] = [];
    kit.on.mockImplementation((_type, callback) => {
      callback({ payload: { address: undefined, networkPassphrase: "" } });
      return () => {};
    });
    const wallet = await loadWallet();

    wallet.onWalletStateChange((address) => seen.push(address));

    expect(seen).toEqual([null]);
  });

  it("hands back the kit's unsubscribe so effects can clean up", async () => {
    const unsubscribe = vi.fn();
    kit.on.mockReturnValue(unsubscribe);
    const wallet = await loadWallet();

    wallet.onWalletStateChange(() => {})();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("signTransaction", () => {
  it("defaults to the configured network passphrase", async () => {
    kit.signTransaction.mockResolvedValue({ signedTxXdr: "signed" });
    const wallet = await loadWallet();

    await wallet.signTransaction("unsigned-xdr");

    expect(kit.signTransaction).toHaveBeenCalledWith("unsigned-xdr", {
      networkPassphrase: "Test SDF Network ; September 2015",
      address: undefined,
    });
  });

  it("lets a caller sign as a specific account", async () => {
    // Sterun signs as four different actors within one flow, so the source
    // account has to be overridable per call.
    kit.signTransaction.mockResolvedValue({ signedTxXdr: "signed" });
    const wallet = await loadWallet();

    await wallet.signTransaction("unsigned-xdr", { address: ADDRESS });

    expect(kit.signTransaction).toHaveBeenCalledWith(
      "unsigned-xdr",
      expect.objectContaining({ address: ADDRESS }),
    );
  });
});

describe("walletErrorMessage", () => {
  it("uses the kit's parsed message", async () => {
    parseError.mockReturnValue({ code: 4, message: "User declined access" });
    const wallet = await loadWallet();

    expect(wallet.walletErrorMessage(new Error("raw"))).toBe("User declined access");
  });

  it("falls back to the Error message when the kit cannot parse it", async () => {
    parseError.mockImplementation(() => {
      throw new Error("not a kit error");
    });
    const wallet = await loadWallet();

    expect(wallet.walletErrorMessage(new Error("extension missing"))).toBe("extension missing");
  });

  it("never returns an empty string, so the UI always has something to show", async () => {
    parseError.mockReturnValue({ code: 0, message: "" });
    const wallet = await loadWallet();

    expect(wallet.walletErrorMessage({})).toBe("Wallet request failed.");
  });

  it("handles a thrown value that is not an Error at all", async () => {
    parseError.mockImplementation(() => {
      throw new Error("unparseable");
    });
    const wallet = await loadWallet();

    expect(wallet.walletErrorMessage("just a string")).toBe("Wallet request failed.");
  });
});
