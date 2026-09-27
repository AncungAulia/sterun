/**
 * The roster download (STE-16's `GET /events/:eventId/roster`).
 *
 * The most sensitive response in the system: it hands out every runner's
 * check-in secret for one event. The backend decides who may have it by reading
 * `is_scanner` and `get_organiser` from the chain on every request, so all this
 * side does is prove which wallet is asking. Challenge, sign, send, the same as
 * `modules/pass/lib/pass-api.ts`.
 *
 * Two things are measured here rather than later, because later is too late:
 *
 *   - **The clock drift**, at the moment the response lands. `generated_at` is
 *     the backend's clock a moment ago, which is as close to true time as a
 *     volunteer's phone will get before the venue swallows the signal.
 *   - **The TOTP parameters**, taken from the response. A scanner that assumed
 *     them would silently disagree with the backend the day they changed.
 */
import { ApiError, apiFetch } from "@/lib/api/client";
import { PlainError } from "@/lib/api/plain-error";
import type { MessageSigner } from "@/lib/api/upload";

import type { RecordState, StoredRoster } from "./scanner-store";

interface RosterResponse {
  event_id: number;
  snapshot_ledger: number;
  generated_at: string;
  totp: { digits: number; step_seconds: number; tolerance_steps: number };
  entries: {
    token_id: number;
    bib_no: number;
    category_id: number;
    state: RecordState;
    name_fragment?: string | null;
    add_ons?: { item: string; choice: string }[];
    totp_secret: string;
  }[];
  count: number;
  missing_from_index?: number;
}

/** The roster as the backend sends it. The race's name and distances are added from the chain. */
export type RosterDownload = Omit<StoredRoster, "raceName" | "categories">;

export interface DownloadedRoster {
  roster: RosterDownload;
  /** Entries the backend holds but has not indexed yet. Shown, never hidden. */
  missingFromIndex: number;
}

export async function fetchRoster(
  eventId: number,
  address: string,
  sign: MessageSigner,
  now: () => number = Date.now,
): Promise<DownloadedRoster> {
  const challenge = await apiFetch<{ nonce: string; expires_at: string }>("/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });

  const signature = await sign(challenge.nonce, { address });

  let response: RosterResponse;
  try {
    response = await apiFetch<RosterResponse>(`/events/${eventId}/roster`, {
      headers: {
        "content-type": "application/json",
        "x-sterun-address": address,
        "x-sterun-nonce": challenge.nonce,
        "x-sterun-signature": signature,
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === "forbidden") {
      // The one refusal a volunteer can do something about, so it says what.
      throw new PlainError(
        "This wallet is not a scanner for this race. Ask the organiser to add it, then try again.",
      );
    }
    throw error;
  }

  const arrivedAt = now();

  return {
    roster: {
      eventId: response.event_id,
      snapshotLedger: response.snapshot_ledger,
      generatedAt: response.generated_at,
      downloadedAt: new Date(arrivedAt).toISOString(),
      driftSeconds: Math.round((arrivedAt - Date.parse(response.generated_at)) / 1000),
      totp: {
        digits: response.totp.digits,
        stepSeconds: response.totp.step_seconds,
        toleranceSteps: response.totp.tolerance_steps,
      },
      entries: response.entries.map((entry) => ({
        tokenId: entry.token_id,
        bibNo: entry.bib_no,
        categoryId: entry.category_id,
        state: entry.state,
        nameFragment: entry.name_fragment ?? null,
        addOns: entry.add_ons ?? [],
        totpSecret: entry.totp_secret,
      })),
    },
    missingFromIndex: response.missing_from_index ?? 0,
  };
}
