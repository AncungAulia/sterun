/**
 * Publishing the event details file, so the organiser does not have to host it.
 *
 * `create_event` takes a `uri` and a `metadata_hash` and stores both forever.
 * Until the backend grew `POST /events/files`, the only way to get a pair was
 * "put the file online yourself and paste the link" — the step most likely to
 * make the whole wizard go unused, and the one most likely to be got wrong in a
 * way that cannot be undone.
 *
 * ## Why the hash needs no arithmetic here
 *
 * The store is content-addressed: the url ends with the sha256 of the bytes it
 * serves. So `url` and `sha256` are one fact written twice, and a file served
 * from that url cannot later be different bytes — which is exactly the property
 * `metadata_hash` needs. The backend sends the hash separately anyway rather
 * than making us slice it out of the url, because an off-by-one there would
 * only show up on chain.
 *
 * ## Authentication, and why it is a wallet signature
 *
 * Every authenticated backend route works the same way (be/src/auth.ts): ask
 * for a nonce, sign it, send `x-sterun-address` / `x-sterun-nonce` /
 * `x-sterun-signature`. The organiser already holds a Stellar keypair and is
 * about to sign `create_event` with it, so there is no second credential to
 * invent. The nonce is single-use and expires in two minutes, which is why one
 * is fetched per upload rather than cached.
 *
 * The upload is authenticated but NOT authorised against an event: there is no
 * event yet, that is the whole ordering of the wizard.
 */
import { ApiError, apiFetch } from "./api";

/** What the store answered, in the shape the wizard needs it. */
export interface UploadedFile {
  /** Absolute, because it is destined for `create_event`'s `uri` argument. */
  url: string;
  /** Hex, lower case. This is the value that goes into `metadata_hash`. */
  sha256: string;
  size: number;
  contentType: string;
  /** False when these exact bytes were already stored. Not an error. */
  created: boolean;
}

/** Just enough of `lib/wallet`'s signer to test this without a wallet. */
export type MessageSigner = (
  message: string,
  opts?: { address?: string },
) => Promise<string>;

export interface UploadRequest {
  /**
   * `Uint8Array<ArrayBuffer>`, not a bare `Uint8Array`: `fetch` will not take a
   * view whose buffer might be a `SharedArrayBuffer`, which is what the bare
   * type allows. `TextEncoder.encode` already returns the narrow one.
   */
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
  /** The connected organiser. The nonce is bound to it. */
  address: string;
  /**
   * The hash this upload is expected to produce, when the caller already
   * computed it locally. Supplying it turns a silent corruption into a refusal
   * — see the check below.
   */
  expectedSha256?: string;
  sign: MessageSigner;
}

export async function uploadEventFile({
  bytes,
  contentType,
  address,
  expectedSha256,
  sign,
}: UploadRequest): Promise<UploadedFile> {
  const challenge = await apiFetch<{ nonce: string; expires_at: string }>("/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });

  // Before the bytes, deliberately. A wallet rejection here should cost the
  // organiser nothing: no upload attempted, no rate limit spent.
  const signature = await sign(challenge.nonce, { address });

  const stored = await apiFetch<{
    url: string;
    sha256: string;
    size: number;
    content_type: string;
    created: boolean;
  }>("/events/files", {
    method: "POST",
    headers: {
      "content-type": contentType,
      "x-sterun-address": address,
      "x-sterun-nonce": challenge.nonce,
      "x-sterun-signature": signature,
    },
    body: bytes,
  });

  // Content-addressing makes these equal by construction, so a mismatch means
  // the bytes changed between here and there. Committing the local hash for a
  // url serving something else is permanent: there is no `update_event`, and
  // the event page would say "the document has been changed" for the rest of
  // the event's life.
  if (expectedSha256 && stored.sha256 !== expectedSha256) {
    throw new ApiError(
      200,
      "hash-mismatch",
      "The file that arrived is a different file from the one built here, so its " +
        "fingerprint would not match. Nothing has been recorded. Try publishing again.",
    );
  }

  return {
    url: stored.url,
    sha256: stored.sha256,
    size: stored.size,
    contentType: stored.content_type,
    created: stored.created,
  };
}
