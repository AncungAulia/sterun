"use client";

import { useEffect, type ReactNode } from "react";

import { useWallet } from "@/hooks/useWallet";

/**
 * Starts Stellar Wallets Kit once, on the client.
 *
 * The kit renders its modal with Preact and reads `document` and
 * `localStorage`, so it cannot be initialised during server rendering. Doing it
 * in an effect also means the restored address arrives after hydration, which
 * is why WalletButton has an explicit restoring state rather than assuming
 * "no address" means "not connected".
 */
export function Providers({ children }: { children: ReactNode }) {
  const bootstrap = useWallet((state) => state.bootstrap);

  useEffect(() => bootstrap(), [bootstrap]);

  return <>{children}</>;
}
