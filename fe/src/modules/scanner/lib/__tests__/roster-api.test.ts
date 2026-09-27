/**
 * The roster download. Mocked at apiFetch, so what is asserted is exactly what
 * would go over the wire.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiFetch,
}));

import { ApiError } from "@/lib/api/client";
import { PlainError } from "@/lib/api/plain-error";
import { fetchRoster } from "@/modules/scanner/lib/roster-api";

const SCANNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const CHALLENGE = { nonce: "n1", expires_at: "2026-09-27T00:12:00Z" };
const GENERATED = "2026-09-27T00:10:00.000Z";
const AT_GENERATION = Date.parse(GENERATED);

const BODY = {
  event_id: 3,
  snapshot_ledger: 612_400,
  generated_at: GENERATED,
  totp: { digits: 6, step_seconds: 30, tolerance_steps: 1 },
  entries: [
    {
      token_id: 11,
      bib_no: 1,
      category_id: 0,
      state: "Entered",
      name_fragment: "Budi S.",
      add_ons: [{ item: "Event jersey", choice: "L" }],
      totp_secret: "c".repeat(64),
    },
    {
      token_id: 12,
      bib_no: 2,
      category_id: 1,
      state: "RacepackClaimed",
      name_fragment: null,
      totp_secret: "d".repeat(64),
    },
  ],
  count: 2,
  missing_from_index: 1,
};

const sign = async () => "sig";

beforeEach(() => apiFetch.mockReset());

describe("fetchRoster", () => {
  describe("positive", () => {
    it("signs a fresh challenge and asks for this event's roster", async () => {
      apiFetch.mockResolvedValueOnce(CHALLENGE).mockResolvedValueOnce(BODY);

      await fetchRoster(3, SCANNER, sign, () => AT_GENERATION);

      expect(apiFetch).toHaveBeenNthCalledWith(1, "/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: SCANNER }),
      });
      expect(apiFetch).toHaveBeenNthCalledWith(2, "/events/3/roster", {
        headers: {
          "content-type": "application/json",
          "x-sterun-address": SCANNER,
          "x-sterun-nonce": "n1",
          "x-sterun-signature": "sig",
        },
      });
    });

    it("maps the response to what the phone stores, with the tolerance the backend sent", async () => {
      apiFetch.mockResolvedValueOnce(CHALLENGE).mockResolvedValueOnce(BODY);

      const { roster, missingFromIndex } = await fetchRoster(3, SCANNER, sign, () => AT_GENERATION + 1_000);

      expect(missingFromIndex).toBe(1);
      expect(roster).toEqual({
        eventId: 3,
        snapshotLedger: 612_400,
        generatedAt: GENERATED,
        downloadedAt: "2026-09-27T00:10:01.000Z",
        driftSeconds: 1,
        totp: { digits: 6, stepSeconds: 30, toleranceSteps: 1 },
        entries: [
          {
            tokenId: 11,
            bibNo: 1,
            categoryId: 0,
            state: "Entered",
            nameFragment: "Budi S.",
            addOns: [{ item: "Event jersey", choice: "L" }],
            totpSecret: "c".repeat(64),
          },
          {
            tokenId: 12,
            bibNo: 2,
            categoryId: 1,
            state: "RacepackClaimed",
            nameFragment: null,
            addOns: [],
            totpSecret: "d".repeat(64),
          },
        ],
      });
    });

    it("measures a fast phone as positive drift and a slow one as negative", async () => {
      apiFetch.mockResolvedValueOnce(CHALLENGE).mockResolvedValueOnce(BODY);
      const fast = await fetchRoster(3, SCANNER, sign, () => AT_GENERATION + 240_000);
      expect(fast.roster.driftSeconds).toBe(240);

      apiFetch.mockResolvedValueOnce(CHALLENGE).mockResolvedValueOnce(BODY);
      const slow = await fetchRoster(3, SCANNER, sign, () => AT_GENERATION - 95_000);
      expect(slow.roster.driftSeconds).toBe(-95);
    });
  });

  describe("negative", () => {
    it("asks for nothing when the wallet declines to sign", async () => {
      apiFetch.mockResolvedValueOnce(CHALLENGE);
      const declined = new Error("declined");

      await expect(
        fetchRoster(3, SCANNER, async () => {
          throw declined;
        }),
      ).rejects.toBe(declined);
      expect(apiFetch).toHaveBeenCalledTimes(1);
    });

    it("says what to do when the wallet is not a scanner for this race", async () => {
      apiFetch
        .mockResolvedValueOnce(CHALLENGE)
        .mockRejectedValueOnce(new ApiError(403, "forbidden", "neither organiser nor scanner"));

      const failure = await fetchRoster(3, SCANNER, sign).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(PlainError);
      expect((failure as Error).message).toMatch(/not a scanner for this race/);
    });

    it("passes any other failure through untouched", async () => {
      const offline = new ApiError(0, "network", "offline");
      apiFetch.mockResolvedValueOnce(CHALLENGE).mockRejectedValueOnce(offline);

      await expect(fetchRoster(3, SCANNER, sign)).rejects.toBe(offline);
    });
  });
});
