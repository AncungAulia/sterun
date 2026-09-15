import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useChainWrite } from "@/hooks/useChainWrite";
import { useWallet } from "@/hooks/useWallet";

vi.mock("@/lib/wallet", () => ({
  initWallet: vi.fn(),
  restoreAddress: vi.fn(async () => null),
  onWalletStateChange: vi.fn(() => () => {}),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signTransaction: vi.fn(async (xdr: string) => ({ signedTxXdr: `signed:${xdr}` })),
  walletErrorMessage: (e: unknown) => (e instanceof Error ? e.message : "Wallet request failed."),
}));

const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** A promise the test resolves when it chooses, so phases can be observed. */
function gate() {
  let open!: (value?: unknown) => void;
  const promise = new Promise((resolve) => {
    open = resolve as (value?: unknown) => void;
  });
  return { promise, open };
}

function connect(address: string | null) {
  useWallet.setState({ address, isRestoring: false });
}

beforeEach(() => connect(ORGANISER));

describe("useChainWrite", () => {
  describe("positive", () => {
    it("acts as the connected wallet", async () => {
      const run = vi.fn(async () => ({ value: 7, txHash: "abc", ledger: 1 }));

      const { result } = renderHook(() => useChainWrite(run), { wrapper: wrapper() });
      await act(async () => {
        await result.current.write({ name: "Race" });
      });

      expect(run).toHaveBeenCalledWith(
        { name: "Race" },
        expect.objectContaining({ publicKey: ORGANISER }),
      );
    });

    it("hands back the transaction hash, which is the evidence", async () => {
      const run = vi.fn(async () => ({ value: 7, txHash: "deadbeef", ledger: 9 }));

      const { result } = renderHook(() => useChainWrite(run), { wrapper: wrapper() });
      await act(async () => {
        await result.current.write(undefined);
      });

      await waitFor(() => expect(result.current.data?.txHash).toBe("deadbeef"));
    });
  });

  describe("edge", () => {
    it("waiting for the wallet and waiting for the chain are different states", async () => {
      // ARCHITECTURE.md §4.5: one of them is waiting for the user and the other
      // is waiting for the network, and telling a person "confirm in your
      // wallet" while the wallet is already done is how a page looks broken.
      const wallet = gate();
      const chain = gate();
      const run = vi.fn(async (_args: unknown, actor: { signTransaction?: unknown }) => {
        await wallet.promise;
        await (actor.signTransaction as (xdr: string) => Promise<unknown>)("xdr");
        await chain.promise;
        return { value: 0, txHash: "abc", ledger: 1 };
      });

      const { result } = renderHook(() => useChainWrite(run), { wrapper: wrapper() });
      let done!: Promise<unknown>;
      act(() => {
        done = result.current.write(undefined);
      });

      await waitFor(() => expect(result.current.phase).toBe("signing"));
      await act(async () => {
        wallet.open();
        await Promise.resolve();
      });
      await waitFor(() => expect(result.current.phase).toBe("confirming"));

      await act(async () => {
        chain.open();
        await done;
      });
      expect(result.current.phase).toBe("idle");
    });

    it("starts idle", () => {
      const { result } = renderHook(() => useChainWrite(vi.fn()), { wrapper: wrapper() });

      expect(result.current.phase).toBe("idle");
      expect(result.current.isBusy).toBe(false);
    });
  });

  describe("negative", () => {
    it("refuses to build a transaction with no wallet connected", async () => {
      // Not a wallet prompt: there is nothing to prompt. The SDK would build
      // and simulate the call for `undefined`, which fails much later and much
      // less clearly.
      connect(null);
      const run = vi.fn();

      const { result } = renderHook(() => useChainWrite(run), { wrapper: wrapper() });
      await act(async () => {
        await result.current.write(undefined).catch(() => {});
      });

      expect(run).not.toHaveBeenCalled();
      await waitFor(() => expect(result.current.error?.message).toMatch(/wallet/i));
    });

    it("returns to idle after a failure, so the button is usable again", async () => {
      const run = vi.fn(async () => {
        throw new Error("user declined");
      });

      const { result } = renderHook(() => useChainWrite(run), { wrapper: wrapper() });
      await act(async () => {
        await result.current.write(undefined).catch(() => {});
      });

      await waitFor(() => expect(result.current.error).toBeTruthy());
      expect(result.current.phase).toBe("idle");
      expect(result.current.isBusy).toBe(false);
    });
  });
});
