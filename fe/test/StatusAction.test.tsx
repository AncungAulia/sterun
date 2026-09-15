import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWallet } from "@/hooks/useWallet";
import type { EventSummary } from "@/lib/event/events";
import { StatusAction } from "@/modules/organiser/component/StatusAction";

const readClient = vi.hoisted(() => ({ setEventStatus: vi.fn() }));
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

const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";

function summary(status: EventSummary["event"]["status"]): EventSummary {
  return {
    event: {
      eventId: 4,
      organiser: ORGANISER,
      name: "Fun Run Sleman",
      metadataHash: "a".repeat(64),
      uri: "",
      // Far enough ahead that no test depends on today's date.
      startsAt: 4_000_000_000n,
      status,
    },
    categories: [],
  };
}

function renderAction(status: EventSummary["event"]["status"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<StatusAction summary={summary(status)} />, { wrapper: Wrapper });
}

beforeEach(() => {
  readClient.setEventStatus.mockReset();
  useWallet.setState({ address: ORGANISER, isRestoring: false, isConnecting: false, error: null });
});

describe("StatusAction", () => {
  describe("positive", () => {
    it("asks before opening entries, then signs and closes the dialog", async () => {
      readClient.setEventStatus.mockResolvedValue({ value: undefined, txHash: "ab", ledger: 1 });
      renderAction("Draft");

      await userEvent.click(screen.getByRole("button", { name: "Open entries" }));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("can never go back");

      await userEvent.click(screen.getByRole("button", { name: "Sign and open" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(readClient.setEventStatus).toHaveBeenCalledWith(
        4,
        "Open",
        expect.objectContaining({ publicKey: ORGANISER }),
      );
    });
  });

  describe("negative", () => {
    it("keeps the dialog open and says so when signing fails", async () => {
      readClient.setEventStatus.mockRejectedValue(new Error("boom"));
      renderAction("Open");

      await userEvent.click(screen.getByRole("button", { name: "Close entries" }));
      await userEvent.click(await screen.findByRole("button", { name: "Sign and close" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Something went wrong. Please try again.",
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("draws nothing for a race with no move to offer", () => {
      const { container } = renderAction("Completed");
      expect(container).toBeEmptyDOMElement();
    });
  });
});
