/**
 * The vault, as the entry flow calls it. The backend is mocked at `apiFetch`,
 * so what is asserted is exactly what would go over the wire.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch,
}));

import { ApiError } from "@/lib/api";
import { confirmParticipant, submitParticipant } from "@/lib/participants";
import type { ParticipantBody } from "@/modules/entry/details";

const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const body = { runner_address: RUNNER, event_id: 1, category_id: 0, name: "Sari" } as ParticipantBody;

const CHALLENGE = { nonce: "n1", expires_at: "2026-09-15T00:02:00Z" };
const SUBMITTED = {
  participant_id: "6f1c9a52-3c1b-4b5e-9d0e-2a1f3b4c5d6e",
  participant_hash: "a".repeat(64),
  salt: "b".repeat(64),
  totp_secret: "c".repeat(64),
  shown_once: true,
};

describe("submitParticipant", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("asks for a challenge bound to the runner's address", async () => {
    apiFetch.mockResolvedValueOnce(CHALLENGE).mockResolvedValueOnce(SUBMITTED);
    await submitParticipant(body, async () => "sig");
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/auth/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: RUNNER }),
    });
  });

  it("signs the nonce and sends the body with the three headers", async () => {
    apiFetch.mockResolvedValueOnce(CHALLENGE).mockResolvedValueOnce(SUBMITTED);
    const sign = vi.fn(async () => "sig");

    await submitParticipant(body, sign);

    expect(sign).toHaveBeenCalledWith("n1", { address: RUNNER });
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/participants", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sterun-address": RUNNER,
        "x-sterun-nonce": "n1",
        "x-sterun-signature": "sig",
      },
      body: JSON.stringify(body),
    });
  });

  it("hands back the four values the attempt must keep", async () => {
    apiFetch.mockResolvedValueOnce(CHALLENGE).mockResolvedValueOnce(SUBMITTED);
    expect(await submitParticipant(body, async () => "sig")).toEqual({
      participantId: SUBMITTED.participant_id,
      participantHash: "a".repeat(64),
      salt: "b".repeat(64),
      totpSecret: "c".repeat(64),
    });
  });

  it("sends no personal details when the signature is declined", async () => {
    apiFetch.mockResolvedValueOnce(CHALLENGE);
    await expect(
      submitParticipant(body, async () => {
        throw new Error("User declined");
      }),
    ).rejects.toThrow("User declined");
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("passes a vault refusal through as the ApiError it is", async () => {
    apiFetch
      .mockResolvedValueOnce(CHALLENGE)
      .mockRejectedValueOnce(new ApiError(400, "invalid-date-of-birth", "Check it."));
    await expect(submitParticipant(body, async () => "sig")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("confirmParticipant", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("links the vault row to the token with a fresh challenge", async () => {
    apiFetch
      .mockResolvedValueOnce({ nonce: "n2", expires_at: "x" })
      .mockResolvedValueOnce({ participant_id: "p1", token_id: 7, enter_tx_hash: "d".repeat(64) });

    await confirmParticipant({
      participantId: "p1",
      tokenId: 7,
      txHash: "d".repeat(64),
      address: RUNNER,
      sign: async () => "sig2",
    });

    expect(apiFetch).toHaveBeenNthCalledWith(2, "/participants/p1/confirm", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sterun-address": RUNNER,
        "x-sterun-nonce": "n2",
        "x-sterun-signature": "sig2",
      },
      body: JSON.stringify({ token_id: 7, enter_tx_hash: "d".repeat(64) }),
    });
  });
});
