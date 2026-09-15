/**
 * STE-17 — telling an organiser that a race by this name already exists.
 *
 * A warning, never a block, and the distinction is the whole design. Two races
 * can share a name honestly: annual editions repeat theirs, and "Lari Jateng
 * 2026" could be two different races in two different cities. Refusing the
 * name would stop the organiser who is right along with the one who is
 * confused, and the contract would not enforce it anyway.
 *
 * What it does catch is the accident: the same organiser creating a second
 * event for a race they already published, which cannot be undone once it is
 * on chain.
 *
 * It does not catch somebody using a name that is not theirs. That needs to
 * know who an organiser is, which nothing here does.
 */

/**
 * A name reduced to what a person would call "the same name".
 *
 * Case, punctuation and runs of whitespace go, because none of them is a
 * difference anybody means. Nothing else does: guessing that "10K" and "10 K"
 * are the same thing starts a fight this function cannot win, and a warning
 * that fires on races that are genuinely different is a warning people learn
 * to click past.
 */
export function normaliseEventName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The existing name that matches, or null.
 *
 * Returns the name as it was written rather than a boolean, so the warning can
 * quote it back: "Lari Jateng 2026" is worth reading next to what was typed,
 * where "this name is taken" leaves somebody hunting.
 */
export function findNameClash(name: string, existing: readonly string[]): string | null {
  const wanted = normaliseEventName(name);
  if (wanted === "") return null;

  return existing.find((candidate) => normaliseEventName(candidate) === wanted) ?? null;
}
