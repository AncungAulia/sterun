import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useAddCategory,
  useAddScanner,
  useCreateEvent,
  useRemoveScanner,
  useSetEventStatus,
} from "@/hooks/useOrganiser";
import { useWallet } from "@/hooks/useWallet";

const createEvent = vi.hoisted(() => vi.fn(async () => ({ value: 4, txHash: "t", ledger: 1 })));
const addCategory = vi.hoisted(() => vi.fn(async () => ({ value: 0, txHash: "t", ledger: 1 })));
const setEventStatus = vi.hoisted(() =>
  vi.fn(async () => ({ value: undefined, txHash: "t", ledger: 1 })),
);
const addScanner = vi.hoisted(() =>
  vi.fn(async () => ({ value: undefined, txHash: "t", ledger: 1 })),
);
const removeScanner = vi.hoisted(() =>
  vi.fn(async () => ({ value: undefined, txHash: "t", ledger: 1 })),
);

vi.mock("@/lib/sterun", () => ({
  readClient: { createEvent, addCategory, setEventStatus, addScanner, removeScanner },
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

const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const SCANNER = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useWallet.setState({ address: ORGANISER, isRestoring: false });
});

describe("organiser actions", () => {
  describe("positive", () => {
    it("creates the event as the connected wallet, without asking who that is", async () => {
      // The organiser argument is the address that authorizes, and it is also
      // the only address that will ever be able to change this event. Reading
      // it from the connected wallet rather than from a form field removes the
      // one typo nobody could recover from.
      const { result } = renderHook(() => useCreateEvent(), { wrapper: wrapper() });

      await act(async () => {
        await result.current.write({
          name: "Sterun Demo Run",
          metadataHash: "a".repeat(64),
          uri: "https://example.test/e.json",
          startsAt: 1_791_068_400n,
        });
      });

      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ organiser: ORGANISER, name: "Sterun Demo Run" }),
        expect.objectContaining({ publicKey: ORGANISER }),
      );
    });

    it("adds a category with its price in stroops", async () => {
      const { result } = renderHook(() => useAddCategory(), { wrapper: wrapper() });

      await act(async () => {
        await result.current.write({
          eventId: 4,
          code: "10K",
          distanceM: 10_000,
          quota: 50,
          priceStroops: 250_000_000n,
        });
      });

      expect(addCategory).toHaveBeenCalledWith(
        { eventId: 4, code: "10K", distanceM: 10_000, quota: 50, priceStroops: 250_000_000n },
        expect.anything(),
      );
    });

    it("opens an event", async () => {
      const { result } = renderHook(() => useSetEventStatus(), { wrapper: wrapper() });

      await act(async () => {
        await result.current.write({ eventId: 4, status: "Open" });
      });

      expect(setEventStatus).toHaveBeenCalledWith(4, "Open", expect.anything());
    });

    it("adds and removes a scanner", async () => {
      const add = renderHook(() => useAddScanner(), { wrapper: wrapper() });
      await act(async () => {
        await add.result.current.write({ eventId: 4, scanner: SCANNER });
      });

      const remove = renderHook(() => useRemoveScanner(), { wrapper: wrapper() });
      await act(async () => {
        await remove.result.current.write({ eventId: 4, scanner: SCANNER });
      });

      expect(addScanner).toHaveBeenCalledWith(4, SCANNER, expect.anything());
      expect(removeScanner).toHaveBeenCalledWith(4, SCANNER, expect.anything());
    });
  });

  describe("negative", () => {
    it("does not reach the chain with no wallet connected", async () => {
      useWallet.setState({ address: null, isRestoring: false });
      const { result } = renderHook(() => useCreateEvent(), { wrapper: wrapper() });

      await act(async () => {
        await result.current
          .write({ name: "x", metadataHash: "a".repeat(64), uri: "", startsAt: 1n })
          .catch(() => {});
      });

      expect(createEvent).not.toHaveBeenCalled();
    });
  });
});
