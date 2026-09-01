/**
 * `participant_hash` — `docs/specs/HASH_AND_TOTP.md` §3.
 *
 *   sha256( utf8(norm_name) 0x00 utf8(norm_id) 0x00 utf8(norm_contact) 0x00 salt )
 *
 * Exactly three separators, none after the salt. No length prefixes are needed
 * because N4 guarantees no normalised component can contain 0x00, which makes
 * the encoding injective on its own.
 *
 * This value is what lands on-chain and nothing else does. Changing anything
 * here invalidates every record already written — that is a MAJOR spec change
 * with a migration plan, not a refactor (docs/specs/CLAUDE.md).
 */
import { createHash, randomBytes } from "node:crypto";
import { NormalizationError, normContact, normId, normName } from "./normalize.js";

export const SALT_BYTES = 32;

export interface ParticipantInput {
  name: string;
  nationalId: string;
  emergencyContact: string;
}

/** 32 raw CSPRNG bytes, one per record — not per user, not per event. */
export const generateSalt = (): Buffer => randomBytes(SALT_BYTES);

/**
 * Hex is the transport encoding, never the hashed value.
 *
 * Hashing the 64-character hex *text* instead of the 32 raw bytes is the
 * classic bug in this spec, and it produces a completely wrong hash that still
 * looks like a hash. This parser is the only way salt hex enters the system.
 */
export function saltFromHex(hex: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new NormalizationError(
      "E_EMPTY",
      "salt",
      "salt must be 64 lowercase hex characters (32 bytes); uppercase and 0x prefixes are not the frozen encoding",
    );
  }
  return Buffer.from(hex, "hex");
}

export function participantPreimage(input: ParticipantInput, salt: Buffer): Buffer {
  if (salt.length !== SALT_BYTES) {
    throw new NormalizationError("E_EMPTY", "salt", `salt must be exactly ${SALT_BYTES} raw bytes`);
  }
  const nul = Buffer.of(0x00);
  return Buffer.concat([
    Buffer.from(normName(input.name), "utf8"),
    nul,
    Buffer.from(normId(input.nationalId), "utf8"),
    nul,
    Buffer.from(normContact(input.emergencyContact), "utf8"),
    nul,
    salt,
  ]);
}

/** 32 bytes as 64 lowercase hex characters, no `0x` — the on-chain value. */
export function participantHash(input: ParticipantInput, salt: Buffer): string {
  return createHash("sha256").update(participantPreimage(input, salt)).digest("hex");
}
