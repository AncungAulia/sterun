/**
 * The one route that hands a secret back (STE-52). Mocked at apiFetch, so what
 * is asserted is exactly what would go over the wire.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiFetch,
}));

import { ApiError } from "@/lib/api/client";
import { fetchPass } from "@/modules/pass/lib/pass-api";

const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const CHALLENGE = { nonce: "n1", expires_at: "2026-09-16T00:02:00Z" };

beforeEach(() => apiFetch.mockReset());

describe("fetchPass", () => {
  describe("positive", () => {
    it("signs a fresh challenge and asks for this token's pass", async () => {
      apiFetch
        .mockResolvedValueOnce(CHALLENGE)
        .mockResolvedValueOnce({ token_id: 7, totp_secret: "c".repeat(64), bib_name: "SARI" });

      const got = await fetchPass(7, RUNNER, async () => "sig");

      expect(got).toEqual({ totpSecret: "c".repeat(64), bibName: "SARI" });
      expect(apiFetch).toHaveBeenNthCalledWith(1, "/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: RUNNER }),
      });
      expect(apiFetch).toHaveBeenNthCalledWith(2, "/records/7/pass", {
        headers: {
          "content-type": "application/json",
          "x-sterun-address": RUNNER,
          "x-sterun-nonce": "n1",
          "x-sterun-signature": "sig",
        },
      });
    });

    it("accepts an entry made before the form asked for a bib name", async () => {
      apiFetch
        .mockResolvedValueOnce(CHALLENGE)
        .mockResolvedValueOnce({ token_id: 7, totp_secret: "c".repeat(64), bib_name: null });

      expect(await fetchPass(7, RUNNER, async () => "sig")).toEqual({
        totpSecret: "c".repeat(64),
        bibName: null,
      });
    });
  });

  describe("negative", () => {
    it("asks for nothing when the wallet declines to sign", async () => {
      apiFetch.mockResolvedValueOnce(CHALLENGE);

      await expect(
        fetchPass(7, RUNNER, async () => {
          throw new Error("User declined");
        }),
      ).rejects.toThrow("User declined");

      expect(apiFetch).toHaveBeenCalledTimes(1);
    });

    it("passes a refusal through as the ApiError it is, so the screen can name it", async () => {
      apiFetch
        .mockResolvedValueOnce(CHALLENGE)
        .mockRejectedValueOnce(new ApiError(403, "forbidden", "Not yours."));

      await expect(fetchPass(7, RUNNER, async () => "sig")).rejects.toBeInstanceOf(ApiError);
    });
  });
});
