import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useResultsRun } from "../hooks/useResultsRun";
import type { ReviewedRow } from "../lib/results-preview";

const write = vi.hoisted(() => vi.fn());
vi.mock("@/modules/organiser/shared/hooks/useOrganiser", () => ({
  useRecordResults: () => ({ write }),
}));
vi.mock("@/hooks/useWallet", () => ({
  useWallet: (select?: (state: { address: string }) => unknown) =>
    select ? select({ address: "GA5V" }) : { address: "GA5V" },
}));
const recordOf = vi.hoisted(() => vi.fn());
vi.mock("@/lib/chain/sterun", () => ({ readClient: { recordOf } }));

/** 121 rows, which is one more than a batch holds, so the plan has two. */
function rows(count: number): ReviewedRow[] {
  return Array.from({ length: count }, (_, index) => ({
    line: index + 2,
    bibNo: index + 1,
    categoryId: 0,
    finishTimeS: 3161,
    kind: "timed" as const,
    tokenId: index + 1,
    state: "RacepackClaimed",
    anomalies: [],
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  write.mockResolvedValue(undefined);
});

describe("useResultsRun", () => {
  describe("positive", () => {
    it("sends one transaction per batch, in order", async () => {
      const { result } = renderHook(() => useResultsRun({ eventId: 3, rows: rows(121) }));

      expect(result.current.batches.map((batch) => batch.label)).toEqual([
        "Runners 1 to 120",
        "Runner 121",
      ]);

      await act(async () => {
        await result.current.start();
      });

      expect(write).toHaveBeenCalledTimes(2);
      expect(write.mock.calls[0]![0].results).toHaveLength(120);
      expect(write.mock.calls[1]![0].results).toEqual([
        { tokenId: 121, kind: "timed", finishTimeS: 3161 },
      ]);
      expect(result.current.isComplete).toBe(true);
      expect(result.current.recorded).toBe(121);
    });

    it("keeps what landed when a later batch fails, and resumes from there", async () => {
      write.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("User declined"));
      // The runner in the failed batch has no result, so it really did not land.
      recordOf.mockResolvedValue({ state: "RacepackClaimed" });

      const { result } = renderHook(() => useResultsRun({ eventId: 3, rows: rows(121) }));
      await act(async () => {
        await result.current.start();
      });

      expect(result.current.recorded).toBe(120);
      expect(result.current.left).toBe(1);
      expect(result.current.error).toBeTruthy();
      expect(result.current.batches.map((batch) => batch.state)).toEqual(["done", "waiting"]);

      // Continue sends only what is left, never what landed.
      write.mockResolvedValue(undefined);
      await act(async () => {
        await result.current.start();
      });

      expect(write).toHaveBeenCalledTimes(3);
      expect(write.mock.calls[2]![0].results).toHaveLength(1);
      expect(result.current.isComplete).toBe(true);
    });
  });

  describe("negative", () => {
    it("reads a batch that failed without an answer as landed, and says nothing went wrong", async () => {
      // The transaction landed; the browser never heard it. One read settles
      // the whole batch, because a batch is atomic.
      write.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("no answer"));
      recordOf.mockResolvedValue({ state: "Finished" });

      const { result } = renderHook(() => useResultsRun({ eventId: 3, rows: rows(121) }));
      await act(async () => {
        await result.current.start();
      });

      expect(recordOf).toHaveBeenCalledTimes(1);
      expect(recordOf).toHaveBeenCalledWith(121);
      expect(result.current.recorded).toBe(121);
      expect(result.current.isComplete).toBe(true);
      // Telling somebody to send again what already landed is how a race gets
      // a second result it can never remove.
      expect(result.current.error).toBeNull();
    });

    it("keeps the failure when the chain says the batch is still unrecorded", async () => {
      write.mockRejectedValue(new Error("User declined the transaction"));
      recordOf.mockResolvedValue({ state: "Entered" });

      const { result } = renderHook(() => useResultsRun({ eventId: 3, rows: rows(2) }));
      await act(async () => {
        await result.current.start();
      });

      await waitFor(() => expect(result.current.error).toBeTruthy());
      expect(result.current.recorded).toBe(0);
      expect(result.current.isComplete).toBe(false);
    });

    it("keeps what is on screen true when the node will not answer either", async () => {
      write.mockRejectedValue(new Error("boom"));
      recordOf.mockRejectedValue(new Error("rpc down"));

      const { result } = renderHook(() => useResultsRun({ eventId: 3, rows: rows(2) }));
      await act(async () => {
        await result.current.start();
      });

      expect(result.current.recorded).toBe(0);
      expect(result.current.error).toBeTruthy();
    });

    it("does nothing at all with no rows", async () => {
      const { result } = renderHook(() => useResultsRun({ eventId: 3, rows: [] }));

      await act(async () => {
        await result.current.start();
      });

      expect(write).not.toHaveBeenCalled();
      expect(result.current.isComplete).toBe(false);
    });
  });
});
