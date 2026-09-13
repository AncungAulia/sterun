import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEventRun, type EventRunInput } from "@/hooks/useEventRun";
import { useWallet } from "@/hooks/useWallet";
import { saveRunProgress } from "@/lib/run-progress";

// This hook signs four different transactions through `useOrganiser`; none of
// them run in this file, but `useChainWrite` calls `useMutation` on render
// regardless, so the client and the wallet plumbing below exist only to let
// the hook mount without touching the network.
vi.mock("@/lib/sterun", () => ({
  readClient: {
    createEvent: vi.fn(),
    addCategory: vi.fn(),
    addAddon: vi.fn(),
    setEventStatus: vi.fn(),
  },
}));
vi.mock("@/lib/wallet", () => ({
  initWallet: vi.fn(),
  restoreAddress: vi.fn(async () => null),
  onWalletStateChange: vi.fn(() => () => {}),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signTransaction: vi.fn(async (xdr: string) => ({ signedTxXdr: xdr })),
  signMessage: vi.fn(async () => "c2ln"),
  walletErrorMessage: (e: unknown) => String(e),
}));

const WALLET = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";

const INPUT: EventRunInput = {
  name: "Jakarta Sunrise 10K",
  plan: [],
  addOns: [],
  startsAt: 1_791_068_400n,
  documentText: "{}",
  hash: "a".repeat(64),
};

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useWallet.setState({ address: WALLET, isRestoring: false });
});

describe("useEventRun resumes a saved run", () => {
  it("picks a half-finished run back up instead of publishing a second race", async () => {
    // The bug this replaces: a refresh after `create_event` landed started the
    // wizard at step one, which created another event and left the first with
    // no distances and, until the per-race console ships, no way to open it.
    saveRunProgress(WALLET, { eventId: 12, done: ["document", "event"] });

    const { result } = renderHook(() => useEventRun(INPUT), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.eventId).toBe(12));
    expect(result.current.done).toEqual(["document", "event"]);
  });

  it("starts clean when nothing was saved for this wallet", () => {
    const { result } = renderHook(() => useEventRun(INPUT), { wrapper: wrapper() });

    expect(result.current.eventId).toBeNull();
    expect(result.current.done).toEqual([]);
  });

  it("refuses to resume a run that stopped before the event existed", () => {
    // `document` only ever produces an in-memory payload (`state.document`),
    // never persisted. Restoring `done: ["document"]` with no `eventId` would
    // resume at `event`, which throws immediately because `state.document` is
    // empty, without ever calling `createEvent.write`. Since nothing landed,
    // `clearRunProgress` never runs, so every future visit by this wallet
    // would hit the same wall with no way to clear it from the screen. The
    // only safe rule is: no `eventId`, nothing to restore.
    saveRunProgress(WALLET, { eventId: null, done: ["document"] });

    const { result } = renderHook(() => useEventRun(INPUT), { wrapper: wrapper() });

    expect(result.current.eventId).toBeNull();
    expect(result.current.done).toEqual([]);
  });
});
