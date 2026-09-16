/**
 * `participant_hash`, computed in the browser (docs/specs/HASH_AND_TOTP.md §2 and §3, FROZEN).
 *
 *   SHA-256( utf8(norm_name) 00 utf8(norm_id) 00 utf8(norm_contact) 00 salt )
 *
 * This is the one place a runner's name, national id and emergency contact are
 * handled by this app after entry, and they never leave this function: what
 * reaches `verify` is 32 bytes that say nothing about the person. Nothing here
 * posts anything, stores anything or logs anything.
 *
 * ## Why this is written again rather than imported
 *
 * The backend has its own implementation (`be/src/spec/`), which runs on Node's
 * `crypto` and cannot be bundled for a browser. This one uses Web Crypto. What
 * binds the two is not shared code but the vector file both are tested against,
 * `docs/specs/vectors/participant_hash.json`: every hash and every refusal in it
 * is a test here. If this file and those vectors disagree, this file is wrong.
 *
 * ## The traps, each one a vector
 *
 * - **Whitespace is an explicit list of 25 code points**, not `\s` or `trim()`:
 *   JavaScript counts U+FEFF and not U+0085, Unicode the other way round.
 * - **NFC first**, so a name typed on a keyboard that emits decomposed accents
 *   hashes the same as the precomposed one.
 * - **Names keep their case.** `budi santoso` is not `Budi Santoso`.
 * - **ASCII-only uppercase for the id**, never `toUpperCase()`, which turns `ß`
 *   into `SS` and depends on locale.
 * - **The salt is hashed as 32 raw bytes**, never as its 64 hex characters.
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

/** Exposed so a test can hold the list at the 25 the spec fixes. */
export const SPEC_WHITESPACE_COUNT = WHITE_SPACE.size;

export type HashField = "name" | "national_id" | "emergency_contact" | "salt";

/** Something the spec says must never be hashed, and which field it was in. */
export class NormalizationError extends Error {
  constructor(
    readonly field: HashField,
    readonly code: "E_EMPTY" | "E_NUL",
  ) {
    super(`${field}/${code}`);
    this.name = "NormalizationError";
  }
}

const isWhitespace = (codePoint: number) => WHITE_SPACE.has(codePoint);

/** N1 NFC, N2 trim, N3 collapse internal runs to one U+0020, N4 refuse empty or U+0000. */
function normBase(input: string, field: Exclude<HashField, "salt">): string {
  // Code points, not UTF-16 units: an astral character is a surrogate pair,
  // and splitting one would corrupt the UTF-8 that gets hashed.
  const codePoints = Array.from(input.normalize("NFC"), (ch) => ch.codePointAt(0)!);

  let start = 0;
  let end = codePoints.length;
  while (start < end && isWhitespace(codePoints[start]!)) start += 1;
  while (end > start && isWhitespace(codePoints[end - 1]!)) end -= 1;

  let out = "";
  let pendingSpace = false;
  let sawNul = false;
  for (let i = start; i < end; i += 1) {
    const cp = codePoints[i]!;
    if (isWhitespace(cp)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      out += " ";
      pendingSpace = false;
    }
    if (cp === 0) sawNul = true;
    out += String.fromCodePoint(cp);
  }

  // Emptiness before the NUL rule: that is the spec's precedence (§2.4).
  if (out.length === 0) throw new NormalizationError(field, "E_EMPTY");
  if (sawNul) throw new NormalizationError(field, "E_NUL");
  return out;
}

export const normName = (input: string): string => normBase(input, "name");

/** N5: strip whitespace and `-`, then ASCII-uppercase only. N5b: refuse what is left empty. */
export function normId(input: string): string {
  let out = "";
  for (const ch of normBase(input, "national_id")) {
    const cp = ch.codePointAt(0)!;
    if (isWhitespace(cp) || cp === 0x2d) continue;
    out += cp >= 0x61 && cp <= 0x7a ? String.fromCharCode(cp - 32) : ch;
  }
  if (out.length === 0) throw new NormalizationError("national_id", "E_EMPTY");
  return out;
}

/** N6: strip whitespace, `-`, `(` and `)`, keeping a leading `+`. N6b: refuse what is left empty. */
export function normContact(input: string): string {
  let out = "";
  for (const ch of normBase(input, "emergency_contact")) {
    const cp = ch.codePointAt(0)!;
    if (isWhitespace(cp) || cp === 0x2d || cp === 0x28 || cp === 0x29) continue;
    out += ch;
  }
  if (out.length === 0) throw new NormalizationError("emergency_contact", "E_EMPTY");
  return out;
}

/**
 * The receipt code as 32 raw bytes.
 *
 * Forgiving about how it was pasted, strict about what it is: spaces and line
 * breaks around or inside it are dropped and upper case is read as lower case,
 * since none of that changes the 32 bytes the hex describes. Anything that is
 * not then exactly 64 hex characters is refused rather than guessed at.
 */
export function saltBytes(receiptCode: string): Uint8Array<ArrayBuffer> {
  const hex = receiptCode.replace(/\s+/g, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new NormalizationError("salt", "E_EMPTY");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export interface ParticipantDetails {
  name: string;
  nationalId: string;
  emergencyContact: string;
  receiptCode: string;
}

/** The exact bytes that are hashed. Separate so a test can compare them with the spec's preimage. */
export function participantPreimage(details: ParticipantDetails): Uint8Array<ArrayBuffer> {
  // Normalised in the spec's order, so an input wrong in two fields reports
  // the first of them (§2.4).
  const name = normName(details.name);
  const id = normId(details.nationalId);
  const contact = normContact(details.emergencyContact);
  const salt = saltBytes(details.receiptCode);

  const encoder = new TextEncoder();
  const parts = [encoder.encode(name), encoder.encode(id), encoder.encode(contact)];
  const length = parts.reduce((total, part) => total + part.length + 1, 0) + salt.length;

  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
    out[offset] = 0x00; // exactly three separators, none after the salt
    offset += 1;
  }
  out.set(salt, offset);
  return out;
}

/** 64 lowercase hex characters, the value `verify(token_id, hash)` compares. */
export async function participantHash(details: ParticipantDetails): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", participantPreimage(details)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
