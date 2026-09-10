/**
 * STE-8 — the only place that talks to Stellar Wallets Kit.
 *
 * Kit v2 exposes a *static* class rather than an instance, and it keeps its own
 * state in localStorage (`@StellarWalletsKit/activeAddress`,
 * `selectedModuleId`). That is what makes a page refresh reconnect without us
 * storing anything ourselves: `init()` restores the previous selection, and
 * `getAddress()` reads it back from kit memory.
 *
 * The kit renders its modal with Preact and touches `document`, so every
 * function here is browser-only. Call them from a client component.
 *
 * WalletConnect comes in two shapes, both switched on by
 * NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID. Everywhere except Freighter's mobile
 * browser it is one more entry in the kit's picker, which pairs a phone wallet
 * by QR code or deep link. Inside Freighter's mobile browser the kit is bypassed
 * and `lib/freighter-mobile.ts` pairs directly.
 */
import {
  KitEventType,
  Networks,
  StellarWalletsKit,
  parseError,
} from "@creit.tech/stellar-wallets-kit";
// Not re-exported from the package root: only the `modules/utils` subpath has it.
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import {
  WalletConnectModule,
  WalletConnectTargetChain,
} from "@creit.tech/stellar-wallets-kit/modules/wallet-connect";

import { NETWORK, WALLET_CONNECT_PROJECT_ID } from "./env";
import {
  freighterMobileSession,
  isFreighterMobile,
  type FreighterMobileSession,
  type WalletConnectMetadata,
} from "./freighter-mobile";

/**
 * The kit takes an enum member, not a free string, so the configured passphrase
 * has to be matched against one it knows. An unknown passphrase is a
 * misconfiguration worth failing loudly on rather than silently signing for a
 * network nobody chose.
 */
function kitNetwork(passphrase: string): Networks {
  const match = Object.values(Networks).find((n) => n === passphrase);
  if (!match) {
    throw new Error(
      `NEXT_PUBLIC_NETWORK_PASSPHRASE is not a network Stellar Wallets Kit knows: "${passphrase}".`,
    );
  }
  return match;
}

/**
 * WalletConnect names only pubnet and testnet. On any other network it is left
 * out entirely: pairing on the nearest named chain would sign for the wrong
 * ledger without a word.
 */
function walletConnectChain(): WalletConnectTargetChain | null {
  if (!WALLET_CONNECT_PROJECT_ID) return null;
  switch (NETWORK.networkPassphrase) {
    case Networks.PUBLIC:
      return WalletConnectTargetChain.PUBLIC;
    case Networks.TESTNET:
      return WalletConnectTargetChain.TESTNET;
    default:
      return null;
  }
}

/** What the wallet shows the user about who is asking to connect. */
function walletConnectMetadata(): WalletConnectMetadata {
  const origin = window.location.origin;
  return {
    name: "Sterun",
    description: "Race records on Stellar",
    url: origin,
    icons: [`${origin}/icon.png`],
  };
}

/**
 * The kit's module with one answer changed. Inside Freighter's mobile browser
 * the stock module calls itself a "platform wrapper", and the picker then skips
 * itself and pairs through the kit. That browser is paired by
 * `lib/freighter-mobile.ts` instead, so this module must not claim it.
 */
class PickerWalletConnectModule extends WalletConnectModule {
  async isPlatformWrapper(): Promise<boolean> {
    return false;
  }
}

function walletModules() {
  const modules = defaultModules();
  const chain = walletConnectChain();
  if (!chain) return modules;
  return [
    ...modules,
    new PickerWalletConnectModule({
      projectId: WALLET_CONNECT_PROJECT_ID,
      allowedChains: [chain],
      metadata: walletConnectMetadata(),
    }),
  ];
}

let mobile: FreighterMobileSession | null = null;

/** The direct WalletConnect session inside Freighter's mobile browser, or null anywhere else. */
function freighterMobile(): FreighterMobileSession | null {
  const chain = walletConnectChain();
  if (!chain || !isFreighterMobile()) return null;
  mobile ??= freighterMobileSession({
    projectId: WALLET_CONNECT_PROJECT_ID,
    chain,
    metadata: walletConnectMetadata(),
  });
  return mobile;
}

let started = false;

/** Idempotent: React strict mode mounts effects twice in development. */
export function initWallet(): void {
  if (started) return;
  StellarWalletsKit.init({
    modules: walletModules(),
    network: kitNetwork(NETWORK.networkPassphrase),
    authModal: { showInstallLabel: true },
  });
  started = true;
}

/** Opens the kit's wallet picker. Resolves with the address once approved. */
export async function connectWallet(): Promise<string> {
  const direct = freighterMobile();
  if (direct) return direct.connect();
  const { address } = await StellarWalletsKit.authModal();
  return address;
}

/**
 * The address the kit already holds, without prompting.
 *
 * Returns null rather than throwing when nothing is connected: on first load
 * that is the normal case, not a failure.
 */
export async function restoreAddress(): Promise<string | null> {
  try {
    const direct = freighterMobile();
    if (direct) return await direct.address();
    const { address } = await StellarWalletsKit.getAddress();
    return address || null;
  } catch {
    return null;
  }
}

export async function disconnectWallet(): Promise<void> {
  const direct = freighterMobile();
  if (direct) return direct.disconnect();
  await StellarWalletsKit.disconnect();
}

/**
 * Fires when the wallet changes the active account or network from its own UI,
 * which happens without any click on our side. Returns an unsubscribe function.
 */
export function onWalletStateChange(callback: (address: string | null) => void): () => void {
  return StellarWalletsKit.on(KitEventType.STATE_UPDATED, (event) => {
    callback(event.payload.address ?? null);
  });
}

/**
 * Signs an XDR with the connected wallet.
 *
 * Shaped to match what `@sterun/sdk` expects for `signTransaction`, so later
 * tickets can hand this straight to `SterunClient` without an adapter.
 */
export async function signTransaction(
  xdr: string,
  opts?: { address?: string; networkPassphrase?: string },
): Promise<{ signedTxXdr: string; signerAddress?: string }> {
  const direct = freighterMobile();
  if (direct) {
    const { signedXDR } = await direct.request<{ signedXDR: string }>("stellar_signXDR", { xdr });
    return { signedTxXdr: signedXDR };
  }
  return StellarWalletsKit.signTransaction(xdr, {
    networkPassphrase: opts?.networkPassphrase ?? NETWORK.networkPassphrase,
    address: opts?.address,
  });
}

/**
 * Signs an arbitrary string with the connected wallet.
 *
 * Used for `POST /auth/challenge` -> sign the nonce -> send
 * `x-sterun-address` / `x-sterun-nonce` / `x-sterun-signature`, which is how
 * every authenticated backend route identifies a caller (be/src/auth.ts). The
 * runner already holds a Stellar keypair, so there is no second credential to
 * invent — but the browser never sees that key, hence the wallet round-trip.
 *
 * The kit hands back base64 already, which is what the backend parses, so the
 * value is passed through untouched. Re-encoding it here is the mistake the
 * backend's "expected 64 bytes, got 47" error exists to catch.
 *
 * `signMessage` is optional in the kit — Albedo and some hardware modules do
 * not implement it — so a wallet that returns nothing is named as the problem
 * rather than surfacing as a TypeError from inside our own code.
 */
export async function signMessage(
  message: string,
  opts?: { address?: string; networkPassphrase?: string },
): Promise<string> {
  const direct = freighterMobile();
  const signedMessage = direct
    ? (await direct.request<{ signature?: string }>("stellar_signMessage", { message })).signature
    : (
        await StellarWalletsKit.signMessage(message, {
          networkPassphrase: opts?.networkPassphrase ?? NETWORK.networkPassphrase,
          address: opts?.address,
        })
      ).signedMessage;
  if (!signedMessage) {
    throw new Error(
      "This wallet cannot sign messages. Freighter and xBull can; try one of those.",
    );
  }
  return signedMessage;
}

/**
 * Kit errors carry a code and a message; anything else is passed through as a
 * plain string. Wallet rejections are the common case and must read as a
 * cancellation rather than a failure.
 */
export function walletErrorMessage(error: unknown): string {
  try {
    const parsed = parseError(error);
    return parsed.message || "Wallet request failed.";
  } catch {
    return error instanceof Error ? error.message : "Wallet request failed.";
  }
}
