/**
 * S9 and S10 with the real store (fake-indexeddb) and a stubbed chain, so the
 * rows on screen are the rows a volunteer's phone would hold.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SterunContractError, classifyContractError } from "@sterunxyz/sdk";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const wallet = vi.hoisted(() => ({
  address: "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR" as string | null,
  isConnecting: false,
  connect: vi.fn(),
}));
vi.mock("@/hooks/useWallet", () => ({
  useWallet: (select?: (state: typeof wallet) => unknown) => (select ? select(wallet) : wallet),
}));

const chain = vi.hoisted(() => ({ claimRacepack: vi.fn(), recordOf: vi.fn() }));
vi.mock("@/lib/chain/sterun", () => ({ readClient: chain }));
vi.mock("@/lib/wallet/kit", () => ({ signTransaction: vi.fn() }));

import { ClaimsPage } from "@/modules/scanner/ClaimsPage";
import { enqueueClaim, listClaims, markClaim } from "@/modules/scanner/lib/scanner-store";

let eventId = 900;

async function queue(tokenIds: number[]) {
  for (const [index, tokenId] of tokenIds.entries()) {
    await enqueueClaim({
      tokenId,
      bibNo: tokenId - 9000,
      eventId,
      scannedAt: `2026-09-27T01:00:0${index}.000Z`,
      status: "waiting",
    });
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<ClaimsPage eventId={eventId} />, { wrapper });
}

beforeEach(() => {
  eventId += 1;
  wallet.address = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
  chain.claimRacepack.mockReset();
  chain.recordOf.mockReset();
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
});

describe("waiting", () => {
  it("lists what this phone holds and offers to send it, without sending on its own", async () => {
    await queue([9128, 9133]);
    renderPage();

    expect(await screen.findByRole("heading", { name: "2 claims waiting" })).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "Claims" })).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Bib 128"),
      expect.stringContaining("Bib 133"),
    ]);
    expect(screen.getByRole("button", { name: "Send 2 claims" })).toBeInTheDocument();
    expect(chain.claimRacepack).not.toHaveBeenCalled();
  });

  it("offers no send without signal, and says they are saved", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    await queue([9141]);
    renderPage();

    expect(await screen.findByText("Saved on this phone. Send them once there is signal.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send/ })).not.toBeInTheDocument();
  });

  it("asks for a wallet before sending", async () => {
    wallet.address = null;
    await queue([9145]);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Connect wallet to send" }));
    expect(wallet.connect).toHaveBeenCalled();
  });
});

describe("sending", () => {
  it("sends with this wallet, marks each one done, and points at the refused one", async () => {
    await queue([9228, 9233]);
    chain.claimRacepack.mockImplementation(async (tokenId: number) => {
      if (tokenId === 9233) {
        throw new SterunContractError(classifyContractError(102), "claimRacepack", "Error(Contract, #102)");
      }
      return { value: undefined, txHash: "a".repeat(64), ledger: 4_469_902 };
    });
    chain.recordOf.mockResolvedValue({ claimedAt: 1_790_000_000n });

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Send 2 claims" }));

    expect(await screen.findByRole("heading", { name: "No claims waiting" })).toBeInTheDocument();
    expect(chain.claimRacepack).toHaveBeenCalledWith(9228, wallet.address, expect.objectContaining({ publicKey: wallet.address }));
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByText(/Ledger/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "1 claim was refused" })).toHaveAttribute("href", `/scan/${eventId}/flagged`);
    expect((await listClaims(eventId)).map((row) => row.status)).toEqual(["sent", "refused"]);
  });

  it("says why it stopped, and keeps the rest waiting", async () => {
    await queue([9150, 9151]);
    chain.claimRacepack.mockRejectedValue(new Error("User declined access"));

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Send 2 claims" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You declined in your wallet");
    await waitFor(() => expect(screen.getByRole("button", { name: "Send 2 claims" })).toBeInTheDocument());
    expect(chain.claimRacepack).toHaveBeenCalledTimes(1);
  });

  it("names a wallet that is not a scanner for this race", async () => {
    await queue([9160]);
    chain.claimRacepack.mockRejectedValue(
      new SterunContractError(classifyContractError(104), "claimRacepack", "Error(Contract, #104)"),
    );

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Send 1 claim" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This wallet is not a scanner for this race.");
  });

  it("shows nothing to send once everything has gone", async () => {
    await queue([9170]);
    await markClaim(9170, { status: "sent", ledger: 12 });
    renderPage();

    expect(await screen.findByRole("heading", { name: "No claims waiting" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send/ })).not.toBeInTheDocument();
  });
});
