/**
 * STE-11 — the PII encryption keyring.
 *
 * A single key in an env var is the version of this that gets written first and
 * then cannot be rotated without downtime and a full re-encrypt, because
 * nothing on the row records which key produced it. So keys are numbered from
 * the start and every ciphertext carries its key id. Rotation is then: add a
 * new key, point PII_ACTIVE_KEY_ID at it, and old rows keep decrypting under
 * the old key until a background re-encrypt catches up. Retiring a key is
 * removing it from PII_KEYS once nothing references it.
 *
 *   PII_KEYS="1:<64 hex>,2:<64 hex>"      every key that may still be needed
 *   PII_ACTIVE_KEY_ID="2"                 the one that encrypts new rows
 *
 * The operational contract — who holds these, how they rotate, what a leak
 * costs — is written down in be/OPERATIONS.md, and that document is part of
 * this ticket, not a nice-to-have.
 */
export const KEY_BYTES = 32; // AES-256

export interface Keyring {
  readonly activeKeyId: number;
  key(keyId: number): Buffer;
  readonly keyIds: readonly number[];
}

export function parseKeyring(keysSpec: string, activeKeyId: string): Keyring {
  const keys = new Map<number, Buffer>();

  for (const entry of keysSpec.split(",").map((e) => e.trim()).filter(Boolean)) {
    const match = /^(\d+):([0-9a-f]{64})$/.exec(entry);
    if (!match) {
      // Never echo the entry: it is a key, or close enough to one that logging
      // it would be the leak this module exists to prevent.
      throw new Error(
        "PII_KEYS entries must look like `<id>:<64 lowercase hex>` separated by commas",
      );
    }
    const id = Number(match[1]);
    if (id <= 0 || !Number.isSafeInteger(id)) throw new Error("PII_KEYS ids must be positive");
    if (keys.has(id)) throw new Error(`PII_KEYS has two entries for key id ${id}`);
    keys.set(id, Buffer.from(match[2] as string, "hex"));
  }

  if (keys.size === 0) {
    throw new Error(
      "PII_KEYS is empty. The vault refuses to start without a key rather than storing PII in the clear. " +
        "Generate one with: node -e \"console.log('1:'+require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  const active = Number(activeKeyId);
  if (!Number.isInteger(active) || !keys.has(active)) {
    throw new Error(`PII_ACTIVE_KEY_ID=${JSON.stringify(activeKeyId)} is not one of the ids in PII_KEYS`);
  }

  return {
    activeKeyId: active,
    keyIds: [...keys.keys()].sort((a, b) => a - b),
    key(keyId: number): Buffer {
      const k = keys.get(keyId);
      if (!k) {
        throw new Error(
          `no key with id ${keyId} in PII_KEYS — a row was encrypted with a key that has since been removed. ` +
            "Restore that key to decrypt, or accept the row is unreadable.",
        );
      }
      return k;
    },
  };
}
