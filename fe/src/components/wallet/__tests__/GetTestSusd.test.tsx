/**
 * Get test sUSD: a trustline only when the wallet needs one, then the faucet,
 * with a sentence for each answer. Testnet only.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const network = vi.hoisted(() => ({ testnet: true }));
const readSusdBalance = vi.hoisted(() => vi.fn());
const addSusdTrustline = vi.hoisted(() => vi.fn());
const requestTestSusd = vi.hoisted(() => vi.fn());

vi.mock("@/lib/chain/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chain/env")>();
  return {
    ...actual,
    get IS_TESTNET() {
      return network.testnet;
    },
  };
});
vi.mock("@/lib/wallet/susd", () => ({ readSusdBalance, addSusdTrustline, requestTestSusd }));
vi.mock("@/lib/wallet/kit", () => ({ signMessage: vi.fn(), signTransaction: vi.fn() }));

import { GetTestSusd } from "@/components/wallet/GetTestSusd";

const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";

function renderButton(onFunded = vi.fn()) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = render(<GetTestSusd address={RUNNER} onFunded={onFunded} />, { wrapper });
  return { ...view, onFunded };
}

beforeEach(() => {
  network.testnet = true;
  readSusdBalance.mockReset();
  addSusdTrustline.mockReset();
  requestTestSusd.mockReset();
  readSusdBalance.mockResolvedValue({ kind: "balance", stroops: 0n });
  addSusdTrustline.mockResolvedValue(undefined);
  requestTestSusd.mockResolvedValue({ kind: "sent" });
});

describe("GetTestSusd", () => {
  it("opens a trustline first when the wallet cannot hold sUSD, then asks the faucet", async () => {
    const user = userEvent.setup();
    readSusdBalance.mockResolvedValue({ kind: "no-trustline" });
    const { onFunded } = renderButton();

    await user.click(screen.getByRole("button", { name: "Get test sUSD" }));

    expect(await screen.findByText("Test sUSD added.")).toBeInTheDocument();
    expect(addSusdTrustline).toHaveBeenCalledWith(RUNNER, expect.any(Function));
    expect(requestTestSusd).toHaveBeenCalledWith(RUNNER, expect.any(Function));
    expect(onFunded).toHaveBeenCalledTimes(1);
  });

  it("also sets up a wallet that was never funded", async () => {
    const user = userEvent.setup();
    readSusdBalance.mockResolvedValue({ kind: "no-account" });
    renderButton();
    await user.click(screen.getByRole("button", { name: "Get test sUSD" }));
    await screen.findByText("Test sUSD added.");
    expect(addSusdTrustline).toHaveBeenCalledTimes(1);
  });

  it("skips the trustline when the wallet already holds sUSD", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole("button", { name: "Get test sUSD" }));
    await screen.findByText("Test sUSD added.");
    expect(addSusdTrustline).not.toHaveBeenCalled();
  });

  it.each([
    ["rate-limited", "You already got test sUSD today. Try again tomorrow."],
    ["empty", "Test sUSD has run out. Tell the Sterun team."],
    ["unavailable", "Test sUSD is not available yet."],
    ["unconfirmed", "Test sUSD was sent but is not confirmed yet. Check your balance in a minute before asking again."],
    ["no-trustline", "Your wallet cannot hold test sUSD yet. Press Get test sUSD again to set it up."],
  ])("says so when the faucet answers %s, and reports no funding", async (kind, sentence) => {
    const user = userEvent.setup();
    requestTestSusd.mockResolvedValue({ kind });
    const { onFunded } = renderButton();

    await user.click(screen.getByRole("button", { name: "Get test sUSD" }));

    expect(await screen.findByText(sentence)).toBeInTheDocument();
    expect(onFunded).not.toHaveBeenCalled();
  });

  it("reads a declined wallet prompt as a cancellation", async () => {
    const user = userEvent.setup();
    readSusdBalance.mockResolvedValue({ kind: "no-trustline" });
    addSusdTrustline.mockRejectedValue(new Error("User declined access"));
    renderButton();

    await user.click(screen.getByRole("button", { name: "Get test sUSD" }));

    expect(await screen.findByText("You declined this in your wallet. Nothing was sent.")).toBeInTheDocument();
    expect(requestTestSusd).not.toHaveBeenCalled();
  });

  it("renders nothing off the test network", () => {
    network.testnet = false;
    const { container } = renderButton();
    expect(container).toBeEmptyDOMElement();
  });
});
