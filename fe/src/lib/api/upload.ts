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
 * The challenge, the signature and the three headers live in
 * `lib/api/signed.ts`, which the results preview also uses. The organiser
 * already holds a Stellar keypair and is about to sign `create_event` with it,
 * so there is no second credential to invent.
 *
 * The upload is authenticated but NOT authorised against an event: there is no
 * event yet, that is the whole ordering of the wizard.
 */
import { ApiError } from "@/lib/api/client";
import { signedFetch, type MessageSigner } from "@/lib/api/signed";

/**
 * Mirrors `MAX_FILE_BYTES` in `be/src/routes/files.ts`. Duplicated rather than
 * imported because the backend is not a dependency of this app, and checking it
 * here only saves the organiser a wallet prompt and an upload — the limit that
 * counts is still the server's.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

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

export type { MessageSigner };

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
  const stored = await signedFetch<{
    url: string;
    sha256: string;
    size: number;
    content_type: string;
    created: boolean;
  }>({
    path: "/events/files",
    method: "POST",
    address,
    sign,
    body: bytes,
    contentType,
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
      "Your race details did not upload correctly. Nothing has been created. Please try again.",
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
