"use client";

import { EXPLORER_BASE, NETWORK } from "@/lib/env";
import { useWallet } from "@/hooks/useWallet";

/**
 * The STE-8 acceptance scenario, made visible: connect, see the address, keep
 * it across a refresh, disconnect. Also states which network the app is
 * pointed at, because a wallet connected to the wrong one is the failure that
 * looks like everything working.
 */
export function ConnectionState() {
  const { address, isRestoring } = useWallet();

  return (
    <section className="rounded-lg border border-n-200 bg-n-50 p-6 shadow-card">
      <h2 className="heading text-xl text-n-700">Wallet</h2>

      {isRestoring ? (
        <p className="mt-3 text-base text-n-500">Checking for a connected wallet...</p>
      ) : address ? (
        <>
          <p className="mt-3 text-base text-n-600">Connected as</p>
          <p className="numeric mt-1 break-all text-base text-ink">{address}</p>
          {EXPLORER_BASE ? (
            <a
              href={`${EXPLORER_BASE}/account/${address}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm text-teal-500 underline underline-offset-4"
            >
              View on stellar.expert
            </a>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-base text-n-600">
          No wallet connected. Use the button in the header to connect Freighter, xBull, Albedo or
          any other supported wallet.
        </p>
      )}

      <dl className="mt-6 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-n-500">Network</dt>
        <dd className="numeric text-n-700">{NETWORK.networkPassphrase}</dd>
        <dt className="text-n-500">RPC</dt>
        <dd className="numeric break-all text-n-700">{NETWORK.rpcUrl}</dd>
      </dl>
    </section>
  );
}
