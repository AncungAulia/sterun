/**
 * The pass, one test per state from the design (exports/r1..r4).
 *
 * The chain and the store are mocked at their modules; the code itself is real,
 * computed from vector tp-02's secret, because a pass showing the wrong six
 * characters is the one failure nobody can recover from at a desk.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recordOf = vi.hoisted(() => vi.fn());
const readEntry = vi.hoisted(() => vi.fn());
const rememberPassFacts = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/chain/sterun", () => ({ readClient: { recordOf } }));
vi.mock("@/lib/entry-store", () => ({ readEntry, rememberPassFacts }));
vi.mock("@/modules/pass/components/PassQr", () => ({
  PassQr: ({ payload }: { payload: string }) => <div data-testid="qr">{payload}</div>,
}));
/*
  The page reaches WalletGate through the screen a phone without the secret
  sees, and WalletGate reads useWallet, which pulls in Stellar Wallets Kit.
  That package cannot be loaded by vitest (fe/CLAUDE.md), and without this the
  whole file fails to collect rather than failing a test.
*/
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

import { useWallet } from "@/hooks/useWallet";
import { PassPage } from "@/modules/pass/PassPage";

const SECRET = "4d7b1e93a05c26f8d3407e91b6c258aa0f31d74e69b2085c1a3f6d904e7c2b15";
/** 1772103330: step 59070111, code 079663, and 20 seconds into that step. */
const INSIDE_THE_STEP = 1772103330_000;

const stored = {
  eventId: 13,
  categoryId: 1,
  tokenId: 7,
  bibNo: 128,
  bibName: "SARI",
  raceName: "Sasando Run 2026",
  startsAt: String(Date.UTC(2026, 8, 27, 12) / 1000),
  distanceCode: "10K",
  participantHash: "f".repeat(64),
  salt: "a".repeat(64),
  totpSecret: SECRET,
  txHash: "d".repeat(64),
  runner: "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR",
  enteredAt: "2026-09-15T12:00:00.000Z",
  city: "Kupang",
};

/**
 * jsdom has no network, so being offline is simulated by redefining the
 * property the hook reads, and put back afterwards.
 *
 * Deliberately not `vi.spyOn(navigator, "onLine", "get")`: restoring a getter
 * jsdom defines as a plain value does not reliably work, and a `navigator
 * .onLine` that throws takes the whole render down with it. That killed every
 * test after the offline one in this file, which read as four broken states
 * rather than one broken stub.
 */
function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
}

function renderPass() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<PassPage tokenId={7} />, { wrapper });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(INSIDE_THE_STEP);
  readEntry.mockReset();
  recordOf.mockReset();
  rememberPassFacts.mockClear();
  readEntry.mockResolvedValue(stored);
  recordOf.mockResolvedValue({ tokenId: 7, eventId: 13, categoryId: 1, bibNo: 128, state: "Entered", claimedAt: null });
  // The runner's own wallet, connected: the pass itself never asks for it, but
  // the screen for a phone that did not enter is behind WalletGate.
  useWallet.setState({ address: stored.runner, isRestoring: false, isConnecting: false, error: null });
});
afterEach(() => {
  setOnline(true);
  vi.useRealTimers();
});

describe("the pass", () => {
  describe("positive", () => {
    it("shows the race, the bib and a code a volunteer can read", async () => {
      renderPass();

      expect(await screen.findByText("Sasando Run 2026")).toBeInTheDocument();
      expect(screen.getByText("Bib 128")).toBeInTheDocument();
      // The name leads, because it is what a volunteer matches to the person in
      // front of them. The number stays under it: the manual fallback at the
      // desk asks for the code and the bib number.
      expect(screen.getByText("SARI")).toBeInTheDocument();
      expect(screen.getByText("10K")).toBeInTheDocument();
      expect(screen.getByText("Kupang")).toBeInTheDocument();
      expect(screen.getByText("Entered")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText("Check-in code 079663")).toBeInTheDocument());
      expect(screen.getByTestId("qr")).toHaveTextContent('{"t":7,"s":59070111,"c":"079663"}');
    });

    it("keeps what the chain said, so the next visit is right without a signal", async () => {
      renderPass();
      await screen.findByText("Sasando Run 2026");

      await waitFor(() =>
        expect(rememberPassFacts).toHaveBeenCalledWith(
          7,
          expect.objectContaining({ state: "Entered", bibNo: 128 }),
        ),
      );
    });
  });

  describe("edge", () => {
    it("keeps the code and nothing else under the QR, through a rollover", async () => {
      renderPass();
      await screen.findByText("Sasando Run 2026");

      // The step has just begun, so 26 seconds leaves four: the last stretch,
      // where the mockup put a note about codes caught mid-change.
      await act(async () => {
        vi.advanceTimersByTime(26_000);
      });

      expect(screen.queryByText("A code that just changed still works")).not.toBeInTheDocument();
      expect(screen.getByText("Or use the code")).toBeInTheDocument();
    });

    it("reassures rather than alarms when the signal goes", async () => {
      renderPass();
      await screen.findByText("Sasando Run 2026");

      await act(async () => {
        setOnline(false);
        window.dispatchEvent(new Event("offline"));
      });

      expect(await screen.findByText("Offline. Your pass still works")).toBeInTheDocument();
      // The code is still there: nothing on this page needed the network.
      expect(screen.getByLabelText("Check-in code 079663")).toBeInTheDocument();

      // And it goes when the signal comes back, rather than sitting there all
      // day. Restored inside the test, so the world is as it was found.
      await act(async () => {
        setOnline(true);
        window.dispatchEvent(new Event("online"));
      });

      expect(screen.queryByText("Offline. Your pass still works")).not.toBeInTheDocument();
    });

    it("draws itself from this device when the chain cannot be read", async () => {
      recordOf.mockRejectedValue(new Error("offline"));
      readEntry.mockResolvedValue({ ...stored, state: "Entered" });
      renderPass();

      expect(await screen.findByText("Sasando Run 2026")).toBeInTheDocument();
      expect(screen.getByText("Bib 128")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText("Check-in code 079663")).toBeInTheDocument());
    });
  });

  describe("negative", () => {
    it("stops making codes once the race pack is collected", async () => {
      recordOf.mockResolvedValue({
        tokenId: 7,
        eventId: 13,
        categoryId: 1,
        bibNo: 128,
        state: "RacepackClaimed",
        claimedAt: BigInt(Date.UTC(2026, 8, 27, 2, 41) / 1000),
      });
      renderPass();

      expect(await screen.findByText("Race pack collected")).toBeInTheDocument();
      expect(screen.getByText("Race pack claimed")).toBeInTheDocument();
      expect(screen.queryByTestId("qr")).not.toBeInTheDocument();
      expect(screen.queryByText("Or use the code")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "View race record" })).toHaveAttribute(
        "href",
        "/events/13/entered/7",
      );
    });

    it("offers to fetch the pass when this device did not enter", async () => {
      readEntry.mockResolvedValue(undefined);
      renderPass();

      expect(
        await screen.findByRole("heading", { name: "Get your pass on this phone" }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("qr")).not.toBeInTheDocument();
    });
  });
});
