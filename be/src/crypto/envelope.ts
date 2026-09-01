/**
 * STE-11 — AES-256-GCM envelope encryption for PII at rest.
 *
 * Application-level rather than pgcrypto or full KMS, which is the recommended
 * option in the ticket and the right trade for a 30-day MVP: the database never
 * sees a key, so a stolen dump or a read-only replica is ciphertext, and there
 * is no external service to be down at registration time.
 *
 * Layout of the stored blob, 31 bytes of overhead:
 *
 *   version  1 byte    so the format can change without guessing
 *   key_id   2 bytes   big-endian; which key from the keyring
 *   iv      12 bytes   random per encryption, the size GCM is designed for
 *   tag     16 bytes   GCM authentication tag
 *   ciphertext …
 *
 * Every value is bound to its row and column with AAD — `pii.name:<row uuid>`.
 * Without it, a DBA (or anyone with write access to the dump) could move one
 * person's encrypted name into another person's row and the decrypt would
 * succeed, silently swapping two identities. With it, that ciphertext fails to
 * authenticate. This is the difference between "encrypted at rest" and
 * "encrypted at rest and still meaning what it meant".
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Keyring } from "./keyring.js";

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1 + 2 + IV_BYTES;

/** `<column>:<row id>` — what a ciphertext is allowed to mean. */
export const aad = (column: string, rowId: string): Buffer =>
  Buffer.from(`${column}:${rowId}`, "utf8");

export function encrypt(keyring: Keyring, plaintext: string, associatedData: Buffer): Buffer {
  const keyId = keyring.activeKeyId;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyring.key(keyId), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(associatedData);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt8(VERSION, 0);
  header.writeUInt16BE(keyId, 1);
  iv.copy(header, 3);

  return Buffer.concat([header, cipher.getAuthTag(), body]);
}

export function decrypt(keyring: Keyring, blob: Buffer, associatedData: Buffer): string {
  if (blob.length < HEADER_BYTES + TAG_BYTES) {
    throw new Error("ciphertext is too short to be a valid envelope");
  }
  const version = blob.readUInt8(0);
  if (version !== VERSION) {
    throw new Error(`unknown envelope version ${version}; this build understands ${VERSION}`);
  }
  const keyId = blob.readUInt16BE(1);
  const iv = blob.subarray(3, HEADER_BYTES);
  const tag = blob.subarray(HEADER_BYTES, HEADER_BYTES + TAG_BYTES);
  const body = blob.subarray(HEADER_BYTES + TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", keyring.key(keyId), iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(associatedData);
  decipher.setAuthTag(tag);
  // Throws on a wrong key, a tampered ciphertext, or AAD that does not match —
  // all of which are the same answer to the caller: this is not readable.
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

/** Which key encrypted this blob, without decrypting it — used by rotation. */
export const keyIdOf = (blob: Buffer): number => blob.readUInt16BE(1);
