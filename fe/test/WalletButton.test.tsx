import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WalletButton } from "@/components/layouts/WalletButton";

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

    expect(screen.getByRole("button", { name: /GAAZ…CWN7/ })).toBeInTheDocument();
  });

  it("keeps the menu closed until asked", () => {
    render(<WalletButton />);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("reveals the full address in the menu, since a truncation cannot be checked", async () => {
    render(<WalletButton />);

    await userEvent.click(screen.getByRole("button", { name: /GAAZ…CWN7/ }));

    expect(screen.getByRole("menu")).toHaveTextContent(ADDRESS);
  });

  it("disconnects from the menu and closes it", async () => {
    render(<WalletButton />);
    await userEvent.click(screen.getByRole("button", { name: /GAAZ…CWN7/ }));

    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu on Escape", async () => {
    render(<WalletButton />);
    await userEvent.click(screen.getByRole("button", { name: /GAAZ…CWN7/ }));

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu when clicking outside it", async () => {
    render(
      <div>
        <WalletButton />
        <p data-testid="outside">elsewhere</p>
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: /GAAZ…CWN7/ }));

    await userEvent.click(screen.getByTestId("outside"));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("marks the address with tabular figures so it does not jitter", () => {
    render(<WalletButton />);

    expect(screen.getByText("GAAZ…CWN7")).toHaveClass("numeric");
  });
});
