"use client";

/**
 * Get test sUSD: one button, in the wallet menu and at the pay step (STE-21,
 * mockup blocks 3 and 7).
 *
 * 1. A wallet that cannot hold sUSD yet signs one trustline (funded from
 *    friendbot first if it was never funded at all).
 * 2. The backend faucet sends a fixed amount (STE-49).
 * 3. The balance is read again, so the pay step unlocks on its own.
 *
 * Testnet only: it renders nothing anywhere else, because on mainnet the asset
 * is USDC and there is nothing to hand out.
 */
import { useQueryClient } from "@tanstack/react-query";
import { CoinsIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { susdKey } from "@/hooks/useSusdBalance";
import { IS_TESTNET } from "@/lib/env";
import { friendlyError } from "@/lib/errors";
import { addSusdTrustline, readSusdBalance, requestTestSusd, type FaucetResult } from "@/lib/susd";
import { cn } from "@/utils/cn";

const SENTENCES: Record<FaucetResult["kind"], string> = {
  sent: "Test sUSD added.",
  "rate-limited": "You already got test sUSD today. Try again tomorrow.",
  empty: "Test sUSD has run out. Tell the Sterun team.",
  unavailable: "Test sUSD is not available yet.",
};

export function GetTestSusd({
  address,
  onFunded,
  size = "default",
  className,
}: {
  address: string;
  /** Called only when sUSD was actually sent. */
  onFunded?: () => void;
  size?: "default" | "sm";
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  if (!IS_TESTNET) return null;

  async function getTestSusd() {
    setBusy(true);
    setSaid(null);
    try {
      /*
       * Imported on press, not at the top. This button sits in the site
       * header's wallet menu, and `lib/wallet` brings the whole Stellar Wallets
       * Kit with it: a static import put the kit in every page's header graph
       * and broke every test that renders the header (fe/CLAUDE.md, useWallet).
       */
      const { signMessage, signTransaction } = await import("@/lib/wallet");
      const balance = await readSusdBalance(address);
      if (balance.kind !== "balance") await addSusdTrustline(address, signTransaction);

      const result = await requestTestSusd(address, signMessage);
      setSaid(SENTENCES[result.kind]);

      if (result.kind === "sent") {
        await queryClient.invalidateQueries({ queryKey: susdKey(address) });
        onFunded?.();
      }
    } catch (error) {
      setSaid(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Button type="button" variant="secondary" size={size} disabled={busy} onClick={() => void getTestSusd()}>
        {busy ? (
          <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <CoinsIcon aria-hidden="true" className="size-4" />
        )}
        Get test sUSD
      </Button>
      {said ? (
        <p role="status" className="text-sm text-n-600">
          {said}
        </p>
      ) : null}
    </div>
  );
}
