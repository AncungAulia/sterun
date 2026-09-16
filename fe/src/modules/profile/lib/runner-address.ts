/**
 * Is this text a runner's address? Checked in the browser before anything is
 * called (P10), so a typo costs no network request and gets its own screen.
 *
 * `StrKey` rather than a length and a leading `G`: the last characters of an
 * address are a checksum, so one mistyped character is caught here instead of
 * producing a real-looking address that has simply never entered a race (P9),
 * which would tell somebody their history is empty when it is not.
 *
 * Only account addresses. A `C…` contract id is a real Stellar address but it
 * cannot own a race record, and saying "no races yet" for it would be a wrong
 * kind of answer.
 */
import { StrKey } from "@stellar/stellar-sdk";

/** What a pasted address usually carries with it: spaces and line breaks around it. */
export function cleanAddress(text: string): string {
  return text.trim();
}

export function isRunnerAddress(text: string): boolean {
  return StrKey.isValidEd25519PublicKey(cleanAddress(text));
}
