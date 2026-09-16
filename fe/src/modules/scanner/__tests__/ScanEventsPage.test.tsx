/**
 * S1. The chain, the wallet and the roster download are mocked at their
 * modules; the store is real (fake-indexeddb), because "a roster on this phone
 * is listed with no signal and no wallet" is a promise about the store.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventSummary } from "@/lib/event/events";

const wallet = vi.hoisted(() => ({
  address: null as string | null,
  isRestoring: false,
  isConnecting: false,
  connect: vi.fn(),
}));
vi.mock("@/hooks/useWallet", () => ({
  useWallet: (select?: (state: typeof wallet) => unknown) => (select ? select(wallet) : wallet),
}));

const events = vi.hoisted(() => ({ data: undefined as { events: EventSummary[]; unreadable: number[] } | undefined }));
vi.mock("@/hooks/useEvents", () => ({
  useEvents: () => ({ data: events.data, isSuccess: events.data !== undefined }),
}));

const isScanner = vi.hoisted(() => vi.fn());
vi.mock("@/lib/chain/sterun", () => ({ readClient: { isScanner } }));

const fetchRoster = vi.hoisted(() => vi.fn());
vi.mock("@/modules/scanner/lib/roster-api", () => ({ fetchRoster }));
vi.mock("@/lib/wallet/kit", () => ({ signMessage: vi.fn() }));

import { PlainError } from "@/lib/api/plain-error";
import { ScanEventsPage } from "@/modules/scanner/ScanEventsPage";
import { readRoster, saveRoster, type StoredRoster } from "@/modules/scanner/lib/scanner-store";

const SCANNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const ORGANISER = "GBORGANISERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

let nextId = 800;

function summary(eventId: number, name: string, status = "Open", organiser = ORGANISER): EventSummary {
  return {
    event: {
      eventId,
      organiser,
      name,
      metadataHash: "a".repeat(64),
      uri: "",
      startsAt: 1_790_000_000n,
      status: status as EventSummary["event"]["status"],
    },
    categories: [
      { eventId, categoryId: 0, code: "10K", distanceM: 10_000, quota: 500, enteredCount: 96, priceStroops: 0n, slotsLeft: 404 },
      { eventId, categoryId: 1, code: "5K", distanceM: 5_000, quota: 500, enteredCount: 4, priceStroops: 0n, slotsLeft: 496 },
    ],
  };
}

function download(eventId: number, missing = 0) {
  return {
    roster: {
      eventId,
      snapshotLedger: 4_469_811,
      generatedAt: "2026-09-27T02:02:00.000Z",
      downloadedAt: "2026-09-27T02:02:00.000Z",
      driftSeconds: 0,
      totp: { digits: 6, stepSeconds: 30, toleranceSteps: 1 },
      entries: [],
    } satisfies Omit<StoredRoster, "raceName" | "categories">,
    missingFromIndex: missing,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<ScanEventsPage />, { wrapper });
}

beforeEach(() => {
  wallet.address = SCANNER;
  wallet.connect.mockReset();
  events.data = { events: [], unreadable: [] };
  isScanner.mockReset();
  fetchRoster.mockReset();
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
});

describe("which races are listed", () => {
  it("only the ones this wallet scans or organises, and not a finished or cancelled one", async () => {
    const [a, b, c, d, e] = [nextId++, nextId++, nextId++, nextId++, nextId++];
    events.data = {
      events: [
        summary(a, "Scanned race"),
        summary(b, "Somebody else's race"),
        summary(c, "My own race", "Open", SCANNER),
        summary(d, "Finished race", "Completed"),
        summary(e, "Cancelled race", "Cancelled"),
      ],
      unreadable: [],
    };
    isScanner.mockImplementation(async (eventId: number) => eventId === a || eventId === d || eventId === e);

    renderPage();

    expect(await screen.findByRole("article", { name: "Scanned race" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "My own race" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Somebody else's race" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Finished race" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Cancelled race" })).not.toBeInTheDocument();
  });

  it("leaves a race out when the check for it fails to answer", async () => {
    const id = nextId++;
    events.data = { events: [summary(id, "Unanswered race")], unreadable: [] };
    isScanner.mockRejectedValue(new Error("rpc down"));

    renderPage();

    expect(await screen.findByText(/not a scanner for any race yet/)).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Unanswered race" })).not.toBeInTheDocument();
  });

  it("lists a roster already on this phone with no wallet and no signal", async () => {
    const id = nextId++;
    wallet.address = null;
    events.data = undefined;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    await saveRoster({ ...download(id).roster, raceName: "Stored race", categories: [{ categoryId: 0, code: "10K" }] });

    renderPage();

    const card = await screen.findByRole("article", { name: "Stored race" });
    expect(within(card).getByRole("link", { name: "Open scanner" })).toHaveAttribute("href", `/scan/${id}`);
    expect(within(card).queryByRole("button", { name: "Download again" })).not.toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
  });
});

describe("downloading", () => {
  it("stores the roster with the race's name and distances, then offers the desk", async () => {
    const id = nextId++;
    events.data = { events: [summary(id, "Timor Coastal 10K")], unreadable: [] };
    isScanner.mockResolvedValue(true);
    fetchRoster.mockResolvedValue(download(id));

    renderPage();
    const card = await screen.findByRole("article", { name: "Timor Coastal 10K" });
    expect(within(card).getByText("Not downloaded yet")).toBeInTheDocument();
    expect(within(card).getByText("100")).toBeInTheDocument();
    expect(within(card).getByText("10K, 5K")).toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: "Download roster" }));

    await waitFor(async () =>
      expect(await readRoster(id)).toMatchObject({
        raceName: "Timor Coastal 10K",
        categories: [
          { categoryId: 0, code: "10K" },
          { categoryId: 1, code: "5K" },
        ],
      }),
    );
    expect(fetchRoster).toHaveBeenCalledWith(id, SCANNER, expect.any(Function));
    expect(await within(card).findByRole("link", { name: "Open scanner" })).toBeInTheDocument();
    // Once as the badge and once as the label over the time.
    expect(within(card).getAllByText("Downloaded")).toHaveLength(2);
    expect(within(card).queryByText(/Ledger|4,469,811/)).not.toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Download again" })).toBeInTheDocument();
  });

  it("says when some entries are not in the download yet", async () => {
    const id = nextId++;
    events.data = { events: [summary(id, "Busy race")], unreadable: [] };
    isScanner.mockResolvedValue(true);
    fetchRoster.mockResolvedValue(download(id, 12));

    renderPage();
    const card = await screen.findByRole("article", { name: "Busy race" });
    await userEvent.click(within(card).getByRole("button", { name: "Download roster" }));

    expect(await within(card).findByRole("alert")).toHaveTextContent("12 entries are still on their way");
  });

  it("puts a refusal on the card it belongs to, in words the volunteer can act on", async () => {
    const id = nextId++;
    events.data = { events: [summary(id, "Refused race")], unreadable: [] };
    isScanner.mockResolvedValue(true);
    fetchRoster.mockRejectedValue(
      new PlainError("This wallet is not a scanner for this race. Ask the organiser to add it, then try again."),
    );

    renderPage();
    const card = await screen.findByRole("article", { name: "Refused race" });
    await userEvent.click(within(card).getByRole("button", { name: "Download roster" }));

    expect(await within(card).findByRole("alert")).toHaveTextContent("Ask the organiser to add it");
    expect(await readRoster(id)).toBeUndefined();
  });

  it("offers no download without signal", async () => {
    const id = nextId++;
    events.data = { events: [summary(id, "Race with no signal")], unreadable: [] };
    isScanner.mockResolvedValue(true);
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });

    renderPage();
    const card = await screen.findByRole("article", { name: "Race with no signal" });
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });
});
