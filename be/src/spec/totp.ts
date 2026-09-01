/**
 * Check-in codes — `docs/specs/HASH_AND_TOTP.md` §4 and §5.
 *
 * HMAC-SHA-256 over an 8-byte big-endian counter of 30-second steps, RFC 4226
 * §5.3 dynamic truncation, 6 digits, ±1 step tolerance, constant-time compare.
 *
 * The code is a **string** everywhere in this file, and that is the single most
 * important line in it. `079663` parsed as a number is 79663; a JSON number
 * would drop the leading zero on the wire, and every scan of that pass would
 * fail with a five-character code that looks almost right. Vector
 * `tp-02-leading-zero` exists to catch exactly this.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SECRET_BYTES = 32;
export const TIME_STEP_SECONDS = 30n;
export const DIGITS = 6;
export const TOLERANCE_STEPS = 1;

/** 32 raw CSPRNG bytes, one per record. Never on-chain, never inside the QR. */
export const generateTotpSecret = (): Buffer => randomBytes(SECRET_BYTES);

export function secretFromHex(hex: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new RangeError("totp secret must be 64 lowercase hex characters (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

/** floor(unix_seconds / 30) as an unsigned 64-bit value. */
export function timeStep(unixSeconds: number | bigint): bigint {
  const t = BigInt(unixSeconds);
  if (t < 0n) throw new RangeError("unix_seconds must be non-negative");
  return t / TIME_STEP_SECONDS;
}

export function counterBytes(step: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(step);
  return buf;
}

export function codeAtStep(secret: Buffer, step: bigint): string {
  if (secret.length !== SECRET_BYTES) {
    throw new RangeError(`totp secret must be exactly ${SECRET_BYTES} bytes`);
  }
  const mac = createHmac("sha256", secret).update(counterBytes(step)).digest();
  const offset = (mac[mac.length - 1] as number) & 0x0f;
  const bin =
    (((mac[offset] as number) & 0x7f) << 24) |
    ((mac[offset + 1] as number) << 16) |
    ((mac[offset + 2] as number) << 8) |
    (mac[offset + 3] as number);
  // `>>> 0` keeps it unsigned. The 0x7f mask already caps it below 2^31 so it
  // cannot actually go negative, but `<<` yields a signed int32 in JS and the
  // spec must not depend on that detail.
  return String((bin >>> 0) % 1_000_000).padStart(DIGITS, "0");
}

export const codeAt = (secret: Buffer, unixSeconds: number | bigint): string =>
  codeAtStep(secret, timeStep(unixSeconds));

/**
 * Constant-time comparison of two 6-character codes.
 *
 * Length is checked first because timingSafeEqual throws on a length mismatch,
 * and a thrown exception is itself a timing signal. A wrong-length code is
 * simply invalid.
 */
export function codesEqual(a: string, b: string): boolean {
  if (a.length !== DIGITS || b.length !== DIGITS) return false;
  return timingSafeEqual(Buffer.from(a, "ascii"), Buffer.from(b, "ascii"));
}

/**
 * Accept a code presented at `verifyAtUnixSeconds`, tolerating ±1 step.
 *
 * The window is up to 90 seconds wide, which is what makes the manual fallback
 * usable: a volunteer typing six digits read aloud from a runner's screen is
 * working from the runner's clock, not the scanner's.
 *
 * Every step in the window is checked even after a match, so the work done does
 * not depend on which step matched.
 */
export function verifyCode(
  secret: Buffer,
  presentedCode: string,
  verifyAtUnixSeconds: number | bigint,
): boolean {
  const centre = timeStep(verifyAtUnixSeconds);
  let matched = false;
  for (let delta = -TOLERANCE_STEPS; delta <= TOLERANCE_STEPS; delta += 1) {
    const step = centre + BigInt(delta);
    if (step < 0n) continue;
    if (codesEqual(codeAtStep(secret, step), presentedCode)) matched = true;
  }
  return matched;
}

export interface QrPayload {
  /** `token_id` of the record, from `RaceRecord.enter`. */
  t: number;
  /** `time_step` the code was generated for. */
  s: number;
  /** The 6-character code. A string, always. */
  c: string;
}

/**
 * Exactly three keys in this order, no whitespace anywhere.
 *
 * Built by hand rather than with JSON.stringify on an object literal so the key
 * order is a property of this function rather than of V8's insertion order.
 * `s` is a plain JSON number: time_step is ~5.9e7 today and grows ~1.05e6 a
 * year, so Number.MAX_SAFE_INTEGER is hundreds of millions of years away.
 */
export function qrPayload(tokenId: number, step: bigint, code: string): string {
  if (!Number.isInteger(tokenId) || tokenId < 0) throw new RangeError("token_id must be a u32");
  if (code.length !== DIGITS) throw new RangeError("code must be exactly 6 characters");
  return `{"t":${tokenId},"s":${step},"c":"${code}"}`;
}
