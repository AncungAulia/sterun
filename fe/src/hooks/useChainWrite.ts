"use client";

/**
 * STE-17 — the shape every organiser action shares: sign with the connected
 * wallet, wait for the ledger, hand back the transaction hash.
 *
 * ## Why the phase is tracked, and how
 *
 * ARCHITECTURE.md §4.5 requires a write to distinguish "waiting for you" from
 * "waiting for the network". They feel completely different to a person: one
 * is a prompt sitting in another window, the other is nothing to do but wait.
 * A page that says "confirm in your wallet" after the wallet is already done
 * looks broken, and one that says "submitting" while a prompt waits offscreen
 * gets abandoned.
 *
 * The SDK does both inside a single await, so the phase cannot be read from
 * the outside. It can be observed from the inside: the signer we hand down is
 * a wrapper, and the moment the SDK calls it we are waiting for the wallet;
 * the moment it returns we are waiting for the chain. No extra API on the SDK,
 * and no guessing from timers.
 *
 * ## The actor is per call, not per client
 *
 * `lib/sterun.ts` holds one read-only client and is guarded by a test that
 * fails if it ever learns about the wallet, because every public page reads
 * through it. Writing supplies `publicKey` and `signTransaction` per call
 * instead (ARCHITECTURE.md §5.2). `publicKey` is not decoration: it is the
 * account the transaction is simulated for, and the simulation records the
 * auth entries, so simulating as the wrong address produces an auth tree the
 * right signature cannot satisfy.
 */
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { useWallet } from "@/hooks/useWallet";
import { signTransaction } from "@/lib/wallet";

/** What a caller is waiting for right now. */
export type WritePhase = "idle" | "signing" | "confirming";

export interface SentTransaction<T> {
  value: T;
  txHash: string;
  ledger: number | null;
}

/** The two actor fields the SDK takes per call. */
export interface Actor {
  publicKey: string;
  signTransaction: typeof signTransaction;
}

export function useChainWrite<TArgs, TValue>(
  run: (args: TArgs, actor: Actor) => Promise<SentTransaction<TValue>>,
) {
  const address = useWallet((state) => state.address);
  const [phase, setPhase] = useState<WritePhase>("idle");

  const mutation = useMutation<SentTransaction<TValue>, Error, TArgs>({
    mutationFn: async (args: TArgs) => {
      if (!address) {
        // Refused here rather than passed on. The SDK would happily build and
        // simulate a call for `undefined`, and fail later with something that
        // reads like a network problem.
        throw new Error("Connect a wallet before signing this transaction.");
      }

      setPhase("signing");
      const tracked: typeof signTransaction = async (xdr, opts) => {
        try {
          return await signTransaction(xdr, opts);
        } finally {
          // The wallet has answered, one way or the other. What follows is the
          // network's turn.
          setPhase("confirming");
        }
      };

      try {
        return await run(args, { publicKey: address, signTransaction: tracked });
      } finally {
        setPhase("idle");
      }
    },
  });

  return {
    // mutateAsync is already stable across renders, so there is nothing for a
    // useCallback to memoise here.
    write: mutation.mutateAsync,
    phase,
    /** True from the click until the ledger has answered. */
    isBusy: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}
