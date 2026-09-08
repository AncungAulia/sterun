/**
 * The app shell has to supply a QueryClient before any page can read the chain.
 * Without one, every read hook throws at render, which is a whole-app failure
 * from a one-line omission.
 */
import { useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Providers } from "../app/providers";

vi.mock("@/lib/wallet", () => ({
  initWallet: vi.fn(),
  restoreAddress: vi.fn(async () => null),
  onWalletStateChange: vi.fn(() => () => {}),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  walletErrorMessage: (e: unknown) => String(e),
}));

function Reader() {
  const { data } = useQuery({ queryKey: ["probe"], queryFn: async () => "read" });
  return <p>{data ?? "pending"}</p>;
}

describe("Providers", () => {
  describe("positive", () => {
    it("lets a child run a query", async () => {
      render(
        <Providers>
          <Reader />
        </Providers>,
      );

      await waitFor(() => expect(screen.getByText("read")).toBeInTheDocument());
    });

    it("renders its children", () => {
      render(
        <Providers>
          <p>child</p>
        </Providers>,
      );

      expect(screen.getByText("child")).toBeInTheDocument();
    });
  });
});
