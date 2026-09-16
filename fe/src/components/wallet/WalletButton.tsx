"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useSusdBalance } from "@/hooks/useSusdBalance";
import { useWallet } from "@/hooks/useWallet";
import { IS_TESTNET } from "@/lib/chain/env";
import { GetTestSusd } from "@/components/wallet/GetTestSusd";
import { formatAmount, shortAddress } from "@/utils/format";

/**
 * Connect / connected / disconnect, in one control.
 *
 * While restoring we render a placeholder of the same height rather than
 * "Connect wallet": showing a connect prompt to somebody who is already
 * connected, for the one frame before localStorage is read, reads as a dropped
 * session.
 */
export function WalletButton() {
  const { address, isRestoring, isConnecting, error, connect, disconnect } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Testnet only (STE-21): the label says sUSD, which mainnet does not use.
  const balance = useSusdBalance(IS_TESTNET ? address : null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  if (isRestoring) {
    return <div className="h-10 w-36 animate-pulse rounded-md bg-n-100" aria-hidden />;
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
    <div ref={menuRef} className="relative">
      <Button
        variant="secondary"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <span className="numeric">{shortAddress(address)}</span>
      </Button>

      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-2 w-72 rounded-lg border border-n-200 bg-paper p-3 shadow-card"
        >
          <p className="text-xs text-n-500">Connected account</p>
          <p className="numeric mt-1 break-all text-sm text-n-800">{address}</p>
          {/*
            The public race record for this address (STE-24). A link rather
            than a page of its own: /runner/G... is the URL a runner sends to
            other people, so their own copy is that same page.
          */}
          <Button asChild variant="outline" size="sm" className="mt-3 w-full">
            <Link href={`/runner/${address}`} onClick={() => setMenuOpen(false)}>
              My race record
            </Link>
          </Button>
          {IS_TESTNET ? (
            <div className="mt-3 border-t border-n-200 pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-n-500">sUSD balance</span>
                <span className="numeric text-base font-medium text-ink">
                  {balance.data?.kind === "balance" ? formatAmount(balance.data.stroops) : balance.data ? "0" : ""}
                </span>
              </div>
              <GetTestSusd address={address} size="sm" className="mt-2 [&>button]:w-full" />
              <p className="mt-2 text-xs text-n-500">Test money for trying Sterun. It has no value.</p>
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              setMenuOpen(false);
              void disconnect();
            }}
          >
            Disconnect
          </Button>
        </div>
      ) : null}
    </div>
  );
}
