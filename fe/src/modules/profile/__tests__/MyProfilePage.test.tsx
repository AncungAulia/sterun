import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWallet } from "@/hooks/useWallet";
import { MyProfilePage } from "@/modules/profile/MyProfilePage";
import type { ProfileTab } from "@/modules/profile/lib/profile-tab";
import type { SterunRecord } from "@sterunxyz/sdk";

const readClient = vi.hoisted(() => ({
  recordsOfDetailed: vi.fn(),
  getEvent: vi.fn(),
  listCategories: vi.fn(),
}));
vi.mock("@/lib/chain/sterun", () => ({ readClient }));
vi.mock("@/lib/wallet/kit", () => ({
  initWallet: vi.fn(),
  restoreAddress: vi.fn(async () => null),
  onWalletStateChange: vi.fn(() => () => {}),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signTransaction: vi.fn(),
  signMessage: vi.fn(),
  walletErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));
vi.mock("@/hooks/useSusdBalance", () => ({
  useSusdBalance: () => ({ data: { kind: "balance", stroops: 200_000_000n } }),
}));
vi.mock("@/components/wallet/GetTestSusd", () => ({
  GetTestSusd: () => <button type="button">Get test sUSD</button>,
}));
/* The index adds a transaction link per card; it is not what this page is for. */
vi.mock("@/modules/profile/hooks/useRecordTrail", () => ({
  useRecordTrail: () => ({ data: null }),
}));

const ADDRESS = "GA5VKC7QHIIC7GBXMHLILU2LMKKXYAHOFNE77CUOGMLO4GB3ZKP5HZS7";

function record(overrides: Partial<SterunRecord> = {}): SterunRecord {
  return {
    tokenId: 7,
    eventId: 3,
    categoryId: 0,
    runner: ADDRESS,
    bibNo: 12,
    state: "Entered",
    participantHash: "a".repeat(64),
    addonIds: [],
    enteredAt: 1_790_000_000n,
    claimedAt: null,
    resultAt: null,
    finishTimeS: null,
    ...overrides,
  } as SterunRecord;
}

function renderPage(tab: ProfileTab = "entries") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<MyProfilePage tab={tab} />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  readClient.recordsOfDetailed.mockResolvedValue([]);
  readClient.getEvent.mockRejectedValue(new Error("not needed"));
  readClient.listCategories.mockResolvedValue([]);
  useWallet.setState({ address: ADDRESS, isRestoring: false, isConnecting: false, error: null });
});

describe("MyProfilePage", () => {
  describe("positive", () => {
    it("puts the pass and the entry one press from the wallet that holds them", async () => {
      // The reason this page exists: a pass used to be reachable only by
      // remembering which race it belonged to.
      readClient.recordsOfDetailed.mockResolvedValue([record({ tokenId: 41, eventId: 9 })]);

      renderPage();

      const pass = await screen.findByRole("link", { name: "Open my pass" });
      const section = pass.closest("section") as HTMLElement;
      expect(section).toHaveAttribute("aria-label", "Your entries");
      expect(pass).toHaveAttribute("href", "/pass/41");
      expect(within(section).getByRole("link", { name: "View my entry" })).toHaveAttribute(
        "href",
        "/events/9/entered/41",
      );
    });

    it("keeps a collected race pack in the entries, since the race has not been run", async () => {
      readClient.recordsOfDetailed.mockResolvedValue([
        record({ tokenId: 41, state: "RacepackClaimed", claimedAt: 1_790_100_000n }),
      ]);

      renderPage();

      expect(await screen.findByRole("link", { name: "Open my pass" })).toBeInTheDocument();
    });

    it("counts each section on its tab once the chain has answered", async () => {
      readClient.recordsOfDetailed.mockResolvedValue([
        record({ tokenId: 1 }),
        record({ tokenId: 2, state: "Finished", resultAt: 1_790_200_000n, finishTimeS: 3600 }),
      ]);

      renderPage();

      const tabs = await screen.findByRole("navigation", { name: "Profile sections" });
      expect(await within(tabs).findByRole("link", { name: "Your entries 1" })).toBeInTheDocument();
      expect(within(tabs).getByRole("link", { name: "Race record 1" })).toHaveAttribute(
        "href",
        "/profile?tab=record",
      );
    });

    it("links the public page from the record, rather than claiming to be it", async () => {
      renderPage("record");

      const link = await screen.findByRole("link", { name: "Open the public page" });
      expect(link).toHaveAttribute("href", `/runner/${ADDRESS}`);
      // One way there, beside the history it opens, rather than a second
      // button in the header saying the same thing (Ancung, 2026-09-23).
      expect(screen.queryByRole("link", { name: "See what others see" })).not.toBeInTheDocument();
    });

    it("shows the test money and the way to get some, on the faucet tab", async () => {
      renderPage("faucet");

      expect(await screen.findByText("sUSD 20")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Get test sUSD" })).toBeInTheDocument();
      // The faucet is not in the way of the entries it exists to pay for.
      expect(screen.queryByRole("link", { name: "Open my pass" })).not.toBeInTheDocument();
    });

    it("disconnects from any tab, since the menu that used to hold it is gone", async () => {
      const disconnect = vi.fn(async () => {});
      useWallet.setState({ disconnect });

      renderPage("faucet");
      await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));

      expect(disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe("negative", () => {
    it("asks for a wallet rather than showing an empty page", () => {
      useWallet.setState({ address: null });

      renderPage();

      expect(screen.getByText("Your profile")).toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Profile sections" })).not.toBeInTheDocument();
    });

    it("counts nothing while the chain has not answered", () => {
      renderPage();

      const tabs = screen.getByRole("navigation", { name: "Profile sections" });
      expect(within(tabs).getByRole("link", { name: "Your entries" })).toBeInTheDocument();
    });

    it("says nothing is finished rather than nothing exists", async () => {
      // An entry with no result is not an empty history: the race has not been
      // run, and saying "no races" there would read as the entry being lost.
      readClient.recordsOfDetailed.mockResolvedValue([record()]);

      renderPage("record");

      expect(await screen.findByText("Nothing finished yet")).toBeInTheDocument();
      expect(screen.queryByText("No races yet")).not.toBeInTheDocument();
    });

    it("says it could not look, rather than that there is nothing", async () => {
      readClient.recordsOfDetailed.mockRejectedValue(new Error("rpc down"));

      renderPage();

      expect(await screen.findByText("Could not load this history")).toBeInTheDocument();
      expect(screen.queryByText("No races yet")).not.toBeInTheDocument();
    });
  });
});
