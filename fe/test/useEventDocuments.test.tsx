import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEventDocuments } from "@/hooks/useEventDocuments";
import { useEventMetadata } from "@/hooks/useEventMetadata";

import { metadata, summary } from "./fixtures/directory";

const fetchEventMetadata = vi.hoisted(() => vi.fn());

vi.mock("@/lib/metadata", () => ({ fetchEventMetadata }));

const HASH = "ab".repeat(32);

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function served(eventId: number) {
  return summary(eventId, { uri: `https://files.test/${eventId}.json`, metadataHash: HASH });
}

beforeEach(() => fetchEventMetadata.mockReset());

describe("useEventDocuments", () => {
  describe("positive", () => {
    it("keys each verified document by its event", async () => {
      fetchEventMetadata.mockImplementation(async (uri: string) => ({
        status: "verified",
        document: metadata({ description: uri }),
      }));
      const events = [served(0), served(1)];

      const { result } = renderHook(() => useEventDocuments(events), { wrapper: wrapper() });

      await waitFor(() => expect(result.current.settled).toBe(true));
      expect(result.current.byEvent.get(0)?.description).toBe("https://files.test/0.json");
      expect(result.current.byEvent.get(1)?.description).toBe("https://files.test/1.json");
    });

    it("shares the cache with the event page, so a document is fetched once", async () => {
      fetchEventMetadata.mockResolvedValue({ status: "verified", document: metadata() });
      const Wrapper = wrapper();
      const events = [served(0)];

      const list = renderHook(() => useEventDocuments(events), { wrapper: Wrapper });
      await waitFor(() => expect(list.result.current.settled).toBe(true));
      const page = renderHook(() => useEventMetadata("https://files.test/0.json", HASH), {
        wrapper: Wrapper,
      });
      await waitFor(() => expect(page.result.current.isSuccess).toBe(true));

      expect(fetchEventMetadata).toHaveBeenCalledTimes(1);
    });
  });

  describe("edge", () => {
    it("does not wait for an event that has no document", () => {
      const events = [summary(0)];

      const { result } = renderHook(() => useEventDocuments(events), { wrapper: wrapper() });

      expect(result.current.settled).toBe(true);
      expect(result.current.byEvent.get(0)).toBeNull();
      expect(fetchEventMetadata).not.toHaveBeenCalled();
    });

    it("is not settled while a document is still on its way", async () => {
      let resolve!: (value: unknown) => void;
      fetchEventMetadata.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      const events = [served(0)];

      const { result } = renderHook(() => useEventDocuments(events), { wrapper: wrapper() });

      expect(result.current.settled).toBe(false);
      expect(result.current.pending.has(0)).toBe(true);
      await act(async () => {
        resolve({ status: "verified", document: metadata() });
      });
      await waitFor(() => expect(result.current.settled).toBe(true));
      expect(result.current.pending.size).toBe(0);
    });

    it("answers for an empty list", () => {
      const { result } = renderHook(() => useEventDocuments([]), { wrapper: wrapper() });

      expect(result.current.settled).toBe(true);
      expect(result.current.byEvent.size).toBe(0);
    });
  });

  describe("negative", () => {
    it("leaves out a document that fails its hash check", async () => {
      fetchEventMetadata.mockResolvedValue({
        status: "modified",
        expectedHash: HASH,
        actualHash: "cd".repeat(32),
      });
      const events = [served(0)];

      const { result } = renderHook(() => useEventDocuments(events), { wrapper: wrapper() });

      await waitFor(() => expect(result.current.settled).toBe(true));
      expect(result.current.byEvent.get(0)).toBeNull();
    });

    it("leaves out a document that could not be read", async () => {
      fetchEventMetadata.mockResolvedValue({ status: "unavailable", reason: "down" });
      const events = [served(0)];

      const { result } = renderHook(() => useEventDocuments(events), { wrapper: wrapper() });

      await waitFor(() => expect(result.current.settled).toBe(true));
      expect(result.current.byEvent.get(0)).toBeNull();
    });
  });
});
