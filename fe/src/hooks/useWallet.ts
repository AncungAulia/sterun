/**
 * STE-8 — wallet connection state.
 *
 * Zustand rather than context because the header, the entry flow and the
 * organiser console all read the connected address, and none of them are
 * anywhere near each other in the tree.
 *
 * The store deliberately holds no persistence of its own. Stellar Wallets Kit
 * already writes the selected wallet and address to localStorage, so a second
 * copy here could only ever disagree with it.
 */
"use client";

import { create } from "zustand";

import {
  connectWallet,
  disconnectWallet,
  initWallet,
  onWalletStateChange,
  restoreAddress,
  walletErrorMessage,
} from "@/lib/wallet";

interface WalletState {
  address: string | null;
  /** True until the first restore attempt settles, so the UI can avoid flashing "Connect". */
  isRestoring: boolean;
  /** True while the wallet modal is open and awaiting the user. */
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Called once from the provider on mount. Safe to call twice. */
  bootstrap: () => () => void;
}

export const useWallet = create<WalletState>((set) => ({
  address: null,
  isRestoring: true,
  isConnecting: false,
  error: null,

  async connect() {
    set({ isConnecting: true, error: null });
    try {
      const address = await connectWallet();
      set({ address, isConnecting: false });
    } catch (error) {
      // Closing the modal rejects too. It is a cancellation, not a failure, so
      // the address is left exactly as it was.
      set({ isConnecting: false, error: walletErrorMessage(error) });
    }
  },

  async disconnect() {
    await disconnectWallet();
    set({ address: null, error: null });
  },

  bootstrap() {
    initWallet();

    void restoreAddress().then((address) => set({ address, isRestoring: false }));

    // The wallet extension can switch accounts on its own; the header has to
    // follow rather than keep showing an address the user has moved away from.
    return onWalletStateChange((address) => set({ address }));
  },
}));
