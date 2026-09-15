import { Keypair } from "@stellar/stellar-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWallet } from "@/hooks/useWallet";
import { apiFetch } from "@/lib/api/client";
import type { EventSummary } from "@/lib/event/events";
import { ScannersTab } from "@/modules/organiser/race/components/ScannersTab";

const readClient = vi.hoisted(() => ({ addScanner: vi.fn(), removeScanner: vi.fn() }));
vi.mock("@/lib/chain/sterun", () => ({ readClient }));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiFetch: vi.fn(),
}));
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

// Real keys, so the address check in the dialog is exercised for real.
const ORGANISER = Keypair.random().publicKey();
const GATE_PHONE = Keypair.random().publicKey();
const NEW_PHONE = Keypair.random().publicKey();

const SUMMARY: EventSummary = {
  event: {
    eventId: 4,
    organiser: ORGANISER,
    name: "Fun Run Sleman",
    metadataHash: "a".repeat(64),
    uri: "",
    startsAt: 4_000_000_000n,
    status: "Open",
  },
  categories: [],
};

const SENT = { value: undefined, txHash: "ab", ledger: 1 };

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<ScannersTab summary={SUMMARY} />, { wrapper: Wrapper });
}

beforeEach(() => {
  readClient.addScanner.mockReset();
  readClient.removeScanner.mockReset();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({
    scanners: [{ address: GATE_PHONE, added_ledger: 100 }],
    last_ledger: 120,
  });
  useWallet.setState({ address: ORGANISER, isRestoring: false, isConnecting: false, error: null });
});

async function openAdd() {
  await userEvent.click(await screen.findByRole("button", { name: "Add scanner" }));
  return screen.findByRole("dialog");
}

describe("ScannersTab", () => {
  describe("positive", () => {
    it("lists each scanner by its whole address, with a way to remove it", async () => {
      renderTab();

      const table = await screen.findByRole("table");
      expect(within(table).getByText(GATE_PHONE)).toBeInTheDocument();
      expect(
        within(table).getByRole("button", { name: `Remove ${GATE_PHONE}` }),
      ).toBeInTheDocument();
      expect(screen.getByText("1 scanner")).toBeInTheDocument();
    });

    it("adds a scanner after a signature and shows it before the list catches up", async () => {
      readClient.addScanner.mockResolvedValue(SENT);
      renderTab();

      const dialog = await openAdd();
      expect(dialog).toHaveTextContent("the phone that will do the scanning");
      await userEvent.type(
        within(dialog).getByRole("textbox", { name: "Wallet address" }),
        NEW_PHONE,
      );
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign and add" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(readClient.addScanner).toHaveBeenCalledWith(
        4,
        NEW_PHONE,
        expect.objectContaining({ publicKey: ORGANISER }),
      );
      // The index still answers with the old list; the new phone shows anyway.
      const row = within(screen.getByRole("table")).getByText(NEW_PHONE).closest("tr")!;
      expect(row).toHaveTextContent("Just added");
    });

    it("removes a scanner after a signature", async () => {
      readClient.removeScanner.mockResolvedValue(SENT);
      renderTab();

      await userEvent.click(await screen.findByRole("button", { name: `Remove ${GATE_PHONE}` }));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("will no longer be able to check runners in");
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign and remove" }));

      await waitFor(() => expect(screen.queryByRole("table")).not.toBeInTheDocument());
      expect(readClient.removeScanner).toHaveBeenCalledWith(4, GATE_PHONE, expect.anything());
      expect(screen.getByText("No scanner yet")).toBeInTheDocument();
    });

    it("draws Added at and Scanned once the index sends them", async () => {
      vi.mocked(apiFetch).mockResolvedValue({
        scanners: [{ address: GATE_PHONE, added_ledger: 100, added_at: "1788000000", scans: 118 }],
        last_ledger: 120,
      });
      renderTab();

      const table = await screen.findByRole("table");
      expect(within(table).getByRole("columnheader", { name: "Added at" })).toBeInTheDocument();
      expect(within(table).getByRole("columnheader", { name: "Scanned" })).toBeInTheDocument();
      expect(within(table).getByText("118")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("draws no Added at or Scanned column before the index sends them", async () => {
      renderTab();
      const table = await screen.findByRole("table");
      expect(
        within(table).queryByRole("columnheader", { name: "Added at" }),
      ).not.toBeInTheDocument();
      expect(
        within(table).queryByRole("columnheader", { name: "Scanned" }),
      ).not.toBeInTheDocument();
    });

    it("refuses something that is not a wallet address, before any signature", async () => {
      renderTab();
      const dialog = await openAdd();
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Wallet address" }), "GABC");
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign and add" }));

      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "starts with G and is 56 characters long",
      );
      expect(readClient.addScanner).not.toHaveBeenCalled();
    });

    it("refuses the organiser's own wallet, the mistake found on race morning", async () => {
      renderTab();
      const dialog = await openAdd();
      await userEvent.type(
        within(dialog).getByRole("textbox", { name: "Wallet address" }),
        ORGANISER,
      );
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign and add" }));

      expect(within(dialog).getByRole("alert")).toHaveTextContent("This is your own wallet");
      expect(readClient.addScanner).not.toHaveBeenCalled();
    });

    it("refuses a wallet that is already a scanner", async () => {
      renderTab();
      await screen.findByRole("table");
      const dialog = await openAdd();
      await userEvent.type(
        within(dialog).getByRole("textbox", { name: "Wallet address" }),
        GATE_PHONE,
      );
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign and add" }));

      expect(within(dialog).getByRole("alert")).toHaveTextContent("can already check runners in");
      expect(readClient.addScanner).not.toHaveBeenCalled();
    });

    it("keeps the dialog open and explains when signing fails", async () => {
      readClient.addScanner.mockRejectedValue(new Error("boom"));
      renderTab();
      const dialog = await openAdd();
      await userEvent.type(
        within(dialog).getByRole("textbox", { name: "Wallet address" }),
        NEW_PHONE,
      );
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign and add" }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "Something went wrong. Please try again.",
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("says the list could not be loaded rather than that there are no scanners", async () => {
      vi.mocked(apiFetch).mockImplementation(async () => {
        throw new Error("down");
      });
      renderTab();
      expect(await screen.findByRole("alert")).toHaveTextContent("We could not load the scanners");
      expect(screen.queryByText("No scanner yet")).not.toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("says what an empty list means on race day", async () => {
      vi.mocked(apiFetch).mockResolvedValue({ scanners: [], last_ledger: 120 });
      renderTab();
      expect(await screen.findByText("No scanner yet")).toBeInTheDocument();
      expect(screen.getByText("Nobody can check runners in on race day.")).toBeInTheDocument();
    });

    it("accepts an address pasted with spaces around it", async () => {
      readClient.addScanner.mockResolvedValue(SENT);
      renderTab();
      const dialog = await openAdd();
      await userEvent.type(
        within(dialog).getByRole("textbox", { name: "Wallet address" }),
        `  ${NEW_PHONE} `,
      );
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign and add" }));
      await waitFor(() =>
        expect(readClient.addScanner).toHaveBeenCalledWith(4, NEW_PHONE, expect.anything()),
      );
    });
  });
});
