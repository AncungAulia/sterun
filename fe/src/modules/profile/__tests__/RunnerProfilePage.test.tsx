/**
 * The public race record, with the chain and the index mocked at their modules.
 * What matters most here is that the four ways a page can have nothing to list
 * never borrow each other's words: above all, a failed read is never "no races".
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chain = vi.hoisted(() => ({ recordsOfDetailed: vi.fn(), getEvent: vi.fn(), listCategories: vi.fn() }));
vi.mock("@/lib/chain/sterun", () => ({ readClient: chain }));

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiFetch,
}));

vi.mock("@/lib/event/metadata", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/event/metadata")>()),
  fetchEventMetadata: vi.fn(async () => ({ status: "verified", document: { location: { city: "Kupang" } } })),
}));

import { RunnerProfilePage } from "@/modules/profile/RunnerProfilePage";

import { RUNNER, category, event, record } from "../lib/__tests__/fixtures";

const RACES = {
  3: event(3, "Merdeka Run 2026", "Completed", 1_790_461_800n),
  4: event(4, "Kupang Coastal Half", "Completed", 1_786_860_000n),
  5: event(5, "Sterun Demo Run 2026", "Cancelled", 1_783_830_000n),
} as const;

function renderPage(address = RUNNER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<RunnerProfilePage address={address} />, { wrapper });
}

beforeEach(() => {
  chain.recordsOfDetailed.mockReset();
  chain.getEvent.mockImplementation(async (eventId: 3 | 4 | 5) => RACES[eventId]);
  chain.listCategories.mockImplementation(async (eventId: number) => [category(eventId, 0, "10K", 10_000)]);
  apiFetch.mockReset();
  apiFetch.mockRejectedValue(new Error("index down"));
});

describe("a runner with races", () => {
  beforeEach(() => {
    chain.recordsOfDetailed.mockResolvedValue([
      record({ tokenId: 1, eventId: 5, enteredAt: 1_782_000_000n, bibNo: 7 }),
      record({ tokenId: 2, eventId: 3, enteredAt: 1_786_000_000n, bibNo: 128, state: "Finished", claimedAt: 1_790_400_000n, finishTimeS: 6729 }),
      record({ tokenId: 3, eventId: 4, enteredAt: 1_784_000_000n, bibNo: 41, state: "Finished", claimedAt: 1_786_800_000n, finishTimeS: null }),
    ]);
  });

  it("lists every race newest first, each with what it means", async () => {
    renderPage();

    const cards = await screen.findAllByRole("article");
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
      "Merdeka Run 2026",
      "Kupang Coastal Half",
      "Sterun Demo Run 2026",
    ]);

    const merdeka = within(cards[0]!);
    expect(merdeka.getByText("Finished")).toBeInTheDocument();
    expect(merdeka.getByText("1:52:09")).toBeInTheDocument();
    expect(merdeka.getByText("128")).toBeInTheDocument();

    const kupang = within(cards[1]!);
    expect(kupang.getByText("No official time")).toBeInTheDocument();
    expect(kupang.queryByText("0:00")).not.toBeInTheDocument();

    await waitFor(() => expect(within(cards[2]!).getByText("Race cancelled")).toBeInTheDocument());
    expect(within(cards[2]!).getByText("The race did not take place")).toBeInTheDocument();
  });

  it("sums up the history from the records themselves", async () => {
    renderPage();
    await screen.findAllByRole("article");

    expect(screen.getByText("Races").nextSibling).toHaveTextContent("3");
    expect(screen.getByText("Finished", { selector: "p" }).nextSibling).toHaveTextContent("2");
    expect(screen.getByText("First race")).toBeInTheDocument();
  });

  it("names the city once the race's document is proven", async () => {
    renderPage();
    const [first] = await screen.findAllByRole("article");
    await waitFor(() => expect(within(first!).getByText(/^Kupang, /)).toBeInTheDocument());
  });

  it("still draws every card when the index is down, linking the contract instead of a transaction", async () => {
    renderPage();
    const [first] = await screen.findAllByRole("article");
    await waitFor(() =>
      expect(within(first!).getByRole("link", { name: "Check on Stellar Expert" })).toHaveAttribute(
        "href",
        expect.stringContaining("/contract/C"),
      ),
    );
    expect(within(first!).queryByText(/^Ledger/)).not.toBeInTheDocument();
  });

  it("links the transaction and ledger when the index has them", async () => {
    apiFetch.mockResolvedValue({
      record: { last_ledger: 59_072_879 },
      transitions: [{ to_state: "Finished", occurred_at: "1790500000", ledger: 59_072_879, tx_hash: "f".repeat(64) }],
    });
    renderPage();
    const [first] = await screen.findAllByRole("article");

    await waitFor(() => expect(within(first!).getByText("Ledger 59,072,879")).toBeInTheDocument());
    expect(within(first!).getByRole("link", { name: "Check on Stellar Expert" })).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${"f".repeat(64)}`,
    );
  });
});

describe("pagination", () => {
  it("shows twenty a page and moves between pages", async () => {
    chain.recordsOfDetailed.mockResolvedValue(
      Array.from({ length: 23 }, (_, index) =>
        record({ tokenId: index + 1, eventId: 3, enteredAt: BigInt(1_780_000_000 + index) }),
      ),
    );
    renderPage();

    expect(await screen.findAllByRole("article")).toHaveLength(20);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Newer races" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Older races" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });
});

describe("nothing to list, four different ways", () => {
  it("says no races yet when the chain answered with none", async () => {
    chain.recordsOfDetailed.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole("heading", { name: "No races yet" })).toBeInTheDocument();
    expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument();
  });

  it("never draws a failed read as no races", async () => {
    chain.recordsOfDetailed.mockRejectedValue(new Error("rpc down"));
    renderPage();

    expect(await screen.findByRole("heading", { name: "Could not load this history" })).toBeInTheDocument();
    expect(screen.queryByText("No races yet")).not.toBeInTheDocument();

    chain.recordsOfDetailed.mockResolvedValue([]);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "No races yet" })).toBeInTheDocument();
  });

  it("catches a bad address before calling anything", () => {
    renderPage("GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVX");

    expect(screen.getByRole("heading", { name: "That is not a Stellar address" })).toBeInTheDocument();
    expect(chain.recordsOfDetailed).not.toHaveBeenCalled();
  });

  it("shows the labels while it loads", () => {
    chain.recordsOfDetailed.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole("status", { name: "Loading race records" })).toBeInTheDocument();
    expect(screen.queryByText("No races yet")).not.toBeInTheDocument();
  });
});
