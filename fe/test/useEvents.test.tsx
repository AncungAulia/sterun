import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEvent, useEvents } from "@/hooks/useEvents";
import type { EventSummary } from "@/lib/events";
import type { SterunEvent } from "@sterunxyz/sdk";

const listEvents = vi.hoisted(() => vi.fn());
const getEventSummary = vi.hoisted(() => vi.fn());

vi.mock("@/lib/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events")>()),
  listEvents,
  getEventSummary,
}));

function summary(eventId: number): EventSummary {
  const event: SterunEvent = {
    eventId,
    organiser: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
    name: `Race ${eventId}`,
    metadataHash: "a".repeat(64),
    uri: "https://sterun.xyz/events/0.json",
    startsAt: 1_790_000_000n,
    status: "Open",
  };
  return { event, categories: [] };
}

function wrapper() {
  // retry off: a test asserting the error state should not wait out three
  // backoffs first.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  listEvents.mockReset();
  getEventSummary.mockReset();
});

describe("useEvents", () => {
  describe("positive", () => {
    it("hands back the directory the chain returned", async () => {
      listEvents.mockResolvedValue({ events: [summary(0), summary(1)], unreadable: [] });

      const { result } = renderHook(() => useEvents(), { wrapper: wrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.events).toHaveLength(2);
    });

    it("starts in a loading state rather than an empty one", async () => {
      // An empty first paint would flash "no events yet" at every visitor
      // before the first RPC round trip comes back.
      listEvents.mockResolvedValue({ events: [], unreadable: [] });

      const { result } = renderHook(() => useEvents(), { wrapper: wrapper() });

      expect(result.current.isPending).toBe(true);
      expect(result.current.data).toBeUndefined();
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe("negative", () => {
    it("surfaces a failed read as an error, not as an empty directory", async () => {
      listEvents.mockRejectedValue(new Error("rpc unreachable"));

      const { result } = renderHook(() => useEvents(), { wrapper: wrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.data).toBeUndefined();
    });
  });
});

describe("useEvent", () => {
  describe("positive", () => {
    it("reads the one event it was asked for", async () => {
      getEventSummary.mockResolvedValue(summary(3));

      const { result } = renderHook(() => useEvent(3), { wrapper: wrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.event.eventId).toBe(3);
      expect(getEventSummary).toHaveBeenCalledWith(expect.anything(), 3);
    });
  });

  describe("edge", () => {
    it("does not call the chain for an id that is not a number", async () => {
      // The id comes out of the URL, where anything can be typed.
      const { result } = renderHook(() => useEvent(Number.NaN), { wrapper: wrapper() });

      expect(getEventSummary).not.toHaveBeenCalled();
      expect(result.current.fetchStatus).toBe("idle");
    });
  });

  describe("negative", () => {
    it("surfaces an unknown event as an error", async () => {
      getEventSummary.mockRejectedValue(new Error("EventNotFound"));

      const { result } = renderHook(() => useEvent(99), { wrapper: wrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
