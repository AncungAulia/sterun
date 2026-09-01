/**
 * STE-11 — proving you are the Stellar account you claim to be.
 *
 * The vault holds a person's identity documents, so "who is asking" cannot be
 * an unauthenticated address in a JSON body. The ticket's recommendation for
 * v1 testnet is wallet-signature auth, which fits this system better than
 * sessions would: the runner already has a Stellar keypair and is about to sign
 * `enter` with it, so there is no second credential to invent, store or lose.
 *
 *   POST /auth/challenge {address}  ->  {nonce, expiresAt}
 *   sign the nonce with the account's key
 *   send x-sterun-address / x-sterun-nonce / x-sterun-signature on the request
 *
 * Three properties, each of which is a real attack if missing:
 *
 *   single use   a nonce is deleted the moment it is spent, so a captured
 *                signature cannot be replayed;
 *   expiring     an unused nonce dies after two minutes, so a signature
 *                harvested from a client's logs has a short life;
 *   bound        the nonce is issued for one address and only verifies against
 *                that address's key.
 *
 * The store is in-memory, which is honest for one process on testnet and is
 * NOT honest behind more than one. STE-31 (deploy to a VPS) has to move this
 * to Redis or Postgres before there is a second instance; a nonce issued by
 * instance A and spent at instance B would simply fail, intermittently, which
 * is the worst way to find out.
 */
import { randomBytes } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

export const NONCE_TTL_MS = 2 * 60 * 1000;
/** Ed25519 signatures are always exactly this long. */
export const SIGNATURE_BYTES = 64;

export interface Challenge {
  nonce: string;
  expiresAt: Date;
}

export class AuthError extends Error {
  constructor(
    readonly reason:
      | "malformed-address"
      | "missing-credentials"
      | "unknown-nonce"
      | "expired-nonce"
      | "malformed-signature"
      | "bad-signature",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

interface Issued {
  address: string;
  expiresAtMs: number;
}

export class ChallengeStore {
  private readonly issued = new Map<string, Issued>();

  constructor(private readonly now: () => number = Date.now) {}

  issue(address: string): Challenge {
    if (!StrKey.isValidEd25519PublicKey(address)) {
      throw new AuthError("malformed-address", "address must be a Stellar public key (G…)");
    }
    // Sweeping on issue keeps the map bounded without a timer, and the cost is
    // proportional to traffic rather than to wall-clock time.
    this.sweep();

    const nonce = randomBytes(32).toString("hex");
    const expiresAtMs = this.now() + NONCE_TTL_MS;
    this.issued.set(nonce, { address, expiresAtMs });
    return { nonce, expiresAt: new Date(expiresAtMs) };
  }

  /**
   * Spend a nonce. Returns the address it was issued to, and throws for every
   * way that can fail — the caller never gets a boolean it might forget to
   * check.
   */
  verify(address: string | undefined, nonce: string | undefined, signatureB64: string | undefined): string {
    if (!address || !nonce || !signatureB64) {
      throw new AuthError(
        "missing-credentials",
        "x-sterun-address, x-sterun-nonce and x-sterun-signature are all required",
      );
    }
    const record = this.issued.get(nonce);
    if (!record) {
      throw new AuthError("unknown-nonce", "nonce was never issued, or has already been used");
    }
    // Deleted before any further check: a nonce presented once is spent, even
    // if the signature turns out to be wrong. Otherwise an attacker with a
    // captured nonce could brute-force signatures against it.
    this.issued.delete(nonce);

    if (record.expiresAtMs <= this.now()) {
      throw new AuthError("expired-nonce", "nonce has expired; request a new challenge");
    }
    if (record.address !== address) {
      throw new AuthError("bad-signature", "nonce was issued to a different address");
    }

    // Checked before verifying, because the overwhelmingly common cause of a
    // wrong-length signature is a client that did `keypair.sign(...).toString(
    // "base64")`. `Keypair.sign` returns a Uint8Array, and Uint8Array's
    // toString IGNORES its argument — the result is "12,34,56,…", which
    // base64-decodes to garbage of the wrong length. Telling that client
    // "malformed-signature: expected 64 bytes, got 47" costs nothing and saves
    // an afternoon; leaving it as "bad-signature" sends them looking at their
    // key. (Wrap it: `Buffer.from(kp.sign(msg)).toString("base64")`.)
    const signature = Buffer.from(signatureB64, "base64");
    if (signature.length !== SIGNATURE_BYTES) {
      throw new AuthError(
        "malformed-signature",
        `signature must be base64 of ${SIGNATURE_BYTES} raw bytes, got ${signature.length}. ` +
          "If you built it with `keypair.sign(msg).toString(\"base64\")`, wrap it: " +
          '`Buffer.from(keypair.sign(msg)).toString("base64")` — Uint8Array.toString ignores the encoding.',
      );
    }

    let ok: boolean;
    try {
      ok = Keypair.fromPublicKey(address).verify(Buffer.from(nonce, "utf8"), signature);
    } catch {
      // A malformed address or an unparseable signature is the same answer as a
      // wrong one; distinguishing them would leak which part was wrong.
      ok = false;
    }
    if (!ok) throw new AuthError("bad-signature", "signature does not match the nonce");

    return address;
  }

  /** Only for tests and diagnostics. */
  get size(): number {
    return this.issued.size;
  }

  private sweep(): void {
    const now = this.now();
    for (const [nonce, record] of this.issued) {
      if (record.expiresAtMs <= now) this.issued.delete(nonce);
    }
  }
}
