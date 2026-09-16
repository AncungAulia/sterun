import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiFetch,
}));

import { ApiError } from "@/lib/api/client";
import { fetchRecordTrail } from "@/modules/profile/lib/record-trail";

beforeEach(() => {
  apiFetch.mockReset();
});

describe("fetchRecordTrail", () => {
  it("takes the latest change, whatever order the index lists them in", async () => {
    apiFetch.mockResolvedValue({
      record: { last_ledger: 900 },
      transitions: [
        { to_state: "Finished", occurred_at: "1790020000", ledger: 890, tx_hash: "f".repeat(64) },
        { to_state: "Entered", occurred_at: "1788000000", ledger: 700, tx_hash: "e".repeat(64) },
        { to_state: "RacepackClaimed", occurred_at: "1789990000", ledger: 880, tx_hash: null },
      ],
    });

    expect(await fetchRecordTrail(7)).toEqual({ txHash: "f".repeat(64) });
    expect(apiFetch).toHaveBeenCalledWith("/records/7");
  });

  it("has no link when the index saw no transaction for that change", async () => {
    apiFetch.mockResolvedValue({
      record: { last_ledger: 880 },
      transitions: [{ to_state: "RacepackClaimed", occurred_at: "1789990000", ledger: 880, tx_hash: null }],
    });
    expect(await fetchRecordTrail(7)).toEqual({ txHash: null });
  });

  it("has no link when the index lists no transitions", async () => {
    apiFetch.mockResolvedValue({ record: { last_ledger: 612 }, transitions: [] });
    expect(await fetchRecordTrail(7)).toEqual({ txHash: null });
  });

  it("is null, not an error, when the index cannot answer", async () => {
    apiFetch.mockRejectedValue(new ApiError(0, "unreachable", "no"));
    expect(await fetchRecordTrail(7)).toBeNull();
  });
});
