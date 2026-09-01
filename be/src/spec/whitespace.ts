/**
 * Unicode `White_Space=Yes` — all 25 code points, written out.
 *
 * `docs/specs/HASH_AND_TOTP.md` §2.1 refuses to say "Unicode whitespace" and
 * leave it there, for a reason worth restating where the code lives:
 * ECMAScript's WhiteSpace production counts U+FEFF and does not count U+0085;
 * Rust's `char::is_whitespace()` (Unicode White_Space) is the exact opposite on
 * both. An implementation that leaned on its language's built-in would produce
 * a different `participant_hash` from the one the contract already stores, for
 * the same person — and the mismatch would only show up at check-in, on race
 * day, at a scanner.
 *
 * So the set is hardcoded here exactly as the spec hardcodes it in both
 * reference implementations. Never replace this with `\s`, `String.trim()`, or
 * a Unicode property escape.
 */
const WHITE_SPACE = new Set<number>([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, // TAB LF VT FF CR
  0x0020, // SPACE
  0x0085, // NEL
  0x00a0, // NO-BREAK SPACE
  0x1680, // OGHAM SPACE MARK
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
  0x2006, 0x2007, 0x2008, 0x2009, 0x200a, // EN QUAD .. HAIR SPACE
  0x2028, // LINE SEPARATOR
  0x2029, // PARAGRAPH SEPARATOR
  0x202f, // NARROW NO-BREAK SPACE
  0x205f, // MEDIUM MATHEMATICAL SPACE
  0x3000, // IDEOGRAPHIC SPACE
]);

export const isSpecWhitespace = (codePoint: number): boolean => WHITE_SPACE.has(codePoint);

/** Exposed so a test can assert the count the spec fixes at 25. */
export const SPEC_WHITESPACE_COUNT = WHITE_SPACE.size;
