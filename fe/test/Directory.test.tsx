import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SterunCategory, SterunEvent } from "@sterunxyz/sdk";

import { AREA_STORAGE_KEY, type Area } from "@/lib/area";
import type { EventMetadata } from "@/lib/metadata";
import { Directory } from "@/modules/directory/Directory";

import { category, daysFromNow, metadata, summary } from "./fixtures/directory";

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
const PENANG = { name: "Penang Bridge", city: "George Town", province: "Penang", country: "Malaysia", countryCode: "MY" };
const YOGYAKARTA_AREA: Area = { countryCode: "ID", country: "Indonesia", province: "DI Yogyakarta" };

/** The place a visitor chose on an earlier visit, as the picker stores it. */
function saveArea(area: Area) {
  window.localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify(area));
}

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

/** The race names a region shows, in the order it shows them. Every card titles itself with an h3. */
function listed(region: HTMLElement) {
  return within(region)
    .getAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent);
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

    it("keeps every race listed under All races and puts the chosen place first", async () => {
      saveArea(YOGYAKARTA_AREA);
      listEvents.mockResolvedValue({
        events: [
          withDocument(0, { name: "Monas Night Run", startsAt: daysFromNow(10) }),
          withDocument(1, { name: "Elektro Dash", startsAt: daysFromNow(30) }),
        ],
        unreadable: [],
      });
      serve({ 0: metadata({ location: JAKARTA }), 1: metadata() });

      renderDirectory();

      const list = await screen.findByRole("region", { name: "All races" });
      await waitFor(() =>
        expect(listed(list)).toEqual(["Elektro Dash", "Monas Night Run"]),
      );
      expect(screen.getByRole("button", { name: "DI Yogyakarta, Indonesia" })).toBeInTheDocument();
    });

    it("settles the order as documents arrive, without hiding a race meanwhile", async () => {
      saveArea(YOGYAKARTA_AREA);
      const inPlace = deferred();
      listEvents.mockResolvedValue({
        events: [
          withDocument(0, { name: "Monas Night Run", startsAt: daysFromNow(10) }),
          withDocument(1, { name: "Elektro Dash", startsAt: daysFromNow(30) }),
        ],
        unreadable: [],
      });
      fetchEventMetadata.mockImplementation((uri: string) =>
        uri.endsWith("/1.json")
          ? inPlace.promise
          : Promise.resolve({ status: "verified", document: metadata({ location: JAKARTA }) }),
      );

      renderDirectory();

      // Date order until the in-place document proves where its race is, with
      // both races listed the whole time.
      const list = await screen.findByRole("region", { name: "All races" });
      await waitFor(() => expect(listed(list)).toEqual(["Monas Night Run", "Elektro Dash"]));

      await inPlace.settle({ status: "verified", document: metadata() });

      await waitFor(() => expect(listed(list)).toEqual(["Elektro Dash", "Monas Night Run"]));
    });

    it("leads the featured row with a race in the chosen place, without dropping the others", async () => {
      saveArea(YOGYAKARTA_AREA);
      listEvents.mockResolvedValue({
        events: [
          withDocument(0, { name: "Monas Night Run", startsAt: daysFromNow(10) }),
          withDocument(1, { name: "Elektro Dash", startsAt: daysFromNow(30) }),
        ],
        unreadable: [],
      });
      serve({ 0: metadata({ location: JAKARTA }), 1: metadata() });

      renderDirectory();

      const featured = await screen.findByRole("region", { name: "Featured races" });
      expect(listed(featured)).toEqual(["Elektro Dash", "Monas Night Run"]);
    });

    it("leads with every province of a chosen country, then the rest of the world", async () => {
      // A document that names only its country belongs to that country too, and
      // organisers type the code, so a lower-case "id" is still Indonesia.
      saveArea({ countryCode: "ID", country: "Indonesia" });
      listEvents.mockResolvedValue({
        events: [
          withDocument(0, { name: "Penang Bridge Run", startsAt: daysFromNow(5) }),
          withDocument(1, { name: "Elektro Dash", startsAt: daysFromNow(10) }),
          withDocument(2, { name: "Monas Night Run", startsAt: daysFromNow(20) }),
          withDocument(3, { name: "Kota Tua Fun Run", startsAt: daysFromNow(30) }),
        ],
        unreadable: [],
      });
      serve({
        0: metadata({ location: PENANG }),
        1: metadata(),
        2: metadata({ location: JAKARTA }),
        3: metadata({ location: { name: "Kota Tua", country: "Indonesia", countryCode: "id" } }),
      });

      renderDirectory();

      const list = await screen.findByRole("region", { name: "All races" });
      await waitFor(() =>
        expect(listed(list)).toEqual([
          "Elektro Dash",
          "Monas Night Run",
          "Kota Tua Fun Run",
          "Penang Bridge Run",
        ]),
      );
    });

    it("searches every race, in the chosen place or not", async () => {
      saveArea(YOGYAKARTA_AREA);
      listEvents.mockResolvedValue({
        events: [withDocument(0, { name: "Monas Night Run" }), withDocument(1, { name: "Sleman Night Run" })],
        unreadable: [],
      });
      serve({ 0: metadata({ location: JAKARTA }), 1: metadata() });
      renderDirectory();
      await screen.findByRole("region", { name: "All races" });

      await userEvent.type(searchbox(), "night run");

      const results = await screen.findByRole("region", { name: "2 races match" });
      await waitFor(() => expect(listed(results)).toEqual(["Sleman Night Run", "Monas Night Run"]));

      await userEvent.click(screen.getByRole("button", { name: "Filters" }));
      expect(await screen.findByRole("button", { name: "Show 2 races" })).toBeInTheDocument();
    });

    it("hides full and closed races with the drawer's availability filter", async () => {
      listEvents.mockResolvedValue({
        events: [
          summary(0, { name: "Open Road Race" }, [category(0)]),
          summary(1, { name: "Sold Out Sprint" }, [category(0, { quota: 100, enteredCount: 100 })]),
          summary(2, { name: "Closed Trail Run", status: "Closed" }, [category(0)]),
        ],
        unreadable: [],
      });
      renderDirectory();
      await screen.findByText("Open Road Race");

      await userEvent.click(screen.getByRole("button", { name: "Filters" }));
      await userEvent.click(await screen.findByRole("checkbox", { name: "Hide full and closed races" }));
      await userEvent.click(screen.getByRole("button", { name: "Show 1 race" }));

      const results = await screen.findByRole("region", { name: "1 race matches" });
      expect(within(results).getByText("Open Road Race")).toBeInTheDocument();
      expect(screen.queryByText("Sold Out Sprint")).not.toBeInTheDocument();
      expect(screen.queryByText("Closed Trail Run")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove Hide full and closed races" })).toBeInTheDocument();
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

      expect(screen.queryByText(/no races yet/i)).not.toBeInTheDocument();
      await pending.settle({ events: [], unreadable: [] });
    });

    it("says there are no races when there really are none", async () => {
      listEvents.mockResolvedValue({ events: [], unreadable: [] });

      renderDirectory();

      expect(await screen.findByText("No races yet")).toBeInTheDocument();
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

    it("says no race matches, not that the chosen place is empty", async () => {
      // A place sorts the list, it never empties it, so the only thing that can
      // leave a visitor with nothing is what they typed. Saying anything about
      // the place here would send them to change the wrong control.
      saveArea(YOGYAKARTA_AREA);
      listEvents.mockResolvedValue({ events: [withDocument(0)], unreadable: [] });
      serve({ 0: metadata() });
      renderDirectory();
      await screen.findByText("Jakarta Marathon 0");

      await userEvent.type(searchbox(), "nowhere");

      expect(await screen.findByText("No races match")).toBeInTheDocument();
      expect(screen.queryByText(/No races in/)).not.toBeInTheDocument();
    });

    it("moves focus to the list heading after the search is cleared", async () => {
      // The button that was pressed disappears with the empty state. Without
      // this, focus falls back to <body> and a keyboard visitor is returned to
      // the top of the document with no sign the races came back.
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });
      renderDirectory();
      await screen.findByText("Jakarta Marathon 0");
      await userEvent.type(searchbox(), "nowhere");
      await screen.findByText("No races match");

      await userEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));

      expect(await screen.findByRole("heading", { level: 2, name: "All races" })).toHaveFocus();
    });

    it("still shows every other race when the chosen place has none of its own", async () => {
      saveArea({ countryCode: "ID", country: "Indonesia", province: "Bali" });
      listEvents.mockResolvedValue({ events: [withDocument(0)], unreadable: [] });
      serve({ 0: metadata() });

      renderDirectory();

      const all = await screen.findByRole("region", { name: "All races" });
      expect(within(all).getByText("Jakarta Marathon 0")).toBeInTheDocument();
      expect(screen.queryByText(/No races in/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "See all locations" })).not.toBeInTheDocument();
      expect(window.localStorage.getItem(AREA_STORAGE_KEY)).not.toBeNull();
    });

    it("lists races while their documents load, place chosen or not", async () => {
      // Nothing is hidden by a place any more, so there is nothing to wait for:
      // the order settles as documents arrive, the list does not grow.
      saveArea(YOGYAKARTA_AREA);
      const document = deferred();
      listEvents.mockResolvedValue({ events: [withDocument(0, { name: "Elektro Dash" })], unreadable: [] });
      fetchEventMetadata.mockReturnValue(document.promise);
      renderDirectory();

      const all = await screen.findByRole("region", { name: "All races" });
      expect(within(all).getByText("Elektro Dash")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      await document.settle({ status: "verified", document: metadata() });
    });

    it("mentions races the directory counted but could not load", async () => {
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [3, 4] });

      renderDirectory();

      expect(await screen.findByText(/some races could not be loaded/i)).toBeInTheDocument();
    });

    it("says nothing about unloadable races when there are none", async () => {
      listEvents.mockResolvedValue({ events: [summary(0)], unreadable: [] });

      renderDirectory();

      await screen.findByText("Jakarta Marathon 0");
      expect(screen.queryByText(/could not be loaded/i)).not.toBeInTheDocument();
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
      expect(screen.queryByText("No races yet")).not.toBeInTheDocument();

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
