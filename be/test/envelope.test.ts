/**
 * The vault's encryption. The positive case is one line; everything worth
 * testing here is a refusal, because "it decrypts" is not the property — "it
 * refuses to decrypt anything it should not" is.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { aad, decrypt, encrypt, keyIdOf } from "../src/crypto/envelope.js";
import { parseKeyring } from "../src/crypto/keyring.js";

const hex = () => randomBytes(32).toString("hex");
const K1 = hex();
const K2 = hex();
const ring = parseKeyring(`1:${K1}`, "1");
const twoKeys = parseKeyring(`1:${K1},2:${K2}`, "2");

const NAME = "Siti Aminah binti Rahman";

describe("envelope", () => {
  it("round-trips a value under the same key and AAD", () => {
    const row = randomUUID();
    const blob = encrypt(ring, NAME, aad("pii.name", row));
    expect(decrypt(ring, blob, aad("pii.name", row))).toBe(NAME);
  });

  it("stores no recognisable trace of the plaintext", () => {
    // The claim a third party checks by querying the table directly: the bytes
    // in the column contain nothing of the person.
    const row = randomUUID();
    const blob = encrypt(ring, NAME, aad("pii.name", row));
    expect(blob.toString("utf8")).not.toContain("Siti");
    expect(blob.toString("hex")).not.toContain(Buffer.from(NAME, "utf8").toString("hex"));
    expect(blob.includes(Buffer.from("Aminah", "utf8"))).toBe(false);
  });

  it("gives a different ciphertext every time, so equal names are not linkable", () => {
    // Deterministic encryption would let anyone with the dump see that two rows
    // hold the same name without decrypting either.
    const row = randomUUID();
    const a = encrypt(ring, NAME, aad("pii.name", row));
    const b = encrypt(ring, NAME, aad("pii.name", row));
    expect(a.equals(b)).toBe(false);
    expect(decrypt(ring, a, aad("pii.name", row))).toBe(decrypt(ring, b, aad("pii.name", row)));
  });

  it("refuses a ciphertext moved into another row", () => {
    // The attack AAD exists for: swap one person's encrypted name into another
    // person's row. Without AAD this decrypts cleanly and silently swaps two
    // identities.
    const alice = randomUUID();
    const bob = randomUUID();
    const blob = encrypt(ring, NAME, aad("pii.name", alice));
    expect(() => decrypt(ring, blob, aad("pii.name", bob))).toThrow();
  });

  it("refuses a ciphertext moved into another column of the same row", () => {
    const row = randomUUID();
    const blob = encrypt(ring, NAME, aad("pii.name", row));
    expect(() => decrypt(ring, blob, aad("pii.national_id", row))).toThrow();
  });

  it("refuses a tampered ciphertext rather than returning garbage", () => {
    const row = randomUUID();
    const blob = encrypt(ring, NAME, aad("pii.name", row));
    for (const index of [0, 3, 20, blob.length - 1]) {
      const tampered = Buffer.from(blob);
      tampered[index] ^= 0xff;
      expect(() => decrypt(ring, tampered, aad("pii.name", row))).toThrow();
    }
  });

  it("refuses a ciphertext from a different key", () => {
    const row = randomUUID();
    const blob = encrypt(ring, NAME, aad("pii.name", row));
    const otherRing = parseKeyring(`1:${K2}`, "1");
    expect(() => decrypt(otherRing, blob, aad("pii.name", row))).toThrow();
  });

  it.each([Buffer.alloc(0), Buffer.alloc(10), Buffer.alloc(29)])(
    "refuses a truncated blob (%o bytes)",
    (short) => {
      expect(() => decrypt(ring, short, aad("pii.name", randomUUID()))).toThrow(/too short/);
    },
  );

  it("refuses an unknown envelope version instead of misreading the layout", () => {
    const row = randomUUID();
    const blob = encrypt(ring, NAME, aad("pii.name", row));
    blob.writeUInt8(99, 0);
    expect(() => decrypt(ring, blob, aad("pii.name", row))).toThrow(/unknown envelope version 99/);
  });
});

describe("keyring rotation", () => {
  it("encrypts under the active key and can still read the old one", () => {
    const row = randomUUID();
    const old = encrypt(ring, NAME, aad("pii.name", row)); // key 1
    const fresh = encrypt(twoKeys, NAME, aad("pii.name", row)); // key 2

    expect(keyIdOf(old)).toBe(1);
    expect(keyIdOf(fresh)).toBe(2);
    // This is the whole point of numbering keys: rotation does not require a
    // synchronous re-encrypt of every row.
    expect(decrypt(twoKeys, old, aad("pii.name", row))).toBe(NAME);
    expect(decrypt(twoKeys, fresh, aad("pii.name", row))).toBe(NAME);
  });

  it("names the missing key when a retired one is still referenced", () => {
    const row = randomUUID();
    const old = encrypt(ring, NAME, aad("pii.name", row));
    const withoutKey1 = parseKeyring(`2:${K2}`, "2");
    expect(() => decrypt(withoutKey1, old, aad("pii.name", row))).toThrow(/no key with id 1/);
  });

  it("reports the key id without decrypting, so a re-encrypt job can find work", () => {
    expect(keyIdOf(encrypt(twoKeys, NAME, aad("pii.name", randomUUID())))).toBe(2);
  });
});

describe("keyring parsing", () => {
  it("accepts a multi-key spec and orders the ids", () => {
    const r = parseKeyring(` 2:${K2} , 1:${K1} `, "1");
    expect(r.keyIds).toEqual([1, 2]);
    expect(r.activeKeyId).toBe(1);
  });

  it("refuses to start with no key rather than storing PII in the clear", () => {
    expect(() => parseKeyring("", "1")).toThrow(/refuses to start without a key/);
  });

  it.each([
    ["1:tooshort", /64 lowercase hex/],
    [`1:${K1.toUpperCase()}`, /64 lowercase hex/],
    [`0:${K1}`, /ids must be positive/],
    [`1:${K1},1:${K2}`, /two entries for key id 1/],
  ])("rejects the spec %j", (spec, message) => {
    expect(() => parseKeyring(spec, "1")).toThrow(message);
  });

  it("never puts the offending entry in the error message", () => {
    // An error that echoes what it rejected would print a key into the logs.
    try {
      parseKeyring(`1:${K1}x`, "1");
      throw new Error("expected a throw");
    } catch (e) {
      expect((e as Error).message).not.toContain(K1);
    }
  });

  it("rejects an active id that is not in the ring", () => {
    expect(() => parseKeyring(`1:${K1}`, "7")).toThrow(/not one of the ids/);
    expect(() => parseKeyring(`1:${K1}`, "")).toThrow(/not one of the ids/);
  });
});
