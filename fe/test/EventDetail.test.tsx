import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EventDetail } from "@/modules/event-detail/EventDetail";
import type { EventSummary } from "@/lib/events";
import type { MetadataResult } from "@/lib/metadata";
import type { EventStatus, SterunCategory, SterunEvent } from "@sterunxyz/sdk";

const getEventSummary = vi.hoisted(() => vi.fn());
const fetchEventMetadata = vi.hoisted(() => vi.fn());

vi.mock("@/lib/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events")>()),
  getEventSummary,
}));
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
});

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

      expect(await screen.findByText("10K")).toBeInTheDocument();
      expect(screen.getByText("sUSD 25")).toBeInTheDocument();
      expect(screen.getByText("5K")).toBeInTheDocument();
      expect(screen.getByText("Free")).toBeInTheDocument();
      expect(screen.getByText(/120 of 300 left/)).toBeInTheDocument();
      expect(screen.getByText(/60 of 100 left/)).toBeInTheDocument();
    });

    it("offers entry per category while the event is open", async () => {
      getEventSummary.mockResolvedValue(summary({ status: "Open" }, [category(0), category(1)]));

      renderDetail();

      const links = await screen.findAllByRole("link", { name: /enter/i });
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute("href", "/events/2/enter?category=0");
      expect(links[1]).toHaveAttribute("href", "/events/2/enter?category=1");
    });

    it("shows the verified document once it checks out", async () => {
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue({
        status: "verified",
        document: { description: "Two laps of the temple.", gunStart: "2026-09-28T05:30+07:00" },
      } satisfies MetadataResult);

      renderDetail();

      expect(await screen.findByText("Two laps of the temple.")).toBeInTheDocument();
      expect(screen.getByText(/matches the hash/i)).toBeInTheDocument();
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
      expect(screen.getByText(/not open for entries/i)).toBeInTheDocument();
    });

    it("marks a full category as full rather than offering entry", async () => {
      // QuotaFull(5) is enforced in reserve_slot, so entering here would revert.
      // Offering the link anyway would spend a runner's time to be told no.
      getEventSummary.mockResolvedValue(
        summary({ status: "Open" }, [category(0, { quota: 5, enteredCount: 5 })]),
      );

      renderDetail();

      expect(await screen.findByText(/full/i)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /enter/i })).not.toBeInTheDocument();
    });

    it("says an event has no categories rather than showing an empty list", async () => {
      getEventSummary.mockResolvedValue(summary({}, []));

      renderDetail();

      expect(await screen.findByText(/no categories/i)).toBeInTheDocument();
    });

    it("still shows the race when its document cannot be reached", async () => {
      // Every event on testnet today points at a host that serves nothing, so
      // this is the common path rather than the exotic one.
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue(UNAVAILABLE);

      renderDetail();

      expect(await screen.findByText("Borobudur Marathon")).toBeInTheDocument();
      expect(await screen.findByText(/could not be read/i)).toBeInTheDocument();
    });

    it("warns when the document disagrees with the chain about the start time", async () => {
      getEventSummary.mockResolvedValue(summary());
      fetchEventMetadata.mockResolvedValue({
        status: "verified",
        document: { gunStart: "2026-09-28T09:00+07:00" },
      } satisfies MetadataResult);

      renderDetail();

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

      expect(await screen.findByText(/has been changed/i)).toBeInTheDocument();
      expect(screen.queryByText("Two laps of the temple.")).not.toBeInTheDocument();
    });
  });
});
