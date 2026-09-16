/**
 * The secret, fetched for a phone that did not enter (STE-52).
 *
 * The second and last place a `totp_secret` leaves the vault; the first is the
 * scanner roster. The backend checks `owner_of(token_id)` on chain before it
 * reads anything, so only the wallet that owns the record can ask, and a record
 * is non-transferable, which makes that owner the runner.
 *
 * The challenge is signed before the request, the same shape every other
 * authenticated route here uses (`modules/entry/lib/participants.ts`). A
 * declined signature therefore costs one request and asks for nothing.
 */
import { apiFetch } from "@/lib/api/client";
import type { MessageSigner } from "@/lib/api/upload";

export async function fetchPass(
  tokenId: number,
  address: string,
  sign: MessageSigner,
): Promise<{ totpSecret: string; bibName: string | null }> {
  const challenge = await apiFetch<{ nonce: string; expires_at: string }>("/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });

  const signature = await sign(challenge.nonce, { address });

  const response = await apiFetch<{
    token_id: number;
    totp_secret: string;
    bib_name: string | null;
  }>(`/records/${tokenId}/pass`, {
    headers: {
      "content-type": "application/json",
      "x-sterun-address": address,
      "x-sterun-nonce": challenge.nonce,
      "x-sterun-signature": signature,
    },
  });

  // `bib_name` is null for an entry made before the form asked for one.
  return { totpSecret: response.totp_secret, bibName: response.bib_name };
}
