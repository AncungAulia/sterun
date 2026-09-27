/**
 * The check-in code (docs/specs/HASH_AND_TOTP.md §4).
 *
 * Byte-exact by specification: the backend puts the same secret in the
 * scanner's roster, and both sides must produce the same six characters with no
 * network between them. Every rule here is the frozen document's, not ours, and
 * `__tests__/totp.test.ts` checks it against that document's vectors rather
 * than against this file's own output.
 *
 * ## Why this is not inside a feature
 *
 * It has two users that must never disagree: the pass generates a code with it
 * (STE-21) and the scanner checks one with it (STE-22). Two copies would be two
 * implementations of a frozen document, and the day one drifted would be a race
 * morning at a desk with no signal to debug from. ARCHITECTURE.md §4.2 asks for
 * the move on the second user, which is the commit this comment arrived in.
 *
 * The code is a STRING, always six characters, left-padded with zero. Holding it
 * as a number drops that zero for about one runner in ten, and that failure
 * only shows up on race day (§4.4).
 */
const STEP_SECONDS = 30;

/** Which 30-second step a moment falls in. */
export function timeStepOf(unixSeconds: number): number {
  return Math.floor(unixSeconds / STEP_SECONDS);
}

/** How long this step has left, 30 down to 1, so a countdown never reads zero. */
export function secondsLeft(unixSeconds: number): number {
  return STEP_SECONDS - (Math.floor(unixSeconds) % STEP_SECONDS);
}

/**
 * The secret's raw bytes. The hex text is what the API carries; what the HMAC
 * takes is the 32 bytes behind it, and hashing the text instead is the classic
 * bug the spec names (§3.3).
 */
function bytesOf(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("a secret is 64 lowercase hex characters");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/**
 * The step as 8 big-endian bytes (T2).
 *
 * The return type names its buffer: a bare `Uint8Array` widens to
 * `ArrayBufferLike`, which could be shared memory, and Web Crypto will not take
 * that. The array really is backed by an ArrayBuffer, so saying so is truer
 * than casting at the call.
 */
function counterOf(step: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(step));
  return bytes;
}

export async function codeAt(secretHex: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    bytesOf(secretHex),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, counterOf(step)),
  );

  // RFC 4226 §5.3 dynamic truncation, over a 32-byte MAC (T4, T5). The first
  // byte is masked with 0x7f so the result cannot depend on how a language
  // treats a sign bit.
  const offset = mac[31]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) |
    (mac[offset + 1]! << 16) |
    (mac[offset + 2]! << 8) |
    mac[offset + 3]!;

  return String(bin % 1_000_000).padStart(6, "0");
}

/**
 * Written as text rather than through JSON.stringify: the specification pins
 * three keys in one order with no spaces (§5), and a template says that
 * plainly. `c` is quoted because it is a string; a number would lose a
 * leading zero on the way to the scanner.
 */
export function qrPayload(tokenId: number, step: number, code: string): string {
  return `{"t":${tokenId},"s":${step},"c":"${code}"}`;
}
