import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WalletButton } from "@/components/wallet/WalletButton";

const connect = vi.fn();
const disconnect = vi.fn();

let state = {
  address: null as string | null,
  isRestoring: false,
  isConnecting: false,
  error: null as string | null,
  connect,
  disconnect,
};

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => state,
}));
/*
  STE-21: the menu shows the sUSD balance and Get test sUSD. Both are stubbed:
  the balance is a chain read, and the button has its own test file.
*/
vi.mock("@/hooks/useSusdBalance", () => ({
  useSusdBalance: () => ({ data: { kind: "balance", stroops: 200_000_000n }, isPending: false }),
}));
vi.mock("@/components/wallet/GetTestSusd", () => ({
  GetTestSusd: () => <button type="button">Get test sUSD</button>,
}));

const ADDRESS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    address: null,
    isRestoring: false,
    isConnecting: false,
    error: null,
    connect,
    disconnect,
  };
});

describe("while restoring", () => {
  it("shows no connect prompt, because the session may still be live", () => {
    // The kit can only start in an effect, so there is a moment where the
    // address is unknown. Rendering "Connect wallet" there reads as a dropped
    // session to somebody who is in fact connected.
    state.isRestoring = true;
    render(<WalletButton />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("disconnected", () => {
  it("offers to connect", () => {
    render(<WalletButton />);

    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
  });

  it("connects when clicked", async () => {
    render(<WalletButton />);

    await userEvent.click(screen.getByRole("button", { name: "Connect wallet" }));

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("disables itself and says what it is waiting for", () => {
    state.isConnecting = true;
    render(<WalletButton />);

    const button = screen.getByRole("button", { name: "Waiting for wallet..." });
    expect(button).toBeDisabled();
  });

  it("announces an error to assistive technology", () => {
    state.error = "User declined access";
    render(<WalletButton />);

    expect(screen.getByRole("alert")).toHaveTextContent("User declined access");
  });
});

describe("connected", () => {
  beforeEach(() => {
    state.address = ADDRESS;
  });

  it("shows the address truncated at both ends", () => {
    render(<WalletButton />);

    expect(screen.getByRole("link", { name: /GAAZ…CWN7/ })).toBeInTheDocument();
  });

  it("opens the wallet's own page rather than a menu (Ancung, 2026-09-23)", async () => {
    // The popover held the address, the record, the balance, the faucet and
    // Disconnect, none of which could be linked to, and not the pass, which is
    // what a runner comes back for. All of it is at /profile now.
    render(<WalletButton />);

    expect(screen.getByRole("link", { name: /GAAZ…CWN7/ })).toHaveAttribute("href", "/profile");
    await userEvent.click(screen.getByRole("link", { name: /GAAZ…CWN7/ }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("marks the address with tabular figures so it does not jitter", () => {
    render(<WalletButton />);

    expect(screen.getByText("GAAZ…CWN7")).toHaveClass("numeric");
  });
});
