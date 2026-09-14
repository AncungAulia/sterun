import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import { fetchScanners } from "@/lib/scanners";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const ADDRESS = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";

// Braces, not an expression body: vitest runs a function returned from
// beforeEach as a teardown, and `mockReset()` returns the mock itself, which
// would then be called after every test.
beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("fetchScanners", () => {
  describe("positive", () => {
    it("reads the fields the index sends today and leaves the rest empty", async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        scanners: [{ address: ADDRESS, added_ledger: 120 }],
        last_ledger: 130,
      });
      expect(await fetchScanners(3)).toEqual([
        { address: ADDRESS, addedLedger: 120, addedAt: null, scans: null },
      ]);
      expect(apiFetch).toHaveBeenCalledWith("/events/3/scanners");
    });

    it("reads when a scanner was added and what it scanned, once the index sends them", async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        scanners: [{ address: ADDRESS, added_ledger: 120, added_at: "1790000000", scans: 118 }],
        last_ledger: 130,
      });
      expect(await fetchScanners(3)).toEqual([
        { address: ADDRESS, addedLedger: 120, addedAt: 1_790_000_000n, scans: 118 },
      ]);
    });
  });

  describe("negative", () => {
    it("passes a refusal on rather than reading it as no scanners", async () => {
      vi.mocked(apiFetch).mockImplementation(async () => {
        throw new Error("not indexed");
      });
      await expect(fetchScanners(3)).rejects.toMatchObject({ message: "not indexed" });
    });
  });
});
