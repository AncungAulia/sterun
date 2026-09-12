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
 */
import { SterunContractError, classifyContractError, parseContractErrorCode } from "@sterunxyz/sdk";

import { ApiError } from "./api";
import { PlainError } from "./plain-error";

/** When there is nothing true and specific to say. */
export const SOMETHING_WENT_WRONG = "Something went wrong. Please try again.";

/**
 * The reverts that have their own way out, per `guides/ARCHITECTURE.md` §6.4.
 *
 * Keyed by band and variant together, because the two contracts each own a
 * `NotInitialized` and matching on the name alone would conflate them. A
 * variant that is not here falls through to the generic sentence deliberately:
 * "InvalidDistance" tells an organiser nothing they can do, and guessing at a
 * cause we do not know is worse than admitting there is nothing to say.
 */
const CONTRACT_MESSAGES: Record<string, string> = {
  "event-registry:NotAllowlistedOrganiser":
    "This wallet cannot publish races yet. Send its address to the Sterun team to be added.",
  "event-registry:QuotaFull": "This distance is full. There are no places left.",
  "event-registry:AddOnQuotaFull": "That item has sold out.",
  "event-registry:EventNotOpen": "This race is not open for entries.",
};

/** Said as a cancellation, because that is what it is. Nobody has to fix it. */
const DECLINED = "You declined this in your wallet. Nothing was sent.";

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

export function friendlyError(error: unknown): string {
  // Ours, and already written for the reader.
  if (error instanceof PlainError || error instanceof ApiError) {
    return error.message || SOMETHING_WENT_WRONG;
  }

  const code = contractErrorCode(error);
  if (code !== null) {
    const { source, variant } = classifyContractError(code);
    return CONTRACT_MESSAGES[`${source}:${variant}`] ?? SOMETHING_WENT_WRONG;
  }

  const text = messageOf(error);
  if (DECLINED_TEXT.test(text)) return DECLINED;
  if (NOT_ENOUGH_FUNDS_TEXT.test(text)) return NOT_ENOUGH_FUNDS;

  return SOMETHING_WENT_WRONG;
}

/**
 * The revert code, when this was one.
 *
 * The SDK's own error carries it decoded. A revert can also arrive as an
 * ordinary error still holding the host string, which is why the text is read
 * too: `Error(Contract, #5)` is narrow enough that prose merely containing a
 * number does not become a fake revert.
 */
function contractErrorCode(error: unknown): number | null {
  if (error instanceof SterunContractError) return error.code;
  return parseContractErrorCode(messageOf(error));
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const { message } = error as { message?: unknown };
    if (typeof message === "string") return message;
  }
  return "";
}
