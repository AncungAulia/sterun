/**
 * The enter page up to the end of step 1: the wallet, the gates, the three
 * cards and the summary. Chain, document and wallet are mocked at the same
 * seams EventDetail.test.tsx and OrganiserHome.test.tsx use.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getEventSummary = vi.hoisted(() => vi.fn());
const fetchEventMetadata = vi.hoisted(() => vi.fn());
const listAddOns = vi.hoisted(() => vi.fn());
const recordsOfDetailed = vi.hoisted(() => vi.fn());

vi.mock("@/lib/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events")>()),
  getEventSummary,
}));
vi.mock("@/lib/sterun", () => ({ readClient: { listAddOns, recordsOfDetailed } }));
vi.mock("@/lib/metadata", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/metadata")>()),
  fetchEventMetadata,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/wallet", () => ({
  initWallet: vi.fn(),
  restoreAddress: vi.fn(async () => null),
  onWalletStateChange: vi.fn(() => () => {}),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signTransaction: vi.fn(),
  signMessage: vi.fn(),
  walletErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import { useWallet } from "@/hooks/useWallet";
import type { EventSummary } from "@/lib/events";
import type { MetadataResult } from "@/lib/metadata";
import { EntryFlow } from "@/modules/entry/EntryFlow";
import type { EventStatus, SterunAddOn, SterunCategory, SterunRecord } from "@sterunxyz/sdk";

const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const EVENT_ID = 2;

function category(categoryId: number, code: string, slotsLeft: number, priceStroops = 250_000_000n): SterunCategory {
  return {
    eventId: EVENT_ID,
    categoryId,
    code,
    distanceM: code === "21K" ? 21_000 : 10_000,
    quota: 300,
    enteredCount: 300 - slotsLeft,
    priceStroops,
    slotsLeft,
  };
}

function summary(status: EventStatus = "Open", categories = [category(0, "10K", 12), category(1, "21K", 5)]): EventSummary {
  return {
    event: {
      eventId: EVENT_ID,
      organiser: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
      name: "Borobudur Marathon",
      metadataHash: "a".repeat(64),
      uri: "https://sterun.xyz/events/2.json",
      startsAt: 1_790_548_200n,
      status,
    },
    categories,
  };
}

function addOn(addonId: number, code: string, priceStroops: bigint, unitsLeft = 20): SterunAddOn {
  return { eventId: EVENT_ID, addonId, code, priceStroops, quota: 20, reservedCount: 20 - unitsLeft, unitsLeft };
}

const ON_CHAIN = [
  addOn(0, "EVENT_JERSEY_M", 0n, 0),
  addOn(1, "EVENT_JERSEY_L", 0n),
  addOn(2, "MEDAL", 0n),
  addOn(3, "TOWEL", 50_000_000n),
];

const DOCUMENT: MetadataResult = {
  status: "verified",
  document: {
    addOns: [
      {
        name: "Event jersey",
        includedIn: ["10K", "21K"],
        sizes: [
          { label: "M", code: "EVENT_JERSEY_M" },
          { label: "L", code: "EVENT_JERSEY_L" },
        ],
      },
      { name: "Finisher medal", includedIn: ["10K", "21K"], code: "MEDAL" },
      { name: "Towel", includedIn: ["10K"], code: "TOWEL" },
    ],
  },
};

function record(categoryId: number, bibNo: number): SterunRecord {
  return {
    tokenId: 9,
    eventId: EVENT_ID,
    categoryId,
    bibNo,
    participantHash: "a".repeat(64),
    state: "Entered",
    enteredAt: 0n,
    claimedAt: null,
    finishTimeS: null,
    resultAt: null,
    addonIds: [],
  } as SterunRecord;
}

function renderFlow(requestedCategory: number | null = 0) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...render(<EntryFlow eventId={EVENT_ID} requestedCategory={requestedCategory} />, { wrapper }) };
}

beforeEach(() => {
  getEventSummary.mockReset();
  fetchEventMetadata.mockReset();
  listAddOns.mockReset();
  recordsOfDetailed.mockReset();

  getEventSummary.mockResolvedValue(summary());
  fetchEventMetadata.mockResolvedValue(DOCUMENT);
  listAddOns.mockResolvedValue(ON_CHAIN);
  recordsOfDetailed.mockResolvedValue([]);

  window.sessionStorage.clear();
  useWallet.setState({ address: RUNNER, isRestoring: false, isConnecting: false, error: null });
});

describe("before the form", () => {
  it("asks for a wallet first, in a runner's words", async () => {
    useWallet.setState({ address: null });
    renderFlow();
    expect(await screen.findByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /connect your wallet to enter/i })).toBeInTheDocument();
    expect(getEventSummary).not.toHaveBeenCalled();
  });

  it("says entries are closed for a race that is not open", async () => {
    getEventSummary.mockResolvedValue(summary("Closed"));
    renderFlow();
    expect(await screen.findByText("Entries for this race are closed.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the race" })).toHaveAttribute("href", "/events/2");
    expect(screen.queryByRole("region", { name: "Distance" })).not.toBeInTheDocument();
  });

  it("shows the existing entry instead of the form", async () => {
    recordsOfDetailed.mockResolvedValue([record(1, 4)]);
    renderFlow();
    expect(await screen.findByRole("heading", { name: "You're already entered" })).toBeInTheDocument();
    // The mockup's sentence (block 7): the distance and bib, and the rule.
    expect(screen.getByText("This wallet entered the 21K with bib 4. One entry per race.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the race" })).toHaveAttribute("href", "/events/2");
    expect(screen.queryByRole("region", { name: "Distance" })).not.toBeInTheDocument();
  });

  it("says a requested full distance is sold out and links the others", async () => {
    getEventSummary.mockResolvedValue(summary("Open", [category(0, "10K", 0), category(1, "21K", 5)]));
    renderFlow(0);
    expect(await screen.findByText("This distance is sold out.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enter 21K" })).toHaveAttribute("href", "/events/2/enter?category=1");
    expect(screen.queryByRole("link", { name: "Enter 10K" })).not.toBeInTheDocument();
  });

  it("says every distance is full when none has a place", async () => {
    getEventSummary.mockResolvedValue(summary("Open", [category(0, "10K", 0)]));
    renderFlow(null);
    expect(await screen.findByText("Every distance is full.")).toBeInTheDocument();
  });

  /*
   * The gates decide before the form, not during it. An entry that lands
   * refreshes this wallet's records while the dialog still waits on the wallet
   * to link it; swapping the page for "You're already entered" there unmounted
   * the dialog, and the runner never reached their bib (Ancung, 2026-09-15).
   */
  it("keeps the form once it is open, when this wallet's new entry is read back", async () => {
    const { client } = renderFlow(0);
    await screen.findByRole("region", { name: "Distance" });

    recordsOfDetailed.mockResolvedValue([record(0, 1)]);
    await act(() => client.refetchQueries());
    await waitFor(() => expect(recordsOfDetailed).toHaveBeenCalledTimes(2));
    await act(async () => {});

    expect(screen.queryByRole("heading", { name: "You're already entered" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Enter Borobudur Marathon" })).toBeInTheDocument();
  });

  it("keeps the form once it is open, when the last place is taken meanwhile", async () => {
    const { client } = renderFlow(0);
    await screen.findByRole("region", { name: "Distance" });

    getEventSummary.mockResolvedValue(summary("Open", [category(0, "10K", 0)]));
    await act(() => client.refetchQueries());
    await waitFor(() => expect(getEventSummary).toHaveBeenCalledTimes(2));
    await act(async () => {});

    expect(screen.queryByText("Every distance is full.")).not.toBeInTheDocument();
    expect(screen.queryByText("This distance is sold out.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Enter Borobudur Marathon" })).toBeInTheDocument();
  });

  it("says so when the race cannot be loaded, with a way to try again", async () => {
    getEventSummary.mockRejectedValue(new Error("rpc down"));
    renderFlow();
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load this race");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("step 1", () => {
  it("opens on the requested distance, under the race's name", async () => {
    renderFlow(1);
    expect(await screen.findByRole("heading", { name: "Enter Borobudur Marathon" })).toBeInTheDocument();
    const distance = await screen.findByRole("region", { name: "Distance" });
    expect(within(distance).getByRole("radio", { name: /21K/ })).toBeChecked();
  });

  it("keeps a sold-out distance visible but not selectable", async () => {
    getEventSummary.mockResolvedValue(summary("Open", [category(0, "10K", 12), category(1, "21K", 0)]));
    renderFlow(0);
    const distance = await screen.findByRole("region", { name: "Distance" });
    const full = within(distance).getByRole("radio", { name: /21K/ });
    expect(full).toBeDisabled();
    expect(within(distance).getByText("Sold out")).toBeInTheDocument();
  });

  it("separates the race pack from the add-ons", async () => {
    renderFlow(0);
    const pack = await screen.findByRole("region", { name: "Race pack" });
    const extras = await screen.findByRole("region", { name: "Add-ons" });

    expect(within(pack).getByText("Comes with every entry.")).toBeInTheDocument();
    expect(within(pack).getByText("Event jersey")).toBeInTheDocument();
    expect(within(pack).getByText("Finisher medal")).toBeInTheDocument();
    expect(within(pack).queryByText("Towel")).not.toBeInTheDocument();

    expect(within(extras).getByText("Optional extras, paid with your entry.")).toBeInTheDocument();
    expect(within(extras).getByRole("checkbox", { name: /Towel/ })).toBeInTheDocument();
  });

  it("does not let a sold-out size be picked", async () => {
    renderFlow(0);
    const pack = await screen.findByRole("region", { name: "Race pack" });
    expect(within(pack).getByRole("radio", { name: "M" })).toBeDisabled();
    expect(within(pack).getByRole("radio", { name: "L" })).toBeEnabled();
  });

  it("leaves out the Add-ons card when this distance sells nothing", async () => {
    renderFlow(1);
    await screen.findByRole("region", { name: "Race pack" });
    expect(screen.queryByRole("region", { name: "Add-ons" })).not.toBeInTheDocument();
  });

  it("refuses Continue until each sized item has a size, and says which", async () => {
    const user = userEvent.setup();
    renderFlow(0);
    await screen.findByRole("region", { name: "Race pack" });

    await user.click(screen.getByRole("button", { name: "Continue" }));

    const pack = screen.getByRole("region", { name: "Race pack" });
    expect(within(pack).getByRole("alert")).toHaveTextContent("Pick a size.");
    expect(screen.getByRole("region", { name: "Distance" })).toBeInTheDocument();
  });

  it("moves on once every size is chosen", async () => {
    const user = userEvent.setup();
    renderFlow(0);
    const pack = await screen.findByRole("region", { name: "Race pack" });

    await user.click(within(pack).getByRole("radio", { name: "L" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.queryByRole("region", { name: "Distance" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("totals the entry and updates when an add-on is ticked", async () => {
    const user = userEvent.setup();
    renderFlow(0);
    const entry = await screen.findByRole("region", { name: "Your entry" });
    expect(within(entry).getByTestId("entry-total")).toHaveTextContent("sUSD 25");

    await user.click(within(await screen.findByRole("region", { name: "Add-ons" })).getByRole("checkbox", { name: /Towel/ }));

    expect(within(entry).getByTestId("entry-total")).toHaveTextContent("sUSD 30");
    expect(within(entry).getByText("Towel")).toBeInTheDocument();
  });

  it("lists race pack items as included in the summary, with no price", async () => {
    renderFlow(0);
    const entry = await screen.findByRole("region", { name: "Your entry" });
    await within(entry).findByText("Finisher medal");
    expect(within(entry).getAllByText("Included").length).toBeGreaterThanOrEqual(2);
  });

  it("clears the race pack and add-ons when the distance changes", async () => {
    const user = userEvent.setup();
    renderFlow(0);
    const extras = await screen.findByRole("region", { name: "Add-ons" });
    await user.click(within(extras).getByRole("checkbox", { name: /Towel/ }));

    await user.click(within(screen.getByRole("region", { name: "Distance" })).getByRole("radio", { name: /21K/ }));

    expect(within(screen.getByRole("region", { name: "Your entry" })).queryByText("Towel")).not.toBeInTheDocument();
  });

  it("keeps the distance and add-ons through a reload", async () => {
    const user = userEvent.setup();
    const first = renderFlow(0);
    const pack = await screen.findByRole("region", { name: "Race pack" });
    await user.click(within(pack).getByRole("radio", { name: "L" }));
    await user.click(within(screen.getByRole("region", { name: "Add-ons" })).getByRole("checkbox", { name: /Towel/ }));
    first.unmount();

    renderFlow(0);
    const again = await screen.findByRole("region", { name: "Race pack" });
    expect(within(again).getByRole("radio", { name: "L" })).toBeChecked();
    expect(within(screen.getByRole("region", { name: "Add-ons" })).getByRole("checkbox", { name: /Towel/ })).toBeChecked();
  });
});
