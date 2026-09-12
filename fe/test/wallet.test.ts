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
  signMessage: vi.fn(),
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

/** Every set of params the kit's WalletConnect module was constructed with. */
const wcModuleParams: unknown[] = [];

vi.mock("@creit.tech/stellar-wallets-kit/modules/wallet-connect", () => ({
  WalletConnectModule: class {
    productId = "wallet_connect";
    constructor(params: unknown) {
      wcModuleParams.push(params);
    }
    // What the real module answers inside the Freighter mobile browser.
    async isPlatformWrapper() {
      return true;
    }
  },
  WalletConnectTargetChain: { PUBLIC: "stellar:pubnet", TESTNET: "stellar:testnet" },
}));

type Session = { namespaces: { stellar?: { accounts: string[] } } };

const provider = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  request: vi.fn(),
  on: vi.fn(),
  session: undefined as Session | undefined,
};
const initProvider = vi.fn(async () => provider);

vi.mock("@walletconnect/universal-provider", () => ({
  UniversalProvider: { init: () => initProvider() },
}));

const appKit = { open: vi.fn(), close: vi.fn() };

vi.mock("@reown/appkit/core", () => ({ createAppKit: () => appKit }));
vi.mock("@reown/appkit/networks", () => ({ mainnet: { id: 1, name: "Ethereum" } }));

const ADDRESS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
const PROJECT_ID = "0123456789abcdef0123456789abcdef";

async function loadWallet() {
  vi.resetModules();
  return import("@/lib/wallet");
}

/** Freighter's in-app browser announces itself on `window.stellar`. */
function insideFreighterMobile() {
  Object.defineProperty(window, "stellar", {
    configurable: true,
    value: { provider: "freighter", platform: "mobile" },
  });
}

function sessionFor(address: string): Session {
  return { namespaces: { stellar: { accounts: [`stellar:testnet:${address}`] } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  wcModuleParams.length = 0;
  provider.session = undefined;
  parseError.mockImplementation((e: unknown) => ({ code: -1, message: String(e) }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  Object.defineProperty(window, "stellar", { configurable: true, value: undefined });
});

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

describe("WalletConnect in the wallet picker", () => {
  const offered = () =>
    (kit.init.mock.calls[0][0].modules as { productId: string }[]).map((m) => m.productId);

  it("is left out when no project id is configured", async () => {
    // Without a Reown project id the relay refuses the pairing, so offering
    // the option would be a button that can only ever fail.
    const wallet = await loadWallet();
    wallet.initWallet();

    expect(offered()).toEqual(["freighter"]);
    expect(wcModuleParams).toEqual([]);
  });

  it("is offered next to the extension wallets once a project id is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID", PROJECT_ID);
    const wallet = await loadWallet();
    wallet.initWallet();

    expect(offered()).toEqual(["freighter", "wallet_connect"]);
    expect(wcModuleParams[0]).toMatchObject({
      projectId: PROJECT_ID,
      allowedChains: ["stellar:testnet"],
      metadata: { name: "Sterun" },
    });
  });

  it("asks mobile wallets for the network the app is configured for", async () => {
    // The kit defaults to pubnet when no chain is given. A testnet app pairing
    // on pubnet would sign for accounts that hold no sUSD at all.
    vi.stubEnv("NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID", PROJECT_ID);
    vi.stubEnv("NEXT_PUBLIC_NETWORK_PASSPHRASE", "Public Global Stellar Network ; September 2015");
    const wallet = await loadWallet();
    wallet.initWallet();

    expect(wcModuleParams[0]).toMatchObject({ allowedChains: ["stellar:pubnet"] });
  });

  it("leaves WalletConnect out on a network it has no chain for", async () => {
    // WalletConnect names only pubnet and testnet. Pairing a futurenet app on
    // either would sign for the wrong ledger without a word.
    vi.stubEnv("NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID", PROJECT_ID);
    vi.stubEnv("NEXT_PUBLIC_NETWORK_PASSPHRASE", "Test SDF Future Network ; October 2022");
    const wallet = await loadWallet();
    wallet.initWallet();

    expect(offered()).toEqual(["freighter"]);
  });

  it("ignores a project id that is only whitespace", async () => {
    vi.stubEnv("NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID", "   ");
    const wallet = await loadWallet();
    wallet.initWallet();

    expect(offered()).toEqual(["freighter"]);
  });

  it("does not claim the Freighter mobile browser, which is connected directly", async () => {
    // Left as-is the kit sees a "platform wrapper", skips the picker, and runs
    // its own pairing inside Freighter. That path is handled below instead.
    vi.stubEnv("NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID", PROJECT_ID);
    insideFreighterMobile();
    const wallet = await loadWallet();
    wallet.initWallet();

    const modules = kit.init.mock.calls[0][0].modules as {
      productId: string;
      isPlatformWrapper?: () => Promise<boolean>;
    }[];
    const walletConnect = modules.find((m) => m.productId === "wallet_connect");

    await expect(walletConnect?.isPlatformWrapper?.()).resolves.toBe(false);
  });
});

describe("inside the Freighter mobile browser", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID", PROJECT_ID);
    insideFreighterMobile();
  });

  describe("connectWallet", () => {
    it("pairs through WalletConnect directly rather than the kit picker", async () => {
      provider.connect.mockResolvedValue(sessionFor(ADDRESS));
      const wallet = await loadWallet();

      await expect(wallet.connectWallet()).resolves.toBe(ADDRESS);

      expect(kit.authModal).not.toHaveBeenCalled();
      const { namespaces } = provider.connect.mock.calls[0][0];
      expect(namespaces.stellar.chains).toEqual(["stellar:testnet"]);
      expect(namespaces.stellar.methods).toEqual(
        expect.arrayContaining(["stellar_signXDR", "stellar_signMessage"]),
      );
      expect(appKit.close).toHaveBeenCalled();
    });

    it("shows the pairing prompt when the provider hands over a uri", async () => {
      provider.connect.mockResolvedValue(sessionFor(ADDRESS));
      const wallet = await loadWallet();
      await wallet.connectWallet();

      const onDisplayUri = provider.on.mock.calls.find(([event]) => event === "display_uri")?.[1];
      onDisplayUri?.("wc:pairing@2");

      expect(appKit.open).toHaveBeenCalledWith({ uri: "wc:pairing@2" });
    });

    it("rejects when the prompt is closed without approving", async () => {
      provider.connect.mockResolvedValue(undefined);
      const wallet = await loadWallet();

      await expect(wallet.connectWallet()).rejects.toThrow(/cancelled/i);
      expect(appKit.close).toHaveBeenCalled();
    });

    it("refuses a session that carries no account", async () => {
      provider.connect.mockResolvedValue({ namespaces: { stellar: { accounts: [] } } });
      const wallet = await loadWallet();

      await expect(wallet.connectWallet()).rejects.toThrow(/did not share an account/i);
    });

    it("closes the prompt when pairing throws, so it does not hang over the page", async () => {
      provider.connect.mockRejectedValue(new Error("relay unreachable"));
      const wallet = await loadWallet();

      await expect(wallet.connectWallet()).rejects.toThrow("relay unreachable");
      expect(appKit.close).toHaveBeenCalled();
    });
  });

  describe("restoreAddress", () => {
    it("returns the account of the session WalletConnect kept", async () => {
      provider.session = sessionFor(ADDRESS);
      const wallet = await loadWallet();

      await expect(wallet.restoreAddress()).resolves.toBe(ADDRESS);
      expect(kit.getAddress).not.toHaveBeenCalled();
    });

    it("returns null on a first visit rather than throwing", async () => {
      const wallet = await loadWallet();

      await expect(wallet.restoreAddress()).resolves.toBeNull();
    });
  });

  describe("signTransaction", () => {
    it("asks the paired wallet to sign on the configured chain", async () => {
      provider.session = sessionFor(ADDRESS);
      provider.request.mockResolvedValue({ signedXDR: "signed" });
      const wallet = await loadWallet();

      await expect(wallet.signTransaction("unsigned-xdr")).resolves.toEqual({
        signedTxXdr: "signed",
      });
      expect(provider.request).toHaveBeenCalledWith(
        { method: "stellar_signXDR", params: { xdr: "unsigned-xdr" } },
        "stellar:testnet",
      );
      expect(kit.signTransaction).not.toHaveBeenCalled();
    });

    it("refuses to sign without a session instead of sending into nothing", async () => {
      const wallet = await loadWallet();

      await expect(wallet.signTransaction("unsigned-xdr")).rejects.toThrow(
        /no longer connected/i,
      );
      expect(provider.request).not.toHaveBeenCalled();
    });
  });

  describe("signMessage", () => {
    it("returns the signature the paired wallet produced", async () => {
      provider.session = sessionFor(ADDRESS);
      provider.request.mockResolvedValue({ signature: "c2ln" });
      const wallet = await loadWallet();

      await expect(wallet.signMessage("nonce-abc")).resolves.toBe("c2ln");
      expect(provider.request).toHaveBeenCalledWith(
        { method: "stellar_signMessage", params: { message: "nonce-abc" } },
        "stellar:testnet",
      );
    });

    it("refuses an empty signature, by name", async () => {
      provider.session = sessionFor(ADDRESS);
      provider.request.mockResolvedValue({ signature: undefined });
      const wallet = await loadWallet();

      await expect(wallet.signMessage("nonce-abc")).rejects.toThrow(/cannot approve uploads/i);
    });
  });

  describe("disconnectWallet", () => {
    it("ends the WalletConnect session rather than the kit's", async () => {
      provider.session = sessionFor(ADDRESS);
      const wallet = await loadWallet();

      await wallet.disconnectWallet();

      expect(provider.disconnect).toHaveBeenCalled();
      expect(kit.disconnect).not.toHaveBeenCalled();
    });
  });

  it("stays on the kit when no project id is configured", async () => {
    // Without an id there is no relay to pair through; the kit's own Freighter
    // module is the only path that can still work.
    vi.stubEnv("NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID", "");
    kit.authModal.mockResolvedValue({ address: ADDRESS });
    const wallet = await loadWallet();

    await expect(wallet.connectWallet()).resolves.toBe(ADDRESS);
    expect(initProvider).not.toHaveBeenCalled();
  });
});

describe("connectWallet", () => {
  it("returns the address the modal resolved with", async () => {
    kit.authModal.mockResolvedValue({ address: ADDRESS });
    const wallet = await loadWallet();

    await expect(wallet.connectWallet()).resolves.toBe(ADDRESS);
  });

  it("keeps a desktop browser on the kit picker even with WalletConnect configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID", PROJECT_ID);
    kit.authModal.mockResolvedValue({ address: ADDRESS });
    const wallet = await loadWallet();

    await expect(wallet.connectWallet()).resolves.toBe(ADDRESS);
    expect(initProvider).not.toHaveBeenCalled();
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

describe("signMessage", () => {
  describe("positive", () => {
    it("returns the signature the wallet produced", async () => {
      // The backend wants base64 of 64 raw bytes as x-sterun-signature
      // (be/src/auth.ts), and that is exactly what the kit hands back, so this
      // wrapper must not re-encode it on the way through.
      kit.signMessage.mockResolvedValue({ signedMessage: "c2ln", signerAddress: ADDRESS });
      const wallet = await loadWallet();

      expect(await wallet.signMessage("nonce-abc")).toBe("c2ln");
    });

    it("signs as the account the caller names", async () => {
      // The wallet may hold several accounts. Signing a nonce issued to one of
      // them with another is a bad-signature the organiser cannot diagnose.
      kit.signMessage.mockResolvedValue({ signedMessage: "c2ln" });
      const wallet = await loadWallet();

      await wallet.signMessage("nonce-abc", { address: ADDRESS });

      expect(kit.signMessage).toHaveBeenCalledWith("nonce-abc", {
        networkPassphrase: "Test SDF Network ; September 2015",
        address: ADDRESS,
      });
    });
  });

  describe("negative", () => {
    it("refuses a wallet that cannot sign messages, by name", async () => {
      // signMessage is optional in the kit: Albedo and some hardware modules do
      // not implement it. "undefined is not a function" would send the reader
      // into our code; the wallet is what has to change.
      kit.signMessage.mockResolvedValue({ signedMessage: undefined });
      const wallet = await loadWallet();

      await expect(wallet.signMessage("nonce-abc")).rejects.toThrow(/cannot approve uploads/i);
    });
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
