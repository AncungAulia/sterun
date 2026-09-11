import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SterunCategory, SterunEvent } from "@sterunxyz/sdk";

import { AREA_STORAGE_KEY } from "@/lib/area";
import type { EventMetadata } from "@/lib/metadata";
import { Directory } from "@/modules/directory/Directory";

import { category, metadata, summary } from "./fixtures/directory";

const listEvents = vi.hoisted(() => vi.fn());
const fetchEventMetadata = vi.hoisted(() => vi.fn());

vi.mock("@/lib/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events")>()),
  listEvents,
}));
vi.mock("@/lib/metadata", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/metadata")>()),
  fetchEventMetadata,
}));

const HASH = "ab".repeat(32);
const UNAVAILABLE = { status: "unavailable", reason: "Not served in this test." };
const JAKARTA = { name: "Monas", city: "Jakarta Pusat", province: "DKI Jakarta", country: "Indonesia", countryCode: "ID" };

/** An event with a document at a uri the mock below can answer for. */
function withDocument(
  eventId: number,
  overrides: Partial<SterunEvent> = {},
  categories: SterunCategory[] = [category(0)],
) {
  return summary(eventId, { uri: `https://files.test/${eventId}.json`, metadataHash: HASH, ...overrides }, categories);
}

function serve(documents: Record<number, EventMetadata | "modified">) {
  fetchEventMetadata.mockImplementation(async (uri: string) => {
    const match = /\/(\d+)\.json$/.exec(uri);
    const document = match ? documents[Number(match[1])] : undefined;
    if (document === undefined) return UNAVAILABLE;
    if (document === "modified") return { status: "modified", expectedHash: HASH, actualHash: "cd".repeat(32) };
    return { status: "verified", document };
  });
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
 * ends, and cleanup then waits ten seconds for it.
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

function searchbox() {
  return screen.getByRole("searchbox", { name: "Search races" });
}

beforeEach(() => {
  listEvents.mockReset();
  fetchEventMetadata.mockReset();
  fetchEventMetadata.mockResolvedValue(UNAVAILABLE);
  window.localStorage.clear();
});

describe("Directory", () => {
  describe("positive", () => {
    it("lists a card per event under All races", async () => {
      listEvents.mockResolvedValue({ events: [summary(0), summary(1)], unreadable: [] });

      renderDirectory();

      const all = await screen.findByRole("region", { name: "All races" });
      expect(within(all).getByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(within(all).getByText("Jakarta Marathon 1")).toBeInTheDocument();
    });

    it("links each card to that event's page", async () => {
      listEvents.mockResolvedValue({ events: [summary(4)], unreadable: [] });

      renderDirectory();

      const link = await screen.findByRole("link", { name: /Jakarta Marathon 4/ });
      expect(link).toHaveAttribute("href", "/events/4");
    });

    it("counts entries left across distances and shows the starting price", async () => {
      listEvents.mockResolvedValue({
        events: [summary(0, {}, [category(0), category(1, { quota: 50, enteredCount: 20 })])],
        unreadable: [],
      });

      renderDirectory();

      expect(await screen.findByText("150 entries left")).toBeInTheDocument();
      expect(screen.getByText("From sUSD 25")).toBeInTheDocument();
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
      // STE-13's acceptance scenario: create an event on testnet, refresh, see
      // it here without redeploying anything.
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });
      renderDirectory();
      await screen.findByText("Jakarta Marathon 0");

      listEvents.mockResolvedValue({ events: [summary(0), summary(1, { name: "Brand New Race" })], unreadable: [] });
      await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

      expect(await screen.findByText("Brand New Race")).toBeInTheDocument();
    });

    it("features an open, upcoming race that has a poster", async () => {
      listEvents.mockResolvedValue({ events: [withDocument(0), summary(1)], unreadable: [] });
      serve({ 0: metadata() });

      renderDirectory();

      const featured = await screen.findByRole("region", { name: "Featured races" });
      expect(within(featured).getByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(within(featured).queryByText("Jakarta Marathon 1")).not.toBeInTheDocument();
    });

    it("shows the venue from a verified document", async () => {
      listEvents.mockResolvedValue({ events: [withDocument(0)], unreadable: [] });
      serve({ 0: metadata() });

      renderDirectory();

      const all = await screen.findByRole("region", { name: "All races" });
      expect(await within(all).findByText("FT UGM, Sleman")).toBeInTheDocument();
    });

    it("narrows the list by search and hides the featured row", async () => {
      listEvents.mockResolvedValue({
        events: [withDocument(0, { name: "Elektro Dash" }), withDocument(1, { name: "Monas Night Run" })],
        unreadable: [],
      });
      serve({ 0: metadata(), 1: metadata({ location: JAKARTA }) });
      renderDirectory();
      await screen.findByRole("region", { name: "Featured races" });

      await userEvent.type(searchbox(), "jakarta");

      const results = await screen.findByRole("region", { name: "1 race matches" });
      expect(within(results).getByText("Monas Night Run")).toBeInTheDocument();
      expect(screen.queryByText("Elektro Dash")).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Featured races" })).not.toBeInTheDocument();
    });

    it("gives races in the chosen area a row of their own", async () => {
      window.localStorage.setItem(
        AREA_STORAGE_KEY,
        JSON.stringify({ countryCode: "ID", country: "Indonesia", province: "DI Yogyakarta" }),
      );
      listEvents.mockResolvedValue({
        events: [withDocument(0, { name: "Elektro Dash" }), withDocument(1, { name: "Monas Night Run" })],
        unreadable: [],
      });
      serve({ 0: metadata(), 1: metadata({ location: JAKARTA }) });

      renderDirectory();

      const nearby = await screen.findByRole("region", { name: "Races in your area" });
      expect(within(nearby).getByText("Elektro Dash")).toBeInTheDocument();
      expect(within(nearby).queryByText("Monas Night Run")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "DI Yogyakarta, Indonesia" })).toBeInTheDocument();
    });

    it("applies a filter from the drawer and lists it as a removable chip", async () => {
      listEvents.mockResolvedValue({
        events: [
          summary(0, { name: "Free Fun Run" }, [category(0, { priceStroops: 0n })]),
          summary(1, { name: "Paid Road Race" }, [category(0)]),
        ],
        unreadable: [],
      });
      renderDirectory();
      await screen.findByText("Free Fun Run");

      await userEvent.click(screen.getByRole("button", { name: "Filters" }));
      await userEvent.click(await screen.findByRole("checkbox", { name: "Free" }));
      await userEvent.click(screen.getByRole("button", { name: "Show 1 race" }));

      expect(await screen.findByRole("region", { name: "1 race matches" })).toBeInTheDocument();
      expect(screen.queryByText("Paid Road Race")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Remove Free" }));

      expect(await screen.findByText("Paid Road Race")).toBeInTheDocument();
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

    it("shows an event that has no distances yet", async () => {
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });

      renderDirectory();

      expect(await screen.findByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(screen.getByText("No distances yet")).toBeInTheDocument();
    });

    it("draws No image for a race whose document could not be read", async () => {
      listEvents.mockResolvedValue({ events: [withDocument(0)], unreadable: [] });

      renderDirectory();

      expect(await screen.findByText("No image")).toBeInTheDocument();
    });

    it("says so when nothing matches, and offers a way back", async () => {
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });
      renderDirectory();
      await screen.findByText("Jakarta Marathon 0");

      await userEvent.type(searchbox(), "nowhere");

      expect(await screen.findByText("No races match")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
      expect(await screen.findByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(searchbox()).toHaveValue("");
    });

    it("says there are no races in the chosen area yet", async () => {
      window.localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify({ countryCode: "ID", country: "Indonesia", province: "Bali" }));
      listEvents.mockResolvedValue({ events: [withDocument(0)], unreadable: [] });
      serve({ 0: metadata() });

      renderDirectory();

      expect(await screen.findByText("No races in Bali yet.")).toBeInTheDocument();
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
      // protocol is unused. The recovery half is asserted in the same test: a
      // rejected query that is the last thing a test did surfaces as an
      // unhandled rejection under this vitest setup.
      listEvents.mockRejectedValue(new Error("rpc unreachable"));
      renderDirectory();

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.queryByText("No events yet")).not.toBeInTheDocument();

      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });
      await userEvent.click(screen.getByRole("button", { name: /try again/i }));

      expect(await screen.findByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("never features a race whose document fails its hash check", async () => {
      listEvents.mockResolvedValue({ events: [withDocument(0)], unreadable: [] });
      serve({ 0: "modified" });

      renderDirectory();

      expect(await screen.findByText("No image")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Featured races" })).not.toBeInTheDocument();
    });
  });
});
