/**
 * One place that turns whatever was thrown into a sentence a person can act on.
 *
 * ## Why this exists
 *
 * Three different kinds of error end up in front of an organiser: a revert from
 * a contract, a refusal from the wallet, and anything the network did. None of
 * them were written for a reader. `@sterunxyz/sdk` produces messages like
 * `createEvent reverted with QuotaFull (#5, event-registry)`, which is exactly
 * right for a log and useless to somebody who just wants to publish a race, and
 * the package is published and owned elsewhere, so the mapping belongs here.
 *
 * It is a pure function on purpose. Every screen that catches an error calls
 * it, so there is one list of sentences to read rather than string matching
 * scattered through components, and the list can be tested without rendering
 * anything.
 *
 * ## What passes through untouched
 *
 * Messages this app wrote itself. They are already aimed at the reader, and
 * genericising them would throw away the specific thing that went wrong ("your
 * race details were uploaded but could not be checked"). Those are marked by
 * their type: `PlainError` (`lib/plain-error.ts`) for anything we throw
 * deliberately, and `ApiError`, whose messages `lib/api.ts` already writes for
 * the screen rather than passing the server's own text on.
 *
 * Everything else is foreign text, and a sentence nobody wrote for a reader is
 * worse than no sentence at all, so it becomes {@link SOMETHING_WENT_WRONG}.
 *
 * The original error is not swallowed: the two call sites that map one
 * (`hooks/useEventRun.ts`, `components/elements/FileField.tsx`) log it to the
 * console in development, so a stuck organiser still has something to send us.
 */
import { SterunContractError, type ContractErrorSource } from "@sterunxyz/sdk";

import { ApiError } from "./api";
import { PlainError } from "./plain-error";

/** When there is nothing true and specific to say. */
export const SOMETHING_WENT_WRONG = "Something went wrong. Please try again.";

/**
 * The SDK calls whose reverts can only have come from one of our two contracts.
 *
 * This list is the reason a revert is mapped at all. An error code is a bare
 * `u32` with no contract identity, so the band (`1..=99` EventRegistry,
 * `100..=199` RaceRecord) is the only thing that names the source, and the band
 * is only trustworthy while nothing else in the call can revert. `enter` is
 * deliberately absent: it hands control to the sUSD token contract mid call,
 * and that contract numbers its own errors in the same `1..=99` range, so a
 * refusal to move money would be read here as an EventRegistry variant and
 * printed as a confident wrong sentence ("This distance is full.").
 *
 * Add a method here only after checking that it invokes nothing but
 * EventRegistry and RaceRecord.
 */
const OUR_OWN_METHODS: ReadonlySet<string> = new Set([
  "createEvent",
  "addCategory",
  "addAddon",
  "setEventStatus",
  "addScanner",
  "removeScanner",
  "addOrganiser",
  "removeOrganiser",
]);

/**
 * The reverts that have their own way out, per `guides/ARCHITECTURE.md` §6.4.
 *
 * Keyed by band and variant together, because the two contracts each own a
 * `NotInitialized` and matching on the name alone would conflate them. A
 * variant that is not here falls through to the generic sentence deliberately:
 * "InvalidDistance" tells an organiser nothing they can do, and guessing at a
 * cause we do not know is worse than admitting there is nothing to say.
 *
 * The entry-time refusals (`QuotaFull`, `EventNotOpen`, `AddOnQuotaFull`) used
 * to be here and were taken out: they can only arrive from `enter`, which is
 * exactly the call this file refuses to classify, so a sentence for them could
 * never fire honestly. STE-21 brings them back together with a way of telling a
 * token revert from ours.
 */
const CONTRACT_MESSAGES: Partial<Record<`${ContractErrorSource}:${string}`, string>> = {
  "event-registry:NotAllowlistedOrganiser":
    "This wallet cannot publish races yet. Send its address to the Sterun team to be added.",
};

/** Said as a cancellation, because that is what it is. Nobody has to fix it. */
const DECLINED = "You declined this in your wallet. Nothing was sent.";

/**
 * The one thing worse than a failure is a failure that might not be one.
 *
 * The way out of a failed run is a button that repeats the step, and the first
 * step publishes a race that can never be deleted. So a step that stopped
 * without an answer must not read like a step that stopped with one.
 */
const MAYBE_ALREADY_DONE =
  "This may already have gone through. Please check your races before trying again, " +
  "so you do not create the same one twice.";

const NOT_ENOUGH_FUNDS = "Your wallet does not have enough funds for this.";

/**
 * A wallet refusal, in the several shapes wallets phrase it.
 *
 * Matched on text because that is all a wallet gives us: the kit hands back a
 * code of its own per wallet, Freighter says one thing and WalletConnect
 * another, and none of it is a standard. Confined to this file so the matching
 * is in one place and can be read as a list.
 */
const DECLINED_TEXT = /declin|reject|cancel|denied|user closed|user dismissed/i;

const NOT_ENOUGH_FUNDS_TEXT = /insufficient|underfunded|not enough (?:funds|balance)/i;

/**
 * The shapes in which "we stopped without knowing the answer" arrives.
 *
 * First: the SDK's own case, a transaction that went out with no hash coming
 * back. Then the two the Stellar SDK raises once something has been submitted,
 * which reach us through the SDK's send phase with its own prefix in front.
 */
const MAYBE_ALREADY_DONE_TEXT =
  /returned no transaction hash|for transaction to complete, but it did not|sent to the network, but not yet awaited/i;

/**
 * Anything saying something already left the browser.
 *
 * {@link DECLINED} promises "Nothing was sent", and that promise rests on a
 * word match over wording no wallet has agreed on. A cancellation reported
 * after submission would turn the reassurance into a lie, which is the one
 * failure mode worth guarding: the reader would stop looking for a race that
 * exists.
 */
const REACHED_THE_NETWORK_TEXT = /submitted|sent to the network|sent transaction|still pending/i;

export function friendlyError(error: unknown): string {
  // Ours, and already written for the reader.
  if (error instanceof PlainError || error instanceof ApiError) {
    return error.message || SOMETHING_WENT_WRONG;
  }

  // Only a revert the SDK decoded, and only from a call that reaches nothing
  // but our contracts. A bare `Error(Contract, #5)` from anywhere else cannot
  // be attributed, so it gets the neutral sentence rather than a wrong one.
  if (error instanceof SterunContractError && OUR_OWN_METHODS.has(error.method)) {
    return CONTRACT_MESSAGES[`${error.source}:${error.variant}`] ?? SOMETHING_WENT_WRONG;
  }

  const text = messageOf(error);
  if (MAYBE_ALREADY_DONE_TEXT.test(text)) return MAYBE_ALREADY_DONE;
  if (DECLINED_TEXT.test(text)) {
    return REACHED_THE_NETWORK_TEXT.test(text) ? MAYBE_ALREADY_DONE : DECLINED;
  }
  if (NOT_ENOUGH_FUNDS_TEXT.test(text)) return NOT_ENOUGH_FUNDS;

  return SOMETHING_WENT_WRONG;
}

/**
 * Whatever the thrown thing has to say, in the shapes it arrives in.
 *
 * The nested one is not hypothetical: Stellar Wallets Kit rejects with the
 * wallet's own object, `{ error: { code, message } }`, which is why its own
 * `parseError` reads `e?.error?.message || e?.message`. Reading only the outer
 * message gave an empty string there, so a declined prompt came out as the
 * generic failure sentence. The order below mirrors the kit's.
 *
 * The `code` sitting beside that message is read out of both levels as well,
 * and then deliberately not decided on: every wallet numbers its own refusals
 * and the kit passes the number through untouched, so `-4` means a rejection in
 * one wallet and something else in the next. It is appended to the text instead
 * of being matched, which keeps it out of the sentence a reader sees while
 * still putting it in front of the one rule that could ever want it.
 */
function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const outer = error as { message?: unknown; code?: unknown; error?: unknown };
    const nested = (outer.error ?? {}) as { message?: unknown; code?: unknown };
    const message = typeof nested.message === "string" ? nested.message : outer.message;
    if (typeof message !== "string" || !message) return "";
    const code = nested.code ?? outer.code;
    return typeof code === "number" ? `${message} (code ${code})` : message;
  }
  return "";
}
