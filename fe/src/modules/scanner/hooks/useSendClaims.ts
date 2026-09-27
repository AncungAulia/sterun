"use client";

/**
 * Runs `sendClaims` for one race with the connected wallet, and tells the
 * screen which row is being sent and why a run stopped.
 *
 * The wallet kit is imported when sending starts, the same as the roster
 * download: this is an offline route, and a static import would pull all of
 * Stellar Wallets Kit into it.
 *
 * Every row that changes invalidates the claims query at once, so the list on
 * screen moves as each claim lands rather than all together at the end.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useWallet } from "@/hooks/useWallet";
import { readClient } from "@/lib/chain/sterun";

import { scannerQueryKeys } from "../lib/query-keys";
import { listClaims, markClaim } from "../lib/scanner-store";
import { sendClaims, type SendStop } from "../lib/send-claims";

export function useSendClaims(eventId: number) {
  const address = useWallet((state) => state.address);
  const queryClient = useQueryClient();
  const [sendingToken, setSendingToken] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [stop, setStop] = useState<SendStop | null>(null);
  /** How many were waiting when this run started, for the progress bar. */
  const [runSize, setRunSize] = useState(0);

  const start = useCallback(async () => {
    if (!address || running) return;
    setRunning(true);
    setStop(null);

    try {
      const claims = await listClaims(eventId);
      setRunSize(claims.filter((claim) => claim.status === "waiting").length);
      const { signTransaction } = await import("@/lib/wallet/kit");
      const refresh = () => queryClient.invalidateQueries({ queryKey: scannerQueryKeys.claims(eventId) });

      const stopped = await sendClaims(claims, {
        send: (tokenId) => readClient.claimRacepack(tokenId, address, { publicKey: address, signTransaction }),
        recordOf: async (tokenId) => {
          const record = await readClient.recordOf(tokenId);
          return { state: record.state, claimedAt: record.claimedAt };
        },
        mark: async (tokenId, outcome) => {
          await markClaim(tokenId, outcome);
          await refresh();
        },
        onSending: setSendingToken,
      });
      setStop(stopped);
      await refresh();
    } finally {
      setRunning(false);
    }
  }, [address, eventId, queryClient, running]);

  return { address, start, running, sendingToken, stop, runSize };
}
