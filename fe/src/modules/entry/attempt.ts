/**
 * Sign and pay, as a reducer: two wallet approvals and every way they stop (STE-21).
 *
 * ## Details first, payment second
 *
 * Spec decision 4. The opposite order was rejected: a runner who closes the tab
 * after paying would have paid with no details in the vault and no way to check
 * in on race day.
 *
 * ## A retry never resends details
 *
 * What the vault returned (`Submitted`) is held for the whole attempt, so a
 * second try does not send an identity number twice, and the hash paid for is
 * always the hash in the vault. Only editing the details throws it away, and
 * the earlier vault row is left for the backend's clean-up (STE-50).
 *
 * ## No answer is a check, never a guess
 *
 * The runner is never told "this may have gone through". `enter` is atomic:
 * the place, the add-on units, the payment and the record land together or
 * not at all. So after a check, "not found" can honestly say nothing was
 * charged, and a check that itself failed gets its own state whose only way
 * out is checking again, never paying again.
 *
 * Pure. `hooks/useEntryAttempt.ts` runs the step `nextStep` names.
 */
import type { Submitted } from "@/lib/participants";

import type { EnterFailure } from "./enter-failure";

export type AttemptFailure = EnterFailure | { kind: "submit-failed"; message: string };

export type AttemptState =
  | { phase: "ready"; submitted: Submitted | null }
  | { phase: "confirming-identity" }
  | { phase: "paying"; submitted: Submitted }
  /**
   * `enter` landed. Linking the vault row to the record needs a third signed
   * message, asked for here in the dialog rather than on the success page,
   * where it surfaced as surprise popups (Ancung, 2026-09-15). Goes away when
   * the backend links rows from chain (STE-59).
   */
  | { phase: "linking"; submitted: Submitted; tokenId: number; txHash: string }
  | { phase: "checking"; submitted: Submitted }
  | { phase: "entered"; tokenId: number }
  | { phase: "failed"; submitted: Submitted | null; failure: AttemptFailure }
  | { phase: "check-failed"; submitted: Submitted }
  | { phase: "not-through"; submitted: Submitted };

export type AttemptEvent =
  | { type: "start" }
  | { type: "submitted"; submitted: Submitted }
  | { type: "submit-failed"; message: string; declined: boolean }
  | { type: "entered"; tokenId: number; txHash: string }
  | { type: "linked" }
  | { type: "link-failed" }
  | { type: "enter-failed"; failure: EnterFailure }
  | { type: "found"; tokenId: number }
  | { type: "not-found" }
  | { type: "check-error" }
  | { type: "details-changed" }
  | { type: "check-again" };

export const INITIAL_ATTEMPT: AttemptState = { phase: "ready", submitted: null };

/** Start, or start again: skip the identity step when the vault already answered. */
function begin(submitted: Submitted | null): AttemptState {
  return submitted ? { phase: "paying", submitted } : { phase: "confirming-identity" };
}

/**
 * Every phase lists the events it accepts, and anything else returns the same
 * state object. A late answer from a step that was already superseded is
 * therefore ignored rather than moving the dialog backwards.
 */
export function attemptReducer(state: AttemptState, event: AttemptEvent): AttemptState {
  switch (state.phase) {
    case "ready":
      if (event.type === "start") return begin(state.submitted);
      if (event.type === "details-changed") return { phase: "ready", submitted: null };
      return state;

    case "confirming-identity":
      if (event.type === "submitted") return { phase: "paying", submitted: event.submitted };
      if (event.type === "submit-failed") {
        return {
          phase: "failed",
          submitted: null,
          failure: event.declined
            ? { kind: "declined" }
            : { kind: "submit-failed", message: event.message },
        };
      }
      return state;

    case "paying":
      if (event.type === "entered") {
        return {
          phase: "linking",
          submitted: state.submitted,
          tokenId: event.tokenId,
          txHash: event.txHash,
        };
      }
      if (event.type === "enter-failed") {
        if (event.failure.kind === "no-answer") return { phase: "checking", submitted: state.submitted };
        return { phase: "failed", submitted: state.submitted, failure: event.failure };
      }
      return state;

    case "linking":
      // Either way the entry is real on chain. A link that fails leaves the
      // vault row unconfirmed, which STE-59 will repair from the chain.
      if (event.type === "linked" || event.type === "link-failed") {
        return { phase: "entered", tokenId: state.tokenId };
      }
      return state;

    case "checking":
      // Found without an answer, there is no transaction hash to link with.
      if (event.type === "found") return { phase: "entered", tokenId: event.tokenId };
      if (event.type === "not-found") return { phase: "not-through", submitted: state.submitted };
      if (event.type === "check-error") return { phase: "check-failed", submitted: state.submitted };
      return state;

    case "failed":
      if (event.type === "start") return begin(state.submitted);
      if (event.type === "details-changed") return { phase: "ready", submitted: null };
      return state;

    case "check-failed":
      // Deliberately no "start": paying again before knowing whether the first
      // payment landed is how a runner is charged twice.
      if (event.type === "check-again") return { phase: "checking", submitted: state.submitted };
      return state;

    case "not-through":
      if (event.type === "start") return { phase: "paying", submitted: state.submitted };
      if (event.type === "details-changed") return { phase: "ready", submitted: null };
      return state;

    case "entered":
      return state;
  }
}

/** The outside call this state is waiting on, or null when it waits on the runner. */
export function nextStep(state: AttemptState): "submit" | "enter" | "link" | "check" | null {
  switch (state.phase) {
    case "confirming-identity":
      return "submit";
    case "paying":
      return "enter";
    case "linking":
      return "link";
    case "checking":
      return "check";
    default:
      return null;
  }
}
