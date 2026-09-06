/**
 * Wallet-signature authentication.
 *
 * The vault holds identity documents, so this is the only thing standing
 * between a request and a person's national id. Every test here is a way that
 * could fail.
 */
import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { AuthError, ChallengeStore, NONCE_TTL_MS } from "../src/auth.js";

/**
 * Base64 of the 64 raw signature bytes.
 *
 * `Buffer.from(...)` is load-bearing: `Keypair.sign` returns a Uint8Array, and
 * Uint8Array.prototype.toString ignores its argument, so `sign(x).toString(
 * "base64")` yields "12,34,56,…" rather than base64. This is exactly the bug
 * that produced a run of confusing 401s while writing these tests, which is
 * why the server now names it.
 */
const sign = (kp: Keypair, nonce: string): string =>
  Buffer.from(kp.sign(Buffer.from(nonce, "utf8"))).toString("base64");

describe("ChallengeStore", () => {
  it("accepts a nonce signed by the account it was issued to", async () => {
    const store = new ChallengeStore();
    const kp = Keypair.random();
    const { nonce } = await store.issue(kp.publicKey());
    await expect(store.verify(kp.publicKey(), nonce, sign(kp, nonce))).resolves.toBe(kp.publicKey());
  });

  it("spends the nonce, so a captured signature cannot be replayed", async () => {
    const store = new ChallengeStore();
    const kp = Keypair.random();
    const { nonce } = await store.issue(kp.publicKey());
    const signature = sign(kp, nonce);
    await expect(store.verify(kp.publicKey(), nonce, signature)).resolves.toBe(kp.publicKey());
    await expect(store.verify(kp.publicKey(), nonce, signature)).rejects.toThrow(/already been used/);
  });

  it("spends the nonce even when the signature is wrong", async () => {
    // Otherwise an attacker holding a nonce could grind signatures against it.
    const store = new ChallengeStore();
    const kp = Keypair.random();
    const { nonce } = await store.issue(kp.publicKey());
    await expect(store.verify(kp.publicKey(), nonce, sign(Keypair.random(), nonce))).rejects.toThrow(
      /signature does not match/,
    );
    await expect(store.size()).resolves.toBe(0);
  });

  it("rejects a signature from a different key", async () => {
    const store = new ChallengeStore();
    const kp = Keypair.random();
    const { nonce } = await store.issue(kp.publicKey());
    await expect(store.verify(kp.publicKey(), nonce, sign(Keypair.random(), nonce))).rejects.toThrow(
      AuthError,
    );
  });

  it("rejects a nonce presented by a different address", async () => {
    const store = new ChallengeStore();
    const alice = Keypair.random();
    const bob = Keypair.random();
    const { nonce } = await store.issue(alice.publicKey());
    await expect(store.verify(bob.publicKey(), nonce, sign(bob, nonce))).rejects.toThrow(
      /issued to a different address/,
    );
  });

  it("expires an unused nonce", async () => {
    let now = 1_000_000;
    const store = new ChallengeStore(() => now);
    const kp = Keypair.random();
    const { nonce } = await store.issue(kp.publicKey());
    now += NONCE_TTL_MS + 1;
    await expect(store.verify(kp.publicKey(), nonce, sign(kp, nonce))).rejects.toThrow(/has expired/);
  });

  it("still accepts a nonce one millisecond before it expires", async () => {
    let now = 1_000_000;
    const store = new ChallengeStore(() => now);
    const kp = Keypair.random();
    const { nonce } = await store.issue(kp.publicKey());
    now += NONCE_TTL_MS - 1;
    await expect(store.verify(kp.publicKey(), nonce, sign(kp, nonce))).resolves.toBe(kp.publicKey());
  });

  it("sweeps expired nonces instead of growing without bound", async () => {
    let now = 1_000_000;
    const store = new ChallengeStore(() => now);
    for (let i = 0; i < 5; i += 1) await store.issue(Keypair.random().publicKey());
    await expect(store.size()).resolves.toBe(5);
    now += NONCE_TTL_MS + 1;
    await store.issue(Keypair.random().publicKey());
    await expect(store.size()).resolves.toBe(1);
  });

  it.each([
    [undefined, "nonce", "sig"],
    ["G".padEnd(56, "A"), undefined, "sig"],
    ["G".padEnd(56, "A"), "nonce", undefined],
  ])("rejects missing credentials (%s, %s, %s)", async (address, nonce, signature) => {
    const store = new ChallengeStore();
    await expect(store.verify(address, nonce, signature)).rejects.toThrow(/are all required/);
  });

  it("refuses to issue a challenge for something that is not a Stellar address", async () => {
    const store = new ChallengeStore();
    await expect(store.issue("not-an-address")).rejects.toThrow(/must be a Stellar public key/);
  });

  it("names the Uint8Array.toString trap instead of blaming the key", async () => {
    const store = new ChallengeStore();
    const kp = Keypair.random();
    const { nonce } = await store.issue(kp.publicKey());
    // What a client produces when it forgets to wrap the signature in a Buffer.
    const wrong = kp.sign(Buffer.from(nonce, "utf8")).toString();
    expect(wrong).toMatch(/^\d+,\d+/);
    await expect(store.verify(kp.publicKey(), nonce, wrong)).rejects.toThrow(/must be base64 of 64 raw bytes/);
  });

  it("rejects an unparseable signature the same way as a wrong one", async () => {
    // Distinguishing them would tell an attacker which half they got wrong.
    const store = new ChallengeStore();
    const kp = Keypair.random();
    const { nonce } = await store.issue(kp.publicKey());
    await expect(store.verify(kp.publicKey(), nonce, "!!!not base64!!!")).rejects.toThrow(AuthError);
  });
});
