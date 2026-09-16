/**
 * S10: sending this phone's claims to the chain, one at a time, in the order
 * the race packs were handed over.
 *
 * ## One at a time, one signature each
 *
 * Not a choice. A Soroban transaction holds exactly one contract call
 * ("only a single InvokeHostFunctionOp allowed per transaction",
 * developers.stellar.org, checked 2026-09-16), the contract has no batch
 * claim, and an account can only have one transaction in flight. So each row
 * is built, signed and sent when its turn comes, which is also why the queue
 * holds intent rather than signed transactions (design §6).
 *
 * ## Which stops are final
 *
 * `claim_racepack` reaches nothing but our two contracts, so its reverts can be
 * read with certainty (lib/api/errors.ts explains why that matters):
 *
 *   - `AlreadyClaimed(102)`: another desk got there first. Final, so the row
 *     moves to Refused and the run carries on to the next one.
 *   - `RecordNotFound`: the token does not exist on chain. Final too.
 *   - `NotAuthorized`: this wallet is not a scanner for the race. Every other
 *     row would fail the same way, so the run stops and the rows keep waiting
 *     for a wallet that is.
 *   - A declined prompt, no answer, or anything else: the run stops and the
 *     row keeps waiting. Trying again can still succeed.
 *
 * No answer is deliberately NOT read as success. If the transaction did land,
 * the next attempt is refused as already claimed and the row shows in Refused:
 * a false alarm an organiser can check. Reading it the other way would hide a
 * real double handover at another desk.
 */
import { SterunContractError } from "@sterunxyz/sdk";

import { friendlyError, isDeclined, isNoAnswer } from "@/lib/api/errors";

import type { QueuedClaim, markClaim } from "./scanner-store";

export type SendStop =
  | { kind: "declined" }
  | { kind: "not-scanner" }
  | { kind: "no-answer" }
  | { kind: "failed"; message: string };

export interface SendDeps {
  /** Build, sign and send one claim. */
  send: (tokenId: number) => Promise<{ txHash: string; ledger: number | null }>;
  /** When the chain says this record's race pack was collected, for a refused row. */
  claimedAtOf: (tokenId: number) => Promise<bigint | null>;
  mark: typeof markClaim;
  /** The row now being sent, or null when the run is over. */
  onSending?: (tokenId: number | null) => void;
}

function revertOf(error: unknown): SterunContractError | null {
  return error instanceof SterunContractError && error.method === "claimRacepack" ? error : null;
}

/** Sends every waiting claim, in order. Resolves with why it stopped early, or null. */
export async function sendClaims(claims: QueuedClaim[], deps: SendDeps): Promise<SendStop | null> {
  const waiting = claims
    .filter((claim) => claim.status === "waiting")
    .sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));

  try {
    for (const claim of waiting) {
      deps.onSending?.(claim.tokenId);
      try {
        const sent = await deps.send(claim.tokenId);
        await deps.mark(claim.tokenId, {
          status: "sent",
          txHash: sent.txHash,
          ledger: sent.ledger ?? undefined,
        });
      } catch (error) {
        const revert = revertOf(error);

        if (revert?.is("AlreadyClaimed", "race-record")) {
          const claimedAt = await deps.claimedAtOf(claim.tokenId).catch(() => null);
          await deps.mark(claim.tokenId, {
            status: "refused",
            reason: "already-claimed",
            claimedAt: claimedAt === null ? undefined : claimedAt.toString(),
          });
          continue;
        }
        if (revert?.is("RecordNotFound", "race-record")) {
          await deps.mark(claim.tokenId, { status: "refused", reason: "not-found" });
          continue;
        }
        if (revert?.is("NotAuthorized", "race-record")) return { kind: "not-scanner" };
        if (isNoAnswer(error)) return { kind: "no-answer" };
        if (isDeclined(error)) return { kind: "declined" };
        return { kind: "failed", message: friendlyError(error) };
      }
    }
    return null;
  } finally {
    deps.onSending?.(null);
  }
}
