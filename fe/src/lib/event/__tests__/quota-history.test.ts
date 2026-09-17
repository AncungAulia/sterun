import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchQuotaHistory } from "../quota-history";

function respond(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("fetchQuotaHistory", () => {
  it("reads each distance's raises, oldest first, keyed by category id", async () => {
    const fetchMock = respond({
      event_id: 4,
      categories: [
        {
          category_id: 0,
          quota_history: [
            { previous: 500, current: 800, at: "1789700000", ledger: 1, tx_hash: "a" },
            { previous: 800, current: 1000, at: "1789800000", ledger: 2, tx_hash: "b" },
          ],
        },
        { category_id: 1, quota_history: [] },
      ],
    });

    const raises = await fetchQuotaHistory(4);

    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/events\/4$/);
    expect(raises.get(0)).toEqual([
      { previous: 500, current: 800, at: 1_789_700_000n },
      { previous: 800, current: 1000, at: 1_789_800_000n },
    ]);
    expect(raises.has(1)).toBe(false);
  });

  it("drops a row that does not describe a rise, and tolerates a category without history", async () => {
    respond({
      categories: [
        { category_id: 0, quota_history: [{ previous: 800, current: 800, at: "1789700000" }] },
        { category_id: 1, quota_history: [{ previous: 1, current: 2, at: "soon" }] },
        { category_id: 2 },
      ],
    });
    expect((await fetchQuotaHistory(4)).size).toBe(0);
  });

  it("throws when the index cannot be reached, so the page can leave the line out", async () => {
    respond({ error: "not_indexed" }, 404);
    await expect(fetchQuotaHistory(4)).rejects.toMatchObject({ code: "not_indexed" });
  });
});
