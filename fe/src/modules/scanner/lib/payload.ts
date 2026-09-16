/**
 * What a camera just read, turned into three values or into nothing.
 *
 * The payload is frozen (docs/specs/HASH_AND_TOTP.md §5): three keys, one
 * order, no spaces, and `c` is a string. The runner's pass writes it with a
 * template for that reason, and this reads it back with the same suspicion a
 * desk should have about anything a camera picks up.
 *
 * Every refusal is `null` rather than a thrown error. A volunteer is holding a
 * phone at a queue, and the frame after a sticker, a parking QR or half a code
 * is the next frame. There is nothing to report and nothing to recover from:
 * the decoder simply keeps looking.
 */
export interface ScannedCode {
  tokenId: number;
  step: number;
  /** Six characters. A string, always, because `079663` is not 79663 (§4.4). */
  code: string;
}

/** Exactly six ASCII digits, which is what the spec calls a code. */
export const CODE_PATTERN = /^[0-9]{6}$/;

function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function parsePayload(text: string): ScannedCode | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const { t, s, c } = parsed as { t?: unknown; s?: unknown; c?: unknown };

  if (!isWholeNumber(t) || !isWholeNumber(s)) return null;
  // `c` must be a string in the payload itself. A number here is the classic
  // bug the spec names: it means the sending side dropped a leading zero, and
  // accepting it would hide that from whoever has to explain the failure.
  if (typeof c !== "string" || !CODE_PATTERN.test(c)) return null;

  return { tokenId: t, step: s, code: c };
}
