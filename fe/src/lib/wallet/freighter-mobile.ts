/**
 * Freighter's mobile in-app browser, paired over WalletConnect without the kit.
 *
 * On a desktop browser, or a phone browser that is not Freighter's, the kit's
 * own WalletConnect module handles pairing: it shows a QR code or deep-links to
 * the wallet app. Inside Freighter's browser there is no second device to scan
 * with. The session is requested on WalletConnect's provider directly, with
 * every Stellar method Freighter mobile implements, which is the pairing we have
 * already seen work on a phone.
 *
 * Only `lib/wallet.ts` imports this. Everything here is browser-only.
 */
import { createAppKit, type AppKit } from "@reown/appkit/core";
import { mainnet } from "@reown/appkit/networks";
import { UniversalProvider } from "@walletconnect/universal-provider";

type Provider = Awaited<ReturnType<typeof UniversalProvider.init>>;
type Session = Provider["session"];

/** WalletConnect's CAIP-2 ids for Stellar. It has no id for any other network. */
export type StellarChain = "stellar:pubnet" | "stellar:testnet";

export interface WalletConnectMetadata {
  name: string;
  description: string;
  url: string;
  icons: string[];
}

export interface FreighterMobileConfig {
  projectId: string;
  chain: StellarChain;
  metadata: WalletConnectMetadata;
}

export interface FreighterMobileSession {
  /** Pairs with Freighter and resolves the account it approved. */
  connect(): Promise<string>;
  /** The account of a session WalletConnect kept from an earlier visit, or null. */
  address(): Promise<string | null>;
  request<T>(method: string, params: Record<string, string>): Promise<T>;
  disconnect(): Promise<void>;
}

/** Freighter's entry in the WalletConnect explorer, so the prompt leads with it. */
const FREIGHTER_WALLETCONNECT_ID =
  "997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380";

const STELLAR_METHODS = [
  "stellar_signXDR",
  "stellar_signAndSubmitXDR",
  "stellar_signMessage",
  "stellar_signAuthEntry",
];

type StellarWindow = Window & { stellar?: { provider?: string; platform?: string } };

/** Freighter's in-app browser announces itself on `window.stellar`. */
export function isFreighterMobile(): boolean {
  if (typeof window === "undefined") return false;
  const stellar = (window as StellarWindow).stellar;
  return stellar?.provider === "freighter" && stellar?.platform === "mobile";
}

/** Accounts come back as `stellar:testnet:G...`. */
function accountOf(session: Session): string | null {
  return session?.namespaces.stellar?.accounts[0]?.split(":")[2] || null;
}

export function freighterMobileSession(config: FreighterMobileConfig): FreighterMobileSession {
  let opened: Promise<{ provider: Provider; modal: AppKit }> | null = null;

  /** One provider per page: a second would open a second relay socket. */
  function open() {
    opened ??= (async () => {
      const provider = await UniversalProvider.init({
        projectId: config.projectId,
        metadata: config.metadata,
      });
      const modal = createAppKit({
        projectId: config.projectId,
        // AppKit refuses to start without a network and has none for Stellar.
        // This one only satisfies that check; the session below names the
        // Stellar chain, and nothing is ever signed on mainnet.
        networks: [mainnet],
        universalProvider: provider as unknown as Parameters<
          typeof createAppKit
        >[0]["universalProvider"],
        manualWCControl: true,
        enableReconnect: true,
        featuredWalletIds: [FREIGHTER_WALLETCONNECT_ID],
      });
      provider.on("display_uri", (uri: string) => modal.open({ uri }));
      provider.on("session_delete", () => {
        opened = null;
      });
      return { provider, modal };
    })();
    return opened;
  }

  return {
    async connect() {
      const { provider, modal } = await open();
      try {
        const session = await provider.connect({
          namespaces: {
            stellar: {
              methods: STELLAR_METHODS,
              chains: [config.chain],
              events: ["accountsChanged"],
            },
          },
        });
        if (!session) throw new Error("Connection cancelled.");
        const address = accountOf(session);
        if (!address) throw new Error("Your wallet did not share an account. Please try again.");
        return address;
      } finally {
        modal.close();
      }
    },

    async address() {
      const { provider } = await open();
      return accountOf(provider.session);
    },

    async request<T>(method: string, params: Record<string, string>) {
      const { provider } = await open();
      if (!provider.session) {
        throw new Error("Your wallet is no longer connected. Please connect it again.");
      }
      return provider.request<T>({ method, params }, config.chain);
    },

    async disconnect() {
      const { provider } = await open();
      if (provider.session) await provider.disconnect();
      opened = null;
    },
  };
}
