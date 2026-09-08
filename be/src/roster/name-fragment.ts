/**
 * STE-16 — the only part of a runner's name that leaves the vault.
 *
 * The roster bundle a scanner downloads before the race is specified as
 * `token_id -> totp_secret, bib, name-fragment` (docs/SYSTEM_DESIGN.md §7
 * point 3). The fragment exists for one job: a volunteer holding a race pack
 * needs to see that the person in front of them plausibly matches the bib on
 * the screen. A bib number alone gives them nothing to check against, and the
 * full name is more than that job needs.
 *
 * So the reduction is: **the given name in full, every later name as an
 * initial.**
 *
 *   "Budi Santoso"          -> "Budi S."
 *   "Ana Maria de la Cruz"  -> "Ana M. d. l. C."
 *   "Sukarno"               -> "Sukarno"
 *
 * This is computed once, at submit time, from the already-normalised name, and
 * the result is what gets stored — the full name is never recoverable from it
 * because the characters are gone, not hidden. The stored fragment is still
 * encrypted with the same envelope and per-row AAD as the other PII columns
 * (be/CLAUDE.md rule 2 and migration 003), so a leaked dump is no more readable
 * than it was before this column existed.
 *
 * What this is NOT: an identity check. `verify(token_id, participant_hash)` is
 * the identity check, and it needs the runner's own salt and plaintext. A
 * fragment matching is a sanity check a human does in two seconds; it proves
 * nothing on its own, and the on-chain `state == Entered` guard is what
 * actually stops a second race pack going out.
 */
import { normName } from "../spec/normalize.js";

/**
 * Long enough for a full Indonesian given name plus several initials, short
 * enough that a bug that skipped the reduction could not smuggle a long legal
 * name through. The roster response schema repeats this bound, so the wire
 * format enforces it too.
 */
export const MAX_FRAGMENT_LENGTH = 64;

/**
 * Reduce a name to its roster fragment.
 *
 * Takes the raw form and normalises it here rather than trusting a caller to
 * have done it. The normalisation (NFC, collapsed whitespace) is what makes a
 * double space, a tab, or a U+00A0 pasted out of a spreadsheet all produce the
 * same fragment, and it throws
 * {@link import("../spec/normalize.js").NormalizationError} on a name the spec
 * refuses — the same refusal the hash would give, at the same moment.
 */
export function nameFragment(rawName: string): string {
  const parts = normName(rawName).split(" ");
  const [given, ...rest] = parts;
  // normName guarantees a non-empty result with no leading, trailing or
  // repeated spaces, so `given` is always a non-empty token.
  const fragment = [given as string, ...rest.map(initialOf)].join(" ");
  return fragment.length <= MAX_FRAGMENT_LENGTH
    ? fragment
    : `${fragment.slice(0, MAX_FRAGMENT_LENGTH - 1)}…`;
}

/**
 * First character plus a full stop.
 *
 * Iterated as code points: an astral first character (an emoji, some scripts'
 * letters) is a surrogate pair in UTF-16, and `token[0]` would cut it in half
 * and produce a lone surrogate that JSON cannot round-trip.
 */
function initialOf(token: string): string {
  const first = Array.from(token)[0];
  return first === undefined ? "" : `${first}.`;
}
