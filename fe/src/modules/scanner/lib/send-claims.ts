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
 *   - A declined prompt or no answer: the run stops and the row keeps
 *     waiting. Trying again can still succeed.
 *   - **Anything else is told from the ledger, not from the error** (STE-62).
 *     The record is read again: if it is no longer `Entered`, another desk got
 *     there first, so the row moves to Refused and the run carries on. Only a
 *     record the chain still holds as `Entered` stops the run, since only then
 *     can trying again succeed.
 *
 * That last rule exists because the error cannot always be trusted to say what
 * happened. In the STE-25 rehearsal two desks claimed one runner in the same
 * ledger; the losing claim failed on the ledger with `AlreadyClaimed(102)`, but
 * the SDK threw an unrelated message instead of that code (STE-61). This file
 * read it as an unknown failure, stopped on the first row, and left the double
 * handover off the Refused screen and four real check-ins unsent until the
 * volunteer pressed Send again. The same reasoning as `enter-failure.ts`: when
 * the error is unclear, the chain's state is the answer.
 *
 * No answer is deliberately NOT read as success. If the transaction did land,
 * the next attempt is refused as already claimed and the row shows in Refused:
 * a false alarm an organiser can check. Reading it the other way would hide a
 * real double handover at another desk.
 */
import { SterunContractError } from "@sterunxyz/sdk";

import { friendlyError, isDeclined, isNoAnswer } from "@/lib/api/errors";

import type { QueuedClaim, RecordState, markClaim } from "./scanner-store";

export type SendStop =
  | { kind: "declined" }
  | { kind: "not-scanner" }
  | { kind: "no-answer" }
  | { kind: "failed"; message: string };

export interface SendDeps {
  /** Build, sign and send one claim. */
  send: (tokenId: number) => Promise<{ txHash: string; ledger: number | null }>;
  /** The record as the chain holds it now: its state, and when its race pack was collected. */
  recordOf: (tokenId: number) => Promise<{ state: RecordState; claimedAt: bigint | null }>;
  mark: typeof markClaim;
  /** The row now being sent, or null when the run is over. */
  onSending?: (tokenId: number | null) => void;
}

function revertOf(error: unknown): SterunContractError | null {
  return error instanceof SterunContractError && error.method === "claimRacepack" ? error : null;
}

async function markAlreadyClaimed(deps: SendDeps, tokenId: number, claimedAt: bigint | null): Promise<void> {
  await deps.mark(tokenId, {
    status: "refused",
    reason: "already-claimed",
    claimedAt: claimedAt === null ? undefined : claimedAt.toString(),
  });
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
          const record = await deps.recordOf(claim.tokenId).catch(() => null);
          await markAlreadyClaimed(deps, claim.tokenId, record?.claimedAt ?? null);
          continue;
        }
        if (revert?.is("RecordNotFound", "race-record")) {
          await deps.mark(claim.tokenId, { status: "refused", reason: "not-found" });
          continue;
        }
        if (revert?.is("NotAuthorized", "race-record")) return { kind: "not-scanner" };
        if (isNoAnswer(error)) return { kind: "no-answer" };
        if (isDeclined(error)) return { kind: "declined" };

        // An error that says nothing certain: ask the chain what happened.
        const record = await deps.recordOf(claim.tokenId).catch(() => null);
        if (record && record.state !== "Entered") {
          await markAlreadyClaimed(deps, claim.tokenId, record.claimedAt);
          continue;
        }
        return { kind: "failed", message: friendlyError(error) };
      }
    }
    return null;
  } finally {
    deps.onSending?.(null);
  }
}
