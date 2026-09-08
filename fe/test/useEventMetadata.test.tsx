import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEventMetadata } from "@/hooks/useEventMetadata";

const fetchEventMetadata = vi.hoisted(() => vi.fn());

vi.mock("@/lib/metadata", () => ({ fetchEventMetadata }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => fetchEventMetadata.mockReset());

describe("useEventMetadata", () => {
  describe("positive", () => {
    it("returns the verified document", async () => {
      fetchEventMetadata.mockResolvedValue({ status: "verified", document: { description: "hi" } });

      const { result } = renderHook(() => useEventMetadata("https://e.test/e.json", "ab".repeat(32)), {
        wrapper: wrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.status).toBe("verified");
    });
  });

  describe("edge", () => {
    it("does not fetch when the event has no document", () => {
      const { result } = renderHook(() => useEventMetadata("", "ab".repeat(32)), {
        wrapper: wrapper(),
      });

      expect(fetchEventMetadata).not.toHaveBeenCalled();
      expect(result.current.fetchStatus).toBe("idle");
    });

    it("caches per uri and hash, so a re-created event refetches", async () => {
      // Same url, new document: events are frozen, so a changed hash means a
      // different event, and it must not read the previous one from cache.
      fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });
      const Wrapper = wrapper();

      const first = renderHook(() => useEventMetadata("https://e.test/e.json", "aa".repeat(32)), {
        wrapper: Wrapper,
      });
      await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

      const second = renderHook(() => useEventMetadata("https://e.test/e.json", "bb".repeat(32)), {
        wrapper: Wrapper,
      });
      await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

      expect(fetchEventMetadata).toHaveBeenCalledTimes(2);
    });
  });
});
