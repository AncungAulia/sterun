/**
 * The success page (mockup block 5): the bib from chain, the receipt from this
 * device, and the way on held until the receipt is saved.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordOf = vi.hoisted(() => vi.fn());
const getEventSummary = vi.hoisted(() => vi.fn());
const readEntry = vi.hoisted(() => vi.fn());
const markReceiptSaved = vi.hoisted(() => vi.fn(async () => {}));
const signMessage = vi.hoisted(() => vi.fn());
const signTransaction = vi.hoisted(() => vi.fn());
const downloadReceipt = vi.hoisted(() => vi.fn(async () => {}));
const confetti = vi.hoisted(() => vi.fn());
/*
  Mocked at the shared helper rather than counted at canvas-confetti: the
  helper's second burst lands 220ms later, so counting library calls picked
  up a burst left over from the previous test.
*/
const fireConfetti = vi.hoisted(() => vi.fn());
vi.mock("@/lib/confetti", () => ({ fireConfetti }));

vi.mock("@/lib/sterun", () => ({ readClient: { recordOf } }));
vi.mock("@/lib/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events")>()),
  getEventSummary,
}));
vi.mock("@/lib/entry-store", () => ({ readEntry, markReceiptSaved }));
vi.mock("@/lib/wallet", () => ({
  initWallet: vi.fn(),
  restoreAddress: vi.fn(async () => null),
  onWalletStateChange: vi.fn(() => () => {}),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signTransaction,
  signMessage,
  walletErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));
vi.mock("@/modules/entry/receipt-pdf", () => ({ downloadReceipt }));
vi.mock("canvas-confetti", () => ({ default: confetti }));

import { useWallet } from "@/hooks/useWallet";
import type { StoredEntry } from "@/lib/entry-store";
import { EnteredPage } from "@/modules/entry/EnteredPage";
import type { SterunRecord } from "@sterunxyz/sdk";

const EVENT_ID = 13;
const TOKEN_ID = 7;
const SALT = "a3f1c0d5e7b249168a0c4f2d9e6b8135c7a2049fbe31d68075c4e9a1b2f3d40e";
const RACE_DAY = BigInt(Date.UTC(2026, 10, 5, 12) / 1000);

function record(overrides: Partial<SterunRecord> = {}): SterunRecord {
  return {
    tokenId: TOKEN_ID,
    eventId: EVENT_ID,
    categoryId: 1,
    bibNo: 4,
    participantHash: "f".repeat(64),
    state: "Entered",
    enteredAt: 0n,
    claimedAt: null,
    finishTimeS: null,
    resultAt: null,
    addonIds: [],
    ...overrides,
  } as SterunRecord;
}

const stored: StoredEntry = {
  eventId: EVENT_ID,
  categoryId: 1,
  tokenId: TOKEN_ID,
  bibNo: -1,
  bibName: "SARI",
  raceName: "Elektro Dash",
  startsAt: String(RACE_DAY),
  distanceCode: "10K",
  participantHash: "f".repeat(64),
  salt: SALT,
  totpSecret: "c".repeat(64),
  txHash: "d".repeat(64),
  runner: "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR",
  enteredAt: "2026-09-15T12:00:00.000Z",
  participantId: "6f1c9a52-3c1b-4b5e-9d0e-2a1f3b4c5d6e",
  racePack: ["Event jersey M"],
  paidStroops: "250000000",
};

/** A client can be passed in to render the page twice in one visit, as Back then View my entry does. */
function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<EnteredPage eventId={EVENT_ID} tokenId={TOKEN_ID} />, { wrapper });
}

beforeEach(() => {
  for (const mock of [recordOf, getEventSummary, readEntry, markReceiptSaved, signMessage, signTransaction, downloadReceipt, confetti, fireConfetti]) {
    mock.mockClear();
  }
  recordOf.mockResolvedValue(record());
  getEventSummary.mockResolvedValue({
    event: {
      eventId: EVENT_ID,
      organiser: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
      name: "Elektro Dash",
      metadataHash: "a".repeat(64),
      uri: "",
      startsAt: RACE_DAY,
      status: "Open",
    },
    categories: [
      { eventId: EVENT_ID, categoryId: 0, code: "5K", distanceM: 5000, quota: 100, enteredCount: 1, priceStroops: 0n, slotsLeft: 99 },
      { eventId: EVENT_ID, categoryId: 1, code: "10K", distanceM: 10000, quota: 100, enteredCount: 5, priceStroops: 250_000_000n, slotsLeft: 95 },
    ],
  });
  readEntry.mockResolvedValue(stored);
  // The wallet that entered, connected: even it is never asked for anything here.
  useWallet.setState({ address: stored.runner, isRestoring: false, isConnecting: false, error: null });
});

describe("EnteredPage", () => {
  it("celebrates with the race and its date", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "You're in!" })).toBeInTheDocument();
    expect(screen.getByText("Elektro Dash · Nov 5, 2026")).toBeInTheDocument();
  });

  it("fires the wizard's confetti once", async () => {
    fireConfetti.mockClear();
    renderPage();
    await screen.findByRole("heading", { name: "You're in!" });
    await waitFor(() => expect(fireConfetti).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fireConfetti).toHaveBeenCalledTimes(1);
  });

  it("fires no confetti for an entry that is not part of this race", async () => {
    fireConfetti.mockClear();
    recordOf.mockResolvedValue(record({ eventId: 9 }));
    renderPage();
    await screen.findByText("This entry is not part of this race.");
    expect(fireConfetti).not.toHaveBeenCalled();
  });

  it("draws the bib with the number from chain and the name from this device", async () => {
    renderPage();
    const bib = await screen.findByRole("img", { name: "Bib 4, SARI, 10K" });
    expect(within(bib).getByText("4")).toBeInTheDocument();
    expect(within(bib).getByText("SARI")).toBeInTheDocument();
    expect(within(bib).getAllByText("10K")).toHaveLength(2);
    expect(within(bib).getByText("Elektro Dash")).toBeInTheDocument();
  });

  it("hides most of the receipt code until asked", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("a3f1c0d5 •••• •••• b2f3d40e")).toBeInTheDocument();
    expect(screen.queryByText(SALT)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText(SALT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  it("downloads the receipt with the bib from chain", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Download receipt" }));
    expect(downloadReceipt).toHaveBeenCalledWith(expect.objectContaining({ tokenId: TOKEN_ID, bibNo: 4, salt: SALT }));
  });

  it("copies the code", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Copy code" }));
    expect(writeText).toHaveBeenCalledWith(SALT);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("holds the way on until the receipt is saved", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("button", { name: "Back to the race" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Back to the race" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "I've saved my receipt" }));

    expect(screen.getByRole("link", { name: "Back to the race" })).toHaveAttribute("href", `/events/${EVENT_ID}`);
  });

  it("says where the receipt is when this device did not enter", async () => {
    readEntry.mockResolvedValue(undefined);
    renderPage();

    expect(await screen.findByText("Your receipt is on the device you entered with.")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Bib 4, 10K" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download receipt" })).not.toBeInTheDocument();
    // Nothing to save here, so nothing to hold the way on for.
    expect(screen.getByRole("link", { name: "Back to the race" })).toBeInTheDocument();
  });

  it("refuses a record that belongs to another race", async () => {
    recordOf.mockResolvedValue(record({ eventId: 9 }));
    renderPage();
    expect(await screen.findByText("This entry is not part of this race.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "You're in!" })).not.toBeInTheDocument();
  });

  it("says so when the record cannot be read", async () => {
    recordOf.mockRejectedValue(new Error("rpc down"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load this entry");
  });

  it("never asks the wallet to sign anything", async () => {
    // A prompt on a page somebody opened to look at their bib is how two
    // popups appeared over the success page (Ancung, 2026-09-15). The backend
    // links the entry from the chain now (STE-59).
    renderPage();
    await screen.findByRole("heading", { name: "You're in!" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(signMessage).not.toHaveBeenCalled();
    expect(signTransaction).not.toHaveBeenCalled();
  });

  describe("coming back (Ancung, 2026-09-15)", () => {
    it("remembers on this device that the receipt was saved", async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("checkbox", { name: "I've saved my receipt" }));

      expect(markReceiptSaved).toHaveBeenCalledWith(TOKEN_ID);
    });

    it("asks nothing and throws no confetti once the receipt was saved", async () => {
      readEntry.mockResolvedValue({ ...stored, receiptSaved: true });
      renderPage();

      expect(await screen.findByRole("link", { name: "Back to the race" })).toHaveAttribute(
        "href",
        `/events/${EVENT_ID}`,
      );
      expect(screen.queryByRole("checkbox", { name: "I've saved my receipt" })).not.toBeInTheDocument();
      // The receipt itself is still here: that is why the runner came back.
      expect(screen.getByRole("button", { name: "Download receipt" })).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(fireConfetti).not.toHaveBeenCalled();
    });

    it("does not ask again on the way back in during the same visit", async () => {
      // The bug: the tick was written to the device, but the page kept its first
      // read of the entry, so Back to the race then View my entry asked again.
      const user = userEvent.setup();
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const first = renderPage(client);
      await user.click(await screen.findByRole("checkbox", { name: "I've saved my receipt" }));
      first.unmount();

      readEntry.mockResolvedValue({ ...stored, receiptSaved: true });
      renderPage(client);

      expect(await screen.findByRole("link", { name: "Back to the race" })).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: "I've saved my receipt" })).not.toBeInTheDocument();
    });

    it("still asks a runner who never confirmed saving it", async () => {
      readEntry.mockResolvedValue({ ...stored, receiptSaved: false });
      renderPage();
      expect(await screen.findByRole("checkbox", { name: "I've saved my receipt" })).toBeInTheDocument();
    });

    it("throws no confetti on a device that did not enter", async () => {
      readEntry.mockResolvedValue(undefined);
      renderPage();
      await screen.findByText("Your receipt is on the device you entered with.");
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(fireConfetti).not.toHaveBeenCalled();
    });
  });
});
