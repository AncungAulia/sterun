/**
 * STE-31 — nonces shared across instances.
 *
 * The reason this file exists is one sentence in `be/src/auth.ts` that was true
 * until now: the in-memory store "is NOT honest behind more than one" process.
 * These tests are what makes it honest — and, more usefully, what would catch a
 * future change that quietly broke it back.
 *
 * Two `ChallengeStore`s over the same pool stand in for two instances behind a
 * load balancer. That is a faithful model: the instances share nothing except
 * the database, which is exactly the deployment STE-31 produces.
 */
import { Keypair } from "@stellar/stellar-sdk";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthError, ChallengeStore, MemoryNonces, NONCE_TTL_MS } from "../src/auth.js";
import { PostgresNonces } from "../src/auth-postgres.js";
import { DATABASE_URL, SKIP_REASON, freshDatabase } from "./helpers/db.js";

const sign = (kp: Keypair, nonce: string) =>
  Buffer.from(kp.sign(Buffer.from(nonce, "utf8"))).toString("base64");

describe.skipIf(!DATABASE_URL)(`nonces in postgres (${DATABASE_URL ? "on" : SKIP_REASON})`, () => {
  let pool: Pool;
  let close: () => Promise<void>;
  /** Two instances, sharing only the database. */
  let alpha: ChallengeStore;
  let beta: ChallengeStore;
  let now: number;

  beforeEach(async () => {
    ({ pool, close } = await freshDatabase());
    now = Date.UTC(2026, 8, 5, 12, 0, 0);
    const clock = () => now;
    alpha = new ChallengeStore(clock, new PostgresNonces(pool));
    beta = new ChallengeStore(clock, new PostgresNonces(pool));
  });

  afterEach(async () => {
    await close();
  });

  it("lets one instance spend a nonce the other issued", async () => {
    // The whole point. Under the memory store this threw "unknown-nonce",
    // intermittently, depending on which instance the load balancer picked.
    const kp = Keypair.random();
    const { nonce } = await alpha.issue(kp.publicKey());
    await expect(beta.verify(kp.publicKey(), nonce, sign(kp, nonce))).resolves.toBe(kp.publicKey());
  });

  it("still spends it only once, whichever instance gets there first", async () => {
    const kp = Keypair.random();
    const { nonce } = await alpha.issue(kp.publicKey());
    const signature = sign(kp, nonce);

    await expect(beta.verify(kp.publicKey(), nonce, signature)).resolves.toBe(kp.publicKey());
    await expect(alpha.verify(kp.publicKey(), nonce, signature)).rejects.toThrow(
      /already been used/,
    );
  });

  it("gives exactly one winner when both instances present it at once", async () => {
    // The race the DELETE … RETURNING exists for. A read-then-delete would let
    // both through in the window between the two statements — and behind a load
    // balancer those two statements are on different machines.
    const kp = Keypair.random();
    const { nonce } = await alpha.issue(kp.publicKey());
    const signature = sign(kp, nonce);

    const outcomes = await Promise.allSettled([
      alpha.verify(kp.publicKey(), nonce, signature),
      beta.verify(kp.publicKey(), nonce, signature),
    ]);

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "rejected")).toHaveLength(1);
  });

  it("spends the nonce even when the signature is wrong", async () => {
    // Otherwise somebody holding a captured nonce could brute-force signatures
    // against it. Unchanged from the memory store, re-asserted here because the
    // ordering (take first, check second) now lives in a different place.
    const kp = Keypair.random();
    const { nonce } = await alpha.issue(kp.publicKey());
    await expect(
      beta.verify(kp.publicKey(), nonce, sign(Keypair.random(), nonce)),
    ).rejects.toThrow(AuthError);
    await expect(alpha.size()).resolves.toBe(0);
  });

  it("expires a nonce across instances too", async () => {
    const kp = Keypair.random();
    const { nonce } = await alpha.issue(kp.publicKey());
    now += NONCE_TTL_MS + 1;
    await expect(beta.verify(kp.publicKey(), nonce, sign(kp, nonce))).rejects.toThrow(
      /has expired/,
    );
  });

  it("still accepts one millisecond before expiry", async () => {
    const kp = Keypair.random();
    const { nonce } = await alpha.issue(kp.publicKey());
    now += NONCE_TTL_MS - 1;
    await expect(beta.verify(kp.publicKey(), nonce, sign(kp, nonce))).resolves.toBe(kp.publicKey());
  });

  it("sweeps expired rows rather than growing without bound", async () => {
    for (let i = 0; i < 5; i += 1) await alpha.issue(Keypair.random().publicKey());
    await expect(alpha.size()).resolves.toBe(5);

    now += NONCE_TTL_MS + 1;
    // A sweep by either instance clears what both of them left behind.
    await beta.issue(Keypair.random().publicKey());
    await expect(alpha.size()).resolves.toBe(1);
  });

  it("keeps a nonce bound to the address it was issued to", async () => {
    const alice = Keypair.random();
    const bob = Keypair.random();
    const { nonce } = await alpha.issue(alice.publicKey());
    await expect(beta.verify(bob.publicKey(), nonce, sign(bob, nonce))).rejects.toThrow(
      /issued to a different address/,
    );
  });
});

describe("the two backends agree on behaviour", () => {
  it("the memory backend spends a nonce exactly once as well", async () => {
    // The single-process path is still a supported deployment (`pnpm dev`, and
    // one instance on a small VPS), so it is not allowed to quietly diverge.
    const kp = Keypair.random();
    const store = new ChallengeStore(Date.now, new MemoryNonces());
    const { nonce } = await store.issue(kp.publicKey());
    const signature = sign(kp, nonce);

    await expect(store.verify(kp.publicKey(), nonce, signature)).resolves.toBe(kp.publicKey());
    await expect(store.verify(kp.publicKey(), nonce, signature)).rejects.toThrow(
      /already been used/,
    );
  });

  it("defaults to the memory backend when none is given", async () => {
    const kp = Keypair.random();
    const store = new ChallengeStore();
    const { nonce } = await store.issue(kp.publicKey());
    await expect(store.verify(kp.publicKey(), nonce, sign(kp, nonce))).resolves.toBe(
      kp.publicKey(),
    );
  });
});
