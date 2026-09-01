/**
 * Normalisation for `participant_hash`, per `docs/specs/HASH_AND_TOTP.md` §2.
 *
 * This is the backend's own implementation, not an import of the reference in
 * docs/specs/reference/node/. That is deliberate: the reference exists to be a
 * second opinion, and a second opinion you copied is not one. What binds the
 * two together is the vector file they both run against — see
 * test/spec-vectors.test.ts, which reads the same JSON the Rust reference and
 * the contract's own tests read.
 *
 * If this file and the spec ever disagree, the spec and its vectors win and
 * this file is the bug. It is frozen at v1.0.0 and changing it invalidates
 * every participant_hash already on-chain.
 */
import { isSpecWhitespace } from "./whitespace.js";

export type PiiField = "name" | "national_id" | "emergency_contact";
export type NormalizationCode = "E_EMPTY" | "E_NUL";

/** Refusal to hash something the spec says must never be hashed. */
export class NormalizationError extends Error {
  constructor(
    readonly code: NormalizationCode,
    readonly field: PiiField | "salt",
    detail: string,
  ) {
    super(`${code}: ${field} — ${detail}`);
    this.name = "NormalizationError";
  }
}

const NUL = 0x0000;
const HYPHEN_MINUS = 0x2d;
const LEFT_PAREN = 0x28;
const RIGHT_PAREN = 0x29;

/**
 * N1 NFC · N2 trim · N3 collapse internal whitespace runs to a single U+0020 ·
 * N4 reject empty or containing U+0000.
 *
 * Iterating code points rather than UTF-16 units matters: an emoji or any
 * astral character is a surrogate pair, and splitting one would corrupt the
 * UTF-8 that gets hashed.
 */
export function normBase(input: string, field: PiiField): string {
  const codePoints = Array.from(input.normalize("NFC"), (ch) => ch.codePointAt(0) as number);

  let start = 0;
  let end = codePoints.length;
  while (start < end && isSpecWhitespace(codePoints[start] as number)) start += 1;
  while (end > start && isSpecWhitespace(codePoints[end - 1] as number)) end -= 1;

  let out = "";
  let pendingSpace = false;
  let sawNul = false;
  for (let i = start; i < end; i += 1) {
    const cp = codePoints[i] as number;
    if (isSpecWhitespace(cp)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      out += " ";
      pendingSpace = false;
    }
    if (cp === NUL) sawNul = true;
    out += String.fromCodePoint(cp);
  }

  if (out.length === 0) {
    throw new NormalizationError("E_EMPTY", field, "empty after normalization");
  }
  // Checked after the loop, not during: the spec's error precedence is N4's
  // emptiness first, then the NUL rule, and a NUL-only input is empty by both.
  if (sawNul) {
    throw new NormalizationError("E_NUL", field, "contains U+0000");
  }
  return out;
}

/** Names keep their case. A person's name is not a lookup key. */
export const normName = (input: string): string => normBase(input, "name");

/**
 * N5: strip whitespace and ASCII hyphen-minus, then ASCII-uppercase.
 *
 * ASCII-only on purpose — `toUpperCase()` is locale- and script-dependent
 * (Turkish dotless ı, German ß → SS), so it would make the hash depend on the
 * server's locale.
 */
export function normId(input: string): string {
  const base = normBase(input, "national_id");
  let out = "";
  for (const ch of base) {
    const cp = ch.codePointAt(0) as number;
    if (isSpecWhitespace(cp) || cp === HYPHEN_MINUS) continue;
    out += cp >= 0x61 && cp <= 0x7a ? String.fromCharCode(cp - 32) : ch;
  }
  if (out.length === 0) {
    // Reachable even though normBase passed: " -- - " survives N4 and only
    // becomes empty here. Hashing an empty identity component would accept an
    // identity field with nothing in it.
    throw new NormalizationError("E_EMPTY", "national_id", "empty after stripping separators");
  }
  return out;
}

/** N6: strip whitespace and `-`, `(`, `)`. A leading `+` is preserved. */
export function normContact(input: string): string {
  const base = normBase(input, "emergency_contact");
  let out = "";
  for (const ch of base) {
    const cp = ch.codePointAt(0) as number;
    if (isSpecWhitespace(cp) || cp === HYPHEN_MINUS || cp === LEFT_PAREN || cp === RIGHT_PAREN) {
      continue;
    }
    out += ch;
  }
  if (out.length === 0) {
    throw new NormalizationError(
      "E_EMPTY",
      "emergency_contact",
      "empty after stripping separators",
    );
  }
  return out;
}
