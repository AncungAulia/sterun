/**
 * The screen a phone that did not enter sees (STE-52).
 *
 * Entering on a laptop and running with a phone is ordinary, and so is a new
 * phone, so this is a main path rather than an error state.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPass = vi.hoisted(() => vi.fn());
const saveEntry = vi.hoisted(() => vi.fn(async () => {}));
const recordOf = vi.hoisted(() => vi.fn());
const getEventSummary = vi.hoisted(() => vi.fn());
const signMessage = vi.hoisted(() => vi.fn(async () => "sig"));

vi.mock("@/modules/pass/lib/pass-api", () => ({ fetchPass }));
vi.mock("@/lib/entry-store", () => ({ saveEntry }));
vi.mock("@/lib/chain/sterun", () => ({ readClient: { recordOf } }));
vi.mock("@/lib/event/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/event/events")>()),
  getEventSummary,
}));
vi.mock("@/lib/wallet/kit", () => ({
  signMessage,
  initWallet: vi.fn(),
  restoreAddress: vi.fn(async () => null),
  onWalletStateChange: vi.fn(() => () => {}),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signTransaction: vi.fn(),
  walletErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import { useWallet } from "@/hooks/useWallet";
import { ApiError } from "@/lib/api/client";
import { GetPassHere } from "@/modules/pass/components/GetPassHere";

const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const OTHER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...render(<GetPassHere tokenId={7} />, { wrapper }) };
}

beforeEach(() => {
  fetchPass.mockReset();
  saveEntry.mockClear();
  recordOf.mockReset();
  getEventSummary.mockReset();
  recordOf.mockResolvedValue({
    tokenId: 7,
    eventId: 13,
    categoryId: 1,
    bibNo: 128,
    participantHash: "f".repeat(64),
    state: "Entered",
    claimedAt: null,
  });
  getEventSummary.mockResolvedValue({
    event: { eventId: 13, name: "Sasando Run 2026", startsAt: 1790548200n, status: "Open" },
    categories: [{ eventId: 13, categoryId: 1, code: "10K" }],
  });
  useWallet.setState({ address: RUNNER, isRestoring: false, isConnecting: false, error: null });
});

describe("getting the pass onto this phone", () => {
  describe("positive", () => {
    it("explains what it needs before asking for a signature", () => {
      renderScreen();

      expect(screen.getByRole("heading", { name: "Get your pass on this phone" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Get my pass" })).toBeEnabled();
      expect(signMessage).not.toHaveBeenCalled();
    });

    it("saves the pass and the race on this phone once the wallet has signed", async () => {
      const user = userEvent.setup();
      fetchPass.mockResolvedValue({ totpSecret: "c".repeat(64), bibName: "SARI" });
      renderScreen();

      await user.click(screen.getByRole("button", { name: "Get my pass" }));

      await waitFor(() =>
        expect(saveEntry).toHaveBeenCalledWith(
          expect.objectContaining({
            tokenId: 7,
            eventId: 13,
            bibNo: 128,
            bibName: "SARI",
            raceName: "Sasando Run 2026",
            distanceCode: "10K",
            totpSecret: "c".repeat(64),
            runner: RUNNER,
          }),
        ),
      );
      // The race is read through the same chain reader the rest of the app
      // uses. Asserted because a mock that ignores its arguments will happily
      // accept a call the compiler rejects.
      expect(getEventSummary).toHaveBeenCalledWith(expect.anything(), 13);
    });

    it("tells the pass to read this phone again, so the codes appear", async () => {
      const user = userEvent.setup();
      fetchPass.mockResolvedValue({ totpSecret: "c".repeat(64), bibName: "SARI" });
      const { client } = renderScreen();
      const invalidate = vi.spyOn(client, "invalidateQueries");

      await user.click(screen.getByRole("button", { name: "Get my pass" }));

      // Without this the runner presses the button and the screen sits there,
      // because the page read an empty store before the secret arrived.
      await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["stored-entry", 7] }));
    });

    it("keeps no receipt it was never shown", async () => {
      const user = userEvent.setup();
      fetchPass.mockResolvedValue({ totpSecret: "c".repeat(64), bibName: "SARI" });
      renderScreen();

      await user.click(screen.getByRole("button", { name: "Get my pass" }));

      // The salt is shown once, on the device that entered. This phone gets the
      // secret that makes codes and nothing that stands in for a receipt.
      await waitFor(() => expect(saveEntry).toHaveBeenCalledWith(expect.objectContaining({ salt: "" })));
    });
  });

  describe("negative", () => {
    it("says which wallet to connect when this one does not own the record", async () => {
      const user = userEvent.setup();
      fetchPass.mockRejectedValue(new ApiError(403, "forbidden", "Not yours."));
      renderScreen();

      await user.click(screen.getByRole("button", { name: "Get my pass" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Connect the wallet that entered this race",
      );
      expect(saveEntry).not.toHaveBeenCalled();
    });

    it("says so when the entry has no pass to hand out yet", async () => {
      const user = userEvent.setup();
      fetchPass.mockRejectedValue(new ApiError(404, "no-pass", "Nothing here."));
      renderScreen();

      await user.click(screen.getByRole("button", { name: "Get my pass" }));

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(saveEntry).not.toHaveBeenCalled();
    });

    it("asks for a wallet first when none is connected", () => {
      useWallet.setState({ address: null, isRestoring: false, isConnecting: false, error: null });
      renderScreen();

      expect(screen.getByRole("heading", { name: /connect your wallet/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Get my pass" })).not.toBeInTheDocument();
    });

    it("does not hand a pass to a wallet that is not the one connected", async () => {
      const user = userEvent.setup();
      useWallet.setState({ address: OTHER, isRestoring: false, isConnecting: false, error: null });
      fetchPass.mockResolvedValue({ totpSecret: "c".repeat(64), bibName: "SARI" });
      renderScreen();

      await user.click(screen.getByRole("button", { name: "Get my pass" }));

      // Whatever the backend decides, the address asked for is this wallet.
      await waitFor(() => expect(fetchPass).toHaveBeenCalledWith(7, OTHER, expect.any(Function)));
    });
  });
});
