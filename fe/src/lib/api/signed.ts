/**
 * The one way this app makes an authenticated backend request.
 *
 * Every authenticated route works the same way (`be/src/auth.ts`): ask for a
 * nonce, sign it, send `x-sterun-address` / `x-sterun-nonce` /
 * `x-sterun-signature`. The organiser already holds a Stellar keypair and is
 * about to sign a transaction with it, so there is no second credential to
 * invent. The nonce is single-use and expires in two minutes, which is why one
 * is fetched per request rather than cached.
 *
 * **Here rather than inside `upload.ts`** (2026-09-24): the results preview is
 * the second caller, and the repo's rule is that a thing used twice moves up in
 * the same commit that adds the second user. Copying the three header names
 * into a second file is how one of them ends up spelled differently, which
 * fails as a 401 with nothing pointing at the cause.
 *
 * **The signature is taken before the body is sent**, deliberately. A wallet
 * rejection should cost the caller nothing: no upload attempted, no rate limit
 * spent on a request that was never going to be accepted.
 */
import { apiFetch } from "@/lib/api/client";

/** Just enough of `lib/wallet`'s signer to test this without a wallet. */
export type MessageSigner = (
  message: string,
  opts?: { address?: string },
) => Promise<string>;

export interface SignedRequest {
  /** The path, as `apiFetch` takes it. */
  path: string;
  method: "POST" | "GET";
  /** The connected wallet. The nonce is bound to it. */
  address: string;
  sign: MessageSigner;
  /** Sent as-is. A `Uint8Array` for bytes, a string for text. */
  body?: BodyInit;
  contentType?: string;
}

/** The nonce this app asked for, and what it expires at. */
interface Challenge {
  nonce: string;
  expires_at: string;
}

export async function signedFetch<T>({
  path,
  method,
  address,
  sign,
  body,
  contentType,
}: SignedRequest): Promise<T> {
  const challenge = await apiFetch<Challenge>("/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });

  const signature = await sign(challenge.nonce, { address });

  return apiFetch<T>(path, {
    method,
    headers: {
      ...(contentType ? { "content-type": contentType } : {}),
      "x-sterun-address": address,
      "x-sterun-nonce": challenge.nonce,
      "x-sterun-signature": signature,
    },
    body,
  });
}
