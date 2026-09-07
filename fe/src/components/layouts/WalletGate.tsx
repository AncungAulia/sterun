"use client";

/**
 * Everything under `/org` needs a signature eventually, so it needs a wallet
 * first. This is the one place that says so.
 *
 * The restoring state is not decoration: Stellar Wallets Kit reads its previous
 * selection from localStorage in an effect, so for the first moment after
 * hydration a connected organiser looks exactly like a disconnected one. Asking
 * them to connect a wallet they already connected is how a console loses trust
 * on the first screen.
 */
import type { ReactNode } from "react";

import { Button } from "@/components/elements/Button";
import { useWallet } from "@/hooks/useWallet";

export function WalletGate({ children }: { children: ReactNode }) {
  const { address, isRestoring, isConnecting, connect, error } = useWallet();

  if (isRestoring) {
    return (
      <div role="status" className="mx-auto w-full max-w-4xl px-4 py-16">
        <div className="h-6 w-48 animate-pulse rounded-sm bg-n-100" />
      </div>
    );
  }

  if (!address) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-16">
        <h1 className="heading-hero text-4xl text-ink">Organiser console</h1>
        <p className="mt-3 max-w-xl text-lg text-n-600">
          Connect the wallet that will own your events. That address authorizes every action here,
          and it is the only address that can change an event once it exists.
        </p>
        <Button className="mt-6" onClick={() => void connect()} disabled={isConnecting}>
          {isConnecting ? "Connecting" : "Connect wallet"}
        </Button>
        {error ? (
          <p role="alert" className="mt-3 text-base text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return <>{children}</>;
}
