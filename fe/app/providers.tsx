"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { useWallet } from "@/hooks/useWallet";

/**
 * Starts Stellar Wallets Kit once, on the client, and supplies the QueryClient
 * every chain read runs through.
 *
 * The kit renders its modal with Preact and reads `document` and
 * `localStorage`, so it cannot be initialised during server rendering. Doing it
 * in an effect also means the restored address arrives after hydration, which
 * is why WalletButton has an explicit restoring state rather than assuming
 * "no address" means "not connected".
 *
 * The QueryClient is created in state rather than at module scope. A module
 * singleton is one client shared by every request the Node server handles,
 * which on the server means one visitor's cached reads can be served to
 * another; in state it is created once per browser session instead.
 */
export function Providers({ children }: { children: ReactNode }) {
  const bootstrap = useWallet((state) => state.bootstrap);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            /**
             * Refetching whenever the tab regains focus is the right default
             * for a mailbox and the wrong one here: this data changes when
             * somebody signs a transaction, and a public testnet node is a
             * shared resource. The directory refreshes on navigation, when its
             * 30 second staleness expires, and on the explicit refresh control.
             */
            refetchOnWindowFocus: false,
            /**
             * A contract revert is an answer, not an outage. Retrying
             * "EventNotFound" three times delays the page by seconds to
             * receive the same reply, so only network-level failures retry.
             */
            retry: (failureCount, error) =>
              failureCount < 2 && !(error instanceof Error && /Contract/.test(error.message)),
          },
        },
      }),
  );

  useEffect(() => bootstrap(), [bootstrap]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
