"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/useWallet";
import { shortAddress } from "@/utils/format";

/**
 * Connect, or the way to your own page. Two states, no menu.
 *
 * While restoring we render a placeholder of the same height rather than
 * "Connect wallet": showing a connect prompt to somebody who is already
 * connected, for the one frame before localStorage is read, reads as a dropped
 * session.
 *
 * **The popover is gone** (Ancung, 2026-09-23). It held five unrelated things
 * (the address, the public record, the sUSD balance, the faucet, Disconnect),
 * none of which could be linked to, all of which vanished at the next click,
 * and it still did not hold the one thing a runner comes back for, their pass.
 * All of it lives at `/profile` now, which is also where Disconnect went.
 * Eventbrite's bar does the same: it links to `/mytickets/` and
 * `/account-settings/` rather than unfolding them.
 *
 * **Not connected still connects rather than navigating.** A button that opened
 * a page telling somebody to connect, when one press could have connected them,
 * is a step charged for nothing.
 */
export function WalletButton() {
  const { address, isRestoring, isConnecting, error, connect } = useWallet();

  if (isRestoring) {
    return <div className="h-10 w-36 skeleton rounded-md" aria-hidden />;
  }

  if (!address) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button onClick={() => void connect()} disabled={isConnecting}>
          {isConnecting ? "Waiting for wallet..." : "Connect wallet"}
        </Button>
        {error ? (
          <p role="alert" className="max-w-xs text-right text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Button variant="secondary" asChild>
      {/* Named by the address rather than "Profile": on a page where a wallet
          signs things, which wallet is connected is the fact worth printing. */}
      <Link href="/profile" aria-label={`Your profile, ${shortAddress(address)}`}>
        <span className="numeric">{shortAddress(address)}</span>
      </Link>
    </Button>
  );
}
