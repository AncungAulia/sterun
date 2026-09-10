import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EventDetail } from "@/modules/event-detail/EventDetail";
import type { EventSummary } from "@/lib/events";
import type { MetadataResult } from "@/lib/metadata";
import type { EventStatus, SterunAddOn, SterunCategory, SterunEvent } from "@sterun/sdk";

const getEventSummary = vi.hoisted(() => vi.fn());
const fetchEventMetadata = vi.hoisted(() => vi.fn());
/*
 * The add-ons are a chain read of their own now. Mocked rather than left to
 * run: `readClient` here is the real one, and typescript.yml is built so that
 * a public node being slow cannot turn CI red.
 */
const listAddOns = vi.hoisted(() => vi.fn(async (): Promise<SterunAddOn[]> => []));

vi.mock("@/lib/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events")>()),
  getEventSummary,
}));
vi.mock("@/lib/sterun", () => ({ readClient: { listAddOns } }));
vi.mock("@/lib/metadata", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/metadata")>()),
  fetchEventMetadata,
}));

const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
/** 2026-09-28T05:30+07:00 */
const GUN_START = 1_790_548_200n;

function summary(
  overrides: Partial<SterunEvent> = {},
  categories: SterunCategory[] = [],
): EventSummary {
  return {
    event: {
      eventId: 2,
      organiser: ORGANISER,
      name: "Borobudur Marathon",
      metadataHash: "a".repeat(64),
      uri: "https://sterun.xyz/events/2.json",
      startsAt: GUN_START,
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
    eventId: 2,
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

const UNAVAILABLE: MetadataResult = { status: "unavailable", reason: "not reachable" };

function renderDetail(eventId = 2) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<EventDetail eventId={eventId} />, { wrapper: Wrapper });
}

beforeEach(() => {
  getEventSummary.mockReset();
  fetchEventMetadata.mockReset();
  fetchEventMetadata.mockResolvedValue(UNAVAILABLE);
  listAddOns.mockResolvedValue([]);
});

/**
 * Move to a tab and wait for it.
 *
 * The page is tabbed now, so most of what used to be on screen at once is a
 * click away. Which tab a fact lives on is part of what these tests check.
 */
async function showTab(name: RegExp) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("tab", { name }));
}

describe("EventDetail", () => {
  describe("positive", () => {
    it("names the race and when it starts", async () => {
      getEventSummary.mockResolvedValue(summary());

      renderDetail();

      expect(await screen.findByText("Borobudur Marathon")).toBeInTheDocument();
      expect(screen.getByText(/Sep 2[78], 2026/)).toBeInTheDocument();
    });

    it("shows the event status", async () => {
      getEventSummary.mockResolvedValue(summary({ status: "Closed" }));

      renderDetail();

      expect(await screen.findByText("Closed")).toBeInTheDocument();
    });

    it("lists every category with its price and what is left of its quota", async () => {
      getEventSummary.mockResolvedValue(
        summary({}, [
          category(0),
          category(1, { code: "5K", priceStroops: 0n, quota: 100, enteredCount: 40 }),
        ]),
      );

      renderDetail();
      await showTab(/distances/i);

      // Scoped to the panel: the entry card carries the cheapest price too, so
      // "Free" is on screen twice and both of them are right.
      const panel = within(screen.getByRole("tabpanel"));
      expect(panel.getByText("sUSD 25")).toBeInTheDocument();
      expect(panel.getByText("Free")).toBeInTheDocument();
      expect(panel.getByText(/120 of 300 entries left/)).toBeInTheDocument();
      expect(panel.getByText(/60 of 100 entries left/)).toBeInTheDocument();
    });

    it("calls an add-on the entry fee already covers Included, not Free", async () => {
      // "Free" next to a jersey reads as a giveaway, or as something still to
      // be claimed. Zero on an add-on means the ticket paid for it.
      getEventSummary.mockResolvedValue(summary({ status: "Open" }, [category(0)]));
      fetchEventMetadata.mockResolvedValue({
        status: "verified",
        document: {
          addOns: [
            { name: "Event jersey", includedIn: ["10K"], code: "EVENT_JERSEY" },
            { name: "Tumbler", includedIn: ["10K"], code: "TUMBLER" },
          ],
        },
      } satisfies MetadataResult);
      const row = { eventId: 2, quota: 50, reservedCount: 0, unitsLeft: 50 };
      listAddOns.mockResolvedValue([
        { ...row, addonId: 0, code: "EVENT_JERSEY", priceStroops: 0n },
        { ...row, addonId: 1, code: "TUMBLER", priceStroops: 300_000_000n },
      ]);

      renderDetail();
      await showTab(/race pack/i);

      const panel = within(screen.getByRole("tabpanel"));
      expect(await panel.findByText("Included")).toBeInTheDocument();
      expect(panel.getByText("sUSD 30")).toBeInTheDocument();
      expect(panel.queryByText("Free")).not.toBeInTheDocument();
    });

    it("offers entry per category while the event is open", async () => {
      getEventSummary.mockResolvedValue(summary({ status: "Open" }, [category(0), category(1)]));

      renderDetail();
      await showTab(/distances/i);

      const links = await screen.findAllByRole("link", { name: /enter/i });
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute("href", "/events/2/enter?category=0");
      expect(links[1]).toHaveAttribute("href", "/events/2/enter?category=1");
    });

    it("says entry is non-refundable above the links that take the money", async () => {
      // STE-38. Not a footer and not a modal: it has to be on the way in, and
      // the way in is the per-distance link, so the notice sits before it.
      getEventSummary.mockResolvedValue(summary({ status: "Open" }, [category(0)]));

      renderDetail();
      await showTab(/distances/i);

      const notice = await screen.findByText(/non-refundable/i);
      const link = screen.getByRole("link", { name: /enter/i });
      expect(notice.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("links the location to a map when the document carries a pin", async () => {
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue({
        status: "verified",
        document: { location: { name: "Gelora Bung Karno", lat: -6.2185, lng: 106.8026 } },
      } satisfies MetadataResult);

      renderDetail();

      const link = await screen.findByRole("link", { name: /open in maps/i });
      expect(link).toHaveAttribute("href", "https://www.google.com/maps?q=-6.2185,106.8026");
    });

    it("shows a location with no pin as plain text", async () => {
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue({
        status: "verified",
        document: { location: { name: "Somewhere" } },
      } satisfies MetadataResult);

      renderDetail();

      expect(await screen.findByText(/somewhere/i)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /open in maps/i })).not.toBeInTheDocument();
    });

    it("links the race's own Instagram, built from the handle", async () => {
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue({
        status: "verified",
        document: { links: { instagram: "jakartarun" } },
      } satisfies MetadataResult);

      renderDetail();

      const link = await screen.findByRole("link", { name: "@jakartarun" });
      expect(link).toHaveAttribute("href", "https://www.instagram.com/jakartarun");
    });

    it("shows no social links when the document carries none", async () => {
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue({
        status: "verified",
        document: { description: "A road race." },
      } satisfies MetadataResult);

      renderDetail();

      await screen.findByText("A road race.");
      expect(screen.queryByRole("link", { name: /race website/i })).not.toBeInTheDocument();
    });

    it("shows the jersey with the price and stock the chain holds", async () => {
      // Two sources joined by a code: the document knows what it looks like,
      // the chain knows what it costs and how many are left. The chain wins,
      // because the stock is what decides whether it can still be sold.
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue({
        status: "verified",
        document: {
          addOns: [
            {
              name: "Event jersey",
              photoUrl: "https://cdn.example.test/jersey.png",
              includedIn: ["10K", "HALF"],
              sizes: [
                { label: "M", chestCm: 52, lengthCm: 70, code: "EVENT_JERSEY_M" },
                { label: "L", chestCm: 54, lengthCm: 72, code: "EVENT_JERSEY_L" },
              ],
            },
          ],
        },
      } satisfies MetadataResult);
      listAddOns.mockResolvedValue([
        {
          eventId: 2,
          addonId: 0,
          code: "EVENT_JERSEY_M",
          priceStroops: 300_000_000n,
          quota: 100,
          reservedCount: 40,
          unitsLeft: 60,
        },
        {
          eventId: 2,
          addonId: 1,
          code: "EVENT_JERSEY_L",
          priceStroops: 300_000_000n,
          quota: 100,
          reservedCount: 100,
          unitsLeft: 0,
        },
      ]);

      renderDetail();
      await showTab(/race pack/i);

      expect(await screen.findByText("Event jersey")).toBeInTheDocument();
      expect(screen.getByText("sUSD 30")).toBeInTheDocument();
    });

    it("says a size is gone, which is the whole reason stock is per size", async () => {
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue({
        status: "verified",
        document: {
          addOns: [
            {
              name: "Event jersey",
              includedIn: ["10K"],
              sizes: [
                { label: "M", code: "EVENT_JERSEY_M" },
                { label: "L", code: "EVENT_JERSEY_L" },
              ],
            },
          ],
        },
      } satisfies MetadataResult);
      listAddOns.mockResolvedValue([
        {
          eventId: 2,
          addonId: 0,
          code: "EVENT_JERSEY_M",
          priceStroops: 0n,
          quota: 100,
          reservedCount: 40,
          unitsLeft: 60,
        },
        {
          eventId: 2,
          addonId: 1,
          code: "EVENT_JERSEY_L",
          priceStroops: 0n,
          quota: 100,
          reservedCount: 100,
          unitsLeft: 0,
        },
      ]);

      renderDetail();
      await showTab(/race pack/i);

      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: /view details/i }));

      expect(await screen.findByRole("row", { name: /L .* sold out/i })).toBeInTheDocument();
      expect(screen.getByRole("row", { name: /M .* 60/ })).toBeInTheDocument();
    });

    it("still describes an item the chain knows nothing about", async () => {
      // An event created before add-ons existed on chain still has a race
      // pack, and the document is the only description of it there is.
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue({
        status: "verified",
        document: { addOns: [{ name: "Finisher medal", includedIn: ["10K"] }] },
      } satisfies MetadataResult);

      renderDetail();
      await showTab(/race pack/i);

      expect(await screen.findByText("Finisher medal")).toBeInTheDocument();
      expect(screen.getByText(/part of the race pack/i)).toBeInTheDocument();
    });

    it("shows nothing about a race pack when the document has no add-ons", async () => {
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue({
        status: "verified",
        document: { description: "A road race." },
      } satisfies MetadataResult);

      renderDetail();
      await showTab(/race pack/i);

      expect(await screen.findByText(/has not published a race pack/i)).toBeInTheDocument();
    });

    it("shows the verified document once it checks out", async () => {
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue({
        status: "verified",
        document: { description: "Two laps of the temple.", gunStart: "2026-09-28T05:30+07:00" },
      } satisfies MetadataResult);

      renderDetail();

      expect(await screen.findByText("Two laps of the temple.")).toBeInTheDocument();

      await showTab(/proofs/i);
      expect(screen.getByText(/hashes to exactly/i)).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("shows a loading state before the event is read", () => {
      getEventSummary.mockReturnValue(new Promise(() => {}));

      renderDetail();

      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("says why entry is not offered when the event is not open", async () => {
      getEventSummary.mockResolvedValue(summary({ status: "Draft" }, [category(0)]));

      renderDetail();

      await screen.findByText("Borobudur Marathon");
      expect(screen.queryByRole("link", { name: /enter/i })).not.toBeInTheDocument();
      expect(screen.getByText(/has not opened this race yet/i)).toBeInTheDocument();
    });

    it("marks a full category as full rather than offering entry", async () => {
      // QuotaFull(5) is enforced in reserve_slot, so entering here would revert.
      // Offering the link anyway would spend a runner's time to be told no.
      getEventSummary.mockResolvedValue(
        summary({ status: "Open" }, [category(0, { quota: 5, enteredCount: 5 })]),
      );

      renderDetail();
      await showTab(/distances/i);

      expect(await screen.findAllByText(/sold out/i)).not.toHaveLength(0);
      expect(screen.queryByRole("link", { name: /enter/i })).not.toBeInTheDocument();
    });

    it("tells a cancelled race apart from a closed one, and offers no way in", async () => {
      // STE-38. `Cancelled` is terminal and rejects entry on chain, so a
      // button here would spend a wallet prompt to be told EventNotOpen. The
      // pair a runner must never confuse is this one: Closed still has a race
      // at the end of it.
      getEventSummary.mockResolvedValue(summary({ status: "Cancelled" }, [category(0)]));

      renderDetail();

      expect(await screen.findByText(/this race has been cancelled/i)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /enter/i })).not.toBeInTheDocument();
      expect(screen.getByText("Cancelled")).toHaveAttribute("data-status", "Cancelled");
    });

    it("says nothing about refunds where there is no way in", async () => {
      // The notice belongs to the act of paying. On a race nobody can enter it
      // is noise, and noise is how a warning stops being read.
      getEventSummary.mockResolvedValue(summary({ status: "Cancelled" }, [category(0)]));

      renderDetail();
      await showTab(/distances/i);

      await screen.findByText(/entries left/i);
      expect(screen.queryByText(/non-refundable/i)).not.toBeInTheDocument();
    });

    it("says nothing about refunds when every distance is full", async () => {
      getEventSummary.mockResolvedValue(
        summary({ status: "Open" }, [category(0, { quota: 5, enteredCount: 5 })]),
      );

      renderDetail();
      await showTab(/distances/i);

      await screen.findAllByText(/sold out/i);
      expect(screen.queryByText(/non-refundable/i)).not.toBeInTheDocument();
    });

    it("says an event has no categories rather than showing an empty list", async () => {
      getEventSummary.mockResolvedValue(summary({}, []));

      renderDetail();
      await showTab(/distances/i);

      expect(await screen.findByText(/no distances yet/i)).toBeInTheDocument();
    });

    it("still shows the race when its document cannot be reached", async () => {
      // Every event on testnet today points at a host that serves nothing, so
      // this is the common path rather than the exotic one.
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue(UNAVAILABLE);

      renderDetail();

      expect(await screen.findByText("Borobudur Marathon")).toBeInTheDocument();

      await showTab(/proofs/i);
      expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
    });

    it("warns when the document disagrees with the chain about the start time", async () => {
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue({
        status: "verified",
        document: { gunStart: "2026-09-28T09:00+07:00" },
      } satisfies MetadataResult);

      renderDetail();
      await showTab(/proofs/i);

      expect(await screen.findByText(/disagrees with the chain/i)).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("reports an event that does not exist", async () => {
      getEventSummary.mockRejectedValue(new Error("EventNotFound"));

      renderDetail(99);

      expect(await screen.findByRole("alert")).toBeInTheDocument();
    });

    it("withholds a document whose bytes do not match the committed hash", async () => {
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue({
        status: "modified",
        expectedHash: "a".repeat(64),
        actualHash: "b".repeat(64),
      } satisfies MetadataResult);

      renderDetail();
      await showTab(/proofs/i);

      expect(await screen.findByText(/has been changed/i)).toBeInTheDocument();
      expect(screen.queryByText("Two laps of the temple.")).not.toBeInTheDocument();
    });
  });
});
