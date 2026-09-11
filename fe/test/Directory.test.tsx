import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Directory } from "@/modules/directory/Directory";
import type { EventSummary } from "@/lib/events";
import type { SterunCategory, SterunEvent, EventStatus } from "@sterunxyz/sdk";

const listEvents = vi.hoisted(() => vi.fn());

vi.mock("@/lib/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events")>()),
  listEvents,
}));

const NOW_S = 1_790_548_200n;

function summary(
  eventId: number,
  overrides: Partial<SterunEvent> = {},
  categories: SterunCategory[] = [],
): EventSummary {
  return {
    event: {
      eventId,
      organiser: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
      name: `Jakarta Marathon ${eventId}`,
      metadataHash: "a".repeat(64),
      uri: "",
      startsAt: NOW_S,
      status: "Open" as EventStatus,
      ...overrides,
    },
    categories,
  };
}

function category(categoryId: number, overrides: Partial<SterunCategory> = {}): SterunCategory {
  const quota = overrides.quota ?? 300;
  const enteredCount = overrides.enteredCount ?? 180;
  return {
    eventId: 0,
    categoryId,
    code: "10K",
    distanceM: 10_000,
    quota,
    enteredCount,
    priceStroops: 250_000_000n,
    slotsLeft: quota - enteredCount,
    ...overrides,
  };
}

function renderDirectory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<Directory />, { wrapper: Wrapper });
}

/**
 * A read the test finishes on purpose.
 *
 * A promise that never settles leaves React Query mid-flight when the test
 * ends, and cleanup then waits ten seconds for it. Resolving it before the test
 * returns keeps the pending assertion honest without the hang.
 */
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return {
    promise,
    settle: async (value: unknown) => {
      resolve(value);
      await act(async () => {
        await promise;
      });
    },
  };
}

beforeEach(() => listEvents.mockReset());

describe("Directory", () => {
  describe("positive", () => {
    it("lists a card per event, with its name", async () => {
      listEvents.mockResolvedValue({ events: [summary(0), summary(1)], unreadable: [] });

      renderDirectory();

      expect(await screen.findByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(screen.getByText("Jakarta Marathon 1")).toBeInTheDocument();
    });

    it("links each card to that event's page", async () => {
      listEvents.mockResolvedValue({ events: [summary(4)], unreadable: [] });

      renderDirectory();

      const link = await screen.findByRole("link", { name: /Jakarta Marathon 4/ });
      expect(link).toHaveAttribute("href", "/events/4");
    });

    it("shows the starting price on the card", async () => {
      listEvents.mockResolvedValue({
        events: [summary(0, {}, [category(0), category(1, { code: "5K" })])],
        unreadable: [],
      });

      renderDirectory();

      expect(await screen.findByText("From sUSD 25")).toBeInTheDocument();
    });

    it("counts the entries left across an event's categories", async () => {
      listEvents.mockResolvedValue({
        events: [summary(0, {}, [category(0), category(1, { quota: 50, enteredCount: 20 })])],
        unreadable: [],
      });

      renderDirectory();

      expect(await screen.findByText("150 entries left")).toBeInTheDocument();
    });

    it("says one entry, not one entries", async () => {
      // Seen on the live testnet directory: the rehearsal event has exactly one
      // slot left, and the card read "1 places left".
      listEvents.mockResolvedValue({
        events: [summary(0, {}, [category(0, { quota: 5, enteredCount: 4 })])],
        unreadable: [],
      });

      renderDirectory();

      expect(await screen.findByText("1 entry left")).toBeInTheDocument();
    });

    it("shows the status of every event", async () => {
      listEvents.mockResolvedValue({
        events: [summary(0, { status: "Open" }), summary(1, { status: "Completed" })],
        unreadable: [],
      });

      renderDirectory();

      expect(await screen.findByText("Open")).toBeInTheDocument();
      expect(screen.getByText("Completed")).toBeInTheDocument();
    });

    it("re-reads the chain when asked to refresh", async () => {
      // This is the ticket's own acceptance scenario: create an event on
      // testnet, refresh, see it here without redeploying anything.
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });
      renderDirectory();
      await screen.findByText("Jakarta Marathon 0");

      listEvents.mockResolvedValue({
        events: [summary(0), summary(1, { name: "Brand New Race" })],
        unreadable: [],
      });
      await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

      expect(await screen.findByText("Brand New Race")).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("shows a loading state before the first read comes back", async () => {
      const pending = deferred();
      listEvents.mockReturnValue(pending.promise);

      renderDirectory();

      expect(screen.getByRole("status")).toBeInTheDocument();
      await pending.settle({ events: [], unreadable: [] });
    });

    it("does not claim the directory is empty while it is still loading", async () => {
      const pending = deferred();
      listEvents.mockReturnValue(pending.promise);

      renderDirectory();

      expect(screen.queryByText(/no events/i)).not.toBeInTheDocument();
      await pending.settle({ events: [], unreadable: [] });
    });

    it("says the registry is empty when it really is", async () => {
      listEvents.mockResolvedValue({ events: [], unreadable: [] });

      renderDirectory();

      expect(await screen.findByText("No events yet")).toBeInTheDocument();
    });

    it("shows an event that has no categories yet", async () => {
      listEvents.mockResolvedValue({ events: [summary(0, {}, [])], unreadable: [] });

      renderDirectory();

      expect(await screen.findByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(screen.getByText("No distances yet")).toBeInTheDocument();
    });

    it("mentions events the registry counted but would not return", async () => {
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [3, 4] });

      renderDirectory();

      expect(await screen.findByText(/2 events could not be read/i)).toBeInTheDocument();
    });

    it("says nothing about unreadable events when there are none", async () => {
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });

      renderDirectory();

      await screen.findByText("Jakarta Marathon 0");
      expect(screen.queryByText(/could not be read/i)).not.toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("reports a failed read as an error and offers a way out, never an empty directory", async () => {
      // Drawing "no events yet" over a dead RPC would tell every visitor the
      // protocol is unused. It is the one thing this page must not get wrong.
      //
      // The recovery half is asserted in the same test on purpose: a rejected
      // query that is still the last thing a test did surfaces as an unhandled
      // rejection under this vitest setup, and splitting the assertions buys
      // nothing when both describe one path.
      listEvents.mockRejectedValue(new Error("rpc unreachable"));
      renderDirectory();

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.queryByText("No events yet")).not.toBeInTheDocument();

      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });
      await userEvent.click(screen.getByRole("button", { name: /try again/i }));

      expect(await screen.findByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
