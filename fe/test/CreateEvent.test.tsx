import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateEvent } from "@/modules/organiser/CreateEvent";
import { useWallet } from "@/hooks/useWallet";

const createEvent = vi.hoisted(() => vi.fn(async () => ({ value: 4, txHash: "tx1", ledger: 1 })));
const addCategory = vi.hoisted(() => vi.fn(async () => ({ value: 0, txHash: "tx2", ledger: 1 })));
const setEventStatus = vi.hoisted(() =>
  vi.fn(async () => ({ value: undefined, txHash: "tx3", ledger: 1 })),
);
const fetchEventMetadata = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sterun", () => ({ readClient: { createEvent, addCategory, setEventStatus } }));
vi.mock("@/lib/metadata", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/metadata")>()),
  fetchEventMetadata,
}));
vi.mock("@/lib/wallet", () => ({
  initWallet: vi.fn(),
  restoreAddress: vi.fn(async () => null),
  onWalletStateChange: vi.fn(() => () => {}),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signTransaction: vi.fn(async (xdr: string) => ({ signedTxXdr: xdr })),
  walletErrorMessage: (e: unknown) => String(e),
}));

/**
 * These drive the whole wizard through real clicks, and filling the details
 * step alone now opens and closes three calendars. That is comfortably over
 * vitest's five second default once the suite runs files in parallel, and a
 * timeout there says nothing about the code.
 */
vi.setConfig({ testTimeout: 20_000 });

const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { user: userEvent.setup(), ...render(<CreateEvent />, { wrapper: Wrapper }) };
}

/** Fill the two required fields and move on to the document step. */
async function fillDetails(user: ReturnType<typeof userEvent.setup>, name = "Jakarta Sunrise 10K") {
  await user.type(screen.getByLabelText(/Event name/), name);
  // Dates come from the calendar now, the way an organiser sets them. The clock
  // is frozen in beforeEach so the calendar always opens on the month these
  // clicks expect.
  for (const field of ["Start date", "Registration opens date", "Registration closes date"]) {
    await user.click(screen.getByRole("button", { name: field }));
    await user.click(screen.getByRole("button", { name: /September 28th, 2026/ }));
  }
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

beforeEach(() => {
  vi.setSystemTime(new Date("2026-09-07T00:00:00Z"));
  vi.clearAllMocks();
  fetchEventMetadata.mockResolvedValue({ status: "unavailable", reason: "not reachable" });
  useWallet.setState({ address: ORGANISER, isRestoring: false, isConnecting: false, error: null });
});

afterEach(() => vi.useRealTimers());

describe("CreateEvent", () => {
  describe("positive", () => {
    it("creates the event with the document it verified", async () => {
      const { user } = renderWizard();
      await fillDetails(user);

      fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });
      await user.type(screen.getByLabelText("Published URL"), "https://example.test/e.json");
      await user.click(screen.getByRole("button", { name: /check the published file/i }));
      await screen.findByText("Checked");
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await user.click(screen.getByRole("button", { name: "Create event" }));

      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Jakarta Sunrise 10K",
          uri: "https://example.test/e.json",
          metadataHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
        expect.anything(),
      );
    });

    it("walks through to an open event", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await user.click(screen.getByRole("button", { name: /create without a document/i }));
      await user.click(screen.getByRole("button", { name: "Create event" }));

      expect(await screen.findByText(/write that number down/i)).toBeInTheDocument();

      await user.type(screen.getByLabelText("Code"), "10K");
      await user.type(screen.getByLabelText("Distance in kilometres"), "10");
      await user.type(screen.getByLabelText("Places"), "300");
      await user.type(screen.getByLabelText("Entry fee in sUSD"), "25");
      await user.click(screen.getByRole("button", { name: "Add category" }));
      await screen.findByText("Added");

      await user.click(screen.getByRole("button", { name: "Continue" }));
      await user.click(screen.getByRole("button", { name: "Open for entries" }));

      expect(await screen.findByText(/the event is open/i)).toBeInTheDocument();
      expect(setEventStatus).toHaveBeenCalledWith(4, "Open", expect.anything());
    });

    it("passes the price through as stroops, not as a decimal", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await user.click(screen.getByRole("button", { name: /create without a document/i }));
      await user.click(screen.getByRole("button", { name: "Create event" }));
      await screen.findByText(/write that number down/i);

      await user.type(screen.getByLabelText("Code"), "FUN5K");
      await user.type(screen.getByLabelText("Distance in kilometres"), "5");
      await user.type(screen.getByLabelText("Places"), "100");
      await user.type(screen.getByLabelText("Entry fee in sUSD"), "15.5");
      await user.click(screen.getByRole("button", { name: "Add category" }));

      await screen.findByText("Added");
      expect(addCategory).toHaveBeenCalledWith(
        expect.objectContaining({ priceStroops: 155_000_000n, distanceM: 5_000 }),
        expect.anything(),
      );
    });
  });

  describe("edge", () => {
    it("asks for a wallet before showing the wizard at all", () => {
      useWallet.setState({ address: null, isRestoring: false });

      renderWizard();

      expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
      expect(screen.queryByLabelText(/Event name/)).not.toBeInTheDocument();
    });

    it("will not move on without a name and a start time", async () => {
      const { user } = renderWizard();

      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

      await user.type(screen.getByLabelText(/Event name/), "Only a name");
      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    });

    it("will not create an event with an unverified document", async () => {
      const { user } = renderWizard();
      await fillDetails(user);

      // The URL is typed but never checked. Continuing here would commit a hash
      // for bytes nobody has fetched, and the hash cannot be changed later.
      await user.type(screen.getByLabelText("Published URL"), "https://example.test/e.json");

      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    });

    it("un-verifies the document when a detail changes after checking it", async () => {
      // The bytes are different now, so the URL that was checked a moment ago
      // serves something else. This is the mistake that would otherwise ship a
      // permanently broken event.
      const { user } = renderWizard();
      await fillDetails(user);

      fetchEventMetadata.mockResolvedValue({ status: "verified", document: {} });
      await user.type(screen.getByLabelText("Published URL"), "https://example.test/e.json");
      await user.click(screen.getByRole("button", { name: /check the published file/i }));
      await screen.findByText("Checked");

      await user.click(screen.getByRole("button", { name: "Back" }));
      await user.type(screen.getByLabelText(/^Location$/), "Somewhere else");
      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(screen.queryByText("Checked")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    });

    it("creates an event with no document when told to", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await user.click(screen.getByRole("button", { name: /create without a document/i }));
      await user.click(screen.getByRole("button", { name: "Create event" }));

      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ uri: "", metadataHash: "0".repeat(64) }),
        expect.anything(),
      );
    });

    it("will not open an event that has no categories", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await user.click(screen.getByRole("button", { name: /create without a document/i }));
      await user.click(screen.getByRole("button", { name: "Create event" }));
      await screen.findByText(/write that number down/i);

      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
      expect(screen.getByText(/add at least one category/i)).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("keeps the categories already on chain when the next one fails", async () => {
      const { user } = renderWizard();
      await fillDetails(user);
      await user.click(screen.getByRole("button", { name: /create without a document/i }));
      await user.click(screen.getByRole("button", { name: "Create event" }));
      await screen.findByText(/write that number down/i);

      await user.type(screen.getByLabelText("Code"), "10K");
      await user.type(screen.getByLabelText("Distance in kilometres"), "10");
      await user.type(screen.getByLabelText("Places"), "300");
      await user.click(screen.getByRole("button", { name: "Add category" }));
      await screen.findByText("Added");

      addCategory.mockRejectedValueOnce(new Error("user declined"));
      await user.type(screen.getByLabelText("Code"), "5K");
      await user.type(screen.getByLabelText("Distance in kilometres"), "5");
      await user.type(screen.getByLabelText("Places"), "100");
      await user.click(screen.getByRole("button", { name: "Add category" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/not added/i);
      expect(screen.getByText("10K")).toBeInTheDocument();
    });

    it("refuses a category code the contract would reject, without spending a signature", async () => {
      // Symbol accepts letters, digits and underscore. A revert would cost a
      // wallet prompt and a wait to learn what a regex answers instantly.
      const { user } = renderWizard();
      await fillDetails(user);
      await user.click(screen.getByRole("button", { name: /create without a document/i }));
      await user.click(screen.getByRole("button", { name: "Create event" }));
      await screen.findByText(/write that number down/i);

      await user.type(screen.getByLabelText("Code"), "10 K!");
      await user.type(screen.getByLabelText("Distance in kilometres"), "10");
      await user.type(screen.getByLabelText("Places"), "300");
      await user.click(screen.getByRole("button", { name: "Add category" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/letters, digits and underscores/i);
      expect(addCategory).not.toHaveBeenCalled();
    });
  });
});
