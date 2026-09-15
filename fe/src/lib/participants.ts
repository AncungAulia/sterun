/**
 * The vault, as the entry flow uses it (STE-21).
 *
 * Authenticated the same way as uploads (`lib/upload.ts`, be/src/auth.ts): ask
 * for a nonce bound to the address, sign it, send it back in three headers.
 * One challenge per call, because a nonce is single-use and lives two minutes.
 *
 * Details go in once. `participant_hash`, `salt` and `totp_secret` come back
 * once and no route ever returns them again, so the caller must keep them for
 * the rest of the attempt: the hash is what `enter` pays for, the salt is the
 * runner's receipt code, the secret is their pass.
 */
import { apiFetch } from "./api";
import type { MessageSigner } from "./upload";
import type { ParticipantBody } from "@/modules/entry/details";

export interface Submitted {
  /** The vault row. The backend links it to the record from the chain (STE-59). */
  participantId: string;
  participantHash: string;
  salt: string;
  totpSecret: string;
}

async function signedHeaders(address: string, sign: MessageSigner): Promise<Record<string, string>> {
  const challenge = await apiFetch<{ nonce: string; expires_at: string }>("/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });

  // Before the details are sent, deliberately: a declined prompt must cost the
  // runner nothing, and must leave no identity number on its way anywhere.
  const signature = await sign(challenge.nonce, { address });

  return {
    "content-type": "application/json",
    "x-sterun-address": address,
    "x-sterun-nonce": challenge.nonce,
    "x-sterun-signature": signature,
  };
}

export async function submitParticipant(body: ParticipantBody, sign: MessageSigner): Promise<Submitted> {
  const headers = await signedHeaders(body.runner_address, sign);
  const response = await apiFetch<{
    participant_id: string;
    participant_hash: string;
    salt: string;
    totp_secret: string;
  }>("/participants", { method: "POST", headers, body: JSON.stringify(body) });

  return {
    participantId: response.participant_id,
    participantHash: response.participant_hash,
    salt: response.salt,
    totpSecret: response.totp_secret,
  };
}
