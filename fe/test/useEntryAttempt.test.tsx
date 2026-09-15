/**
 * Sign and pay against injected stand-ins for the vault, the wallet and the
 * chain, so every failure row runs without a network or a signature.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/wallet", () => ({ signMessage: vi.fn(), signTransaction: vi.fn() }));
vi.mock("@/lib/sterun", () => ({ readClient: {} }));

import { useEntryAttempt, type EntryAttemptDeps, type EntryPlan } from "@/hooks/useEntryAttempt";
import type { ChainAfter } from "@/modules/entry/enter-failure";

const RUNNER = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const TX = "d".repeat(64);

const submitted = {
  participantId: "6f1c9a52-3c1b-4b5e-9d0e-2a1f3b4c5d6e",
  participantHash: "a".repeat(64),
  salt: "b".repeat(64),
  totpSecret: "c".repeat(64),
};

const plan = {
  runner: RUNNER,
  summary: {
    event: {
      eventId: 5,
      organiser: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
      name: "Jogja 10K",
      metadataHash: "a".repeat(64),
      uri: "",
      startsAt: 1_790_548_200n,
      status: "Open",
    },
    categories: [
      {
        eventId: 5,
        categoryId: 0,
        code: "10K",
        distanceM: 10_000,
        quota: 9,
        enteredCount: 1,
        priceStroops: 0n,
        slotsLeft: 8,
      },
    ],
  },
  categoryId: 0,
  basket: { pack: [], extras: [] },
  selection: { sizes: {}, extras: [] },
  body: { bib_name: "SARI" },
  total: 0n,
} as unknown as EntryPlan;

const record = { tokenId: 7, eventId: 5, categoryId: 0, bibNo: 1 };

const soldOut: ChainAfter = {
  status: "Open",
  slotsLeft: 0,
  soldOutAddOns: [],
  balance: { kind: "no-account" },
  total: 0n,
};

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

function deps(overrides: Partial<EntryAttemptDeps> = {}) {
  return {
    submit: vi.fn(async () => submitted),
    confirm: vi.fn(async () => {}),
    enter: vi.fn(async () => ({ value: 7, txHash: TX, ledger: 1 })),
    recordsOf: vi.fn(async () => [record]),
    chainAfter: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    markConfirmed: vi.fn(async () => {}),
    checkWindowMs: 60,
    checkIntervalMs: 10,
    ...overrides,
  } as unknown as EntryAttemptDeps & Record<string, ReturnType<typeof vi.fn>>;
}

function start(d: ReturnType<typeof deps>) {
  const hook = renderHook(() => useEntryAttempt(plan, d), { wrapper });
  act(() => hook.result.current.start());
  return hook;
}

describe("useEntryAttempt", () => {
  it("submits, pays with the vault's hash, saves the receipt and confirms", async () => {
    const d = deps();
    const { result } = start(d);

    await waitFor(() => expect(result.current.state).toEqual({ phase: "entered", tokenId: 7 }));

    expect(d.submit).toHaveBeenCalledTimes(1);
    expect(d.enter).toHaveBeenCalledWith(
      { runner: RUNNER, eventId: 5, categoryId: 0, addOnIds: [], participantHash: "a".repeat(64) },
      expect.objectContaining({ publicKey: RUNNER }),
    );
    expect(d.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 7,
        bibNo: 1,
        bibName: "SARI",
        raceName: "Jogja 10K",
        distanceCode: "10K",
        salt: "b".repeat(64),
        totpSecret: "c".repeat(64),
        txHash: TX,
        confirmed: false,
        participantId: submitted.participantId,
        // What the receipt prints (mockup block 6).
        racePack: [],
        paidStroops: "0",
      }),
    );
    await waitFor(() => expect(d.markConfirmed).toHaveBeenCalledWith(7));
    expect(d.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ participantId: submitted.participantId, tokenId: 7, txHash: TX }),
    );
  });

  it("links the entry inside the attempt, and is not entered until that answers", async () => {
    // A third approval in the dialog, not a prompt on the success page.
    const d = deps({ confirm: vi.fn(() => new Promise<void>(() => {})) });
    const { result } = start(d);

    await waitFor(() => expect(result.current.state.phase).toBe("linking"));
    expect(d.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ participantId: submitted.participantId, tokenId: 7, txHash: TX }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(result.current.state.phase).toBe("linking");
    expect(result.current.running).toBe(true);
  });

  it("does not resend details when paying is tried again after a decline", async () => {
    const enter = vi
      .fn()
      .mockRejectedValueOnce(new Error("User declined the request"))
      .mockResolvedValueOnce({ value: 7, txHash: TX, ledger: 1 });
    const d = deps({ enter });
    const { result } = start(d);

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ phase: "failed", failure: { kind: "declined" } }),
    );
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.phase).toBe("entered"));

    expect(d.submit).toHaveBeenCalledTimes(1);
    expect(enter).toHaveBeenCalledTimes(2);
  });

  it("does not re-read the chain for a decline, which is not a refusal", async () => {
    const d = deps({ enter: vi.fn(async () => Promise.reject(new Error("User declined"))) });
    const { result } = start(d);

    await waitFor(() => expect(result.current.state.phase).toBe("failed"));
    expect(d.chainAfter).not.toHaveBeenCalled();
  });

  it("reports a declined identity step without paying", async () => {
    const d = deps({ submit: vi.fn(async () => Promise.reject(new Error("User rejected"))) });
    const { result } = start(d);

    await waitFor(() =>
      expect(result.current.state).toEqual({
        phase: "failed",
        submitted: null,
        failure: { kind: "declined" },
      }),
    );
    expect(d.enter).not.toHaveBeenCalled();
  });

  it("explains a refusal from the chain afterwards", async () => {
    const d = deps({
      enter: vi.fn(async () => Promise.reject(new Error("enter reverted with Error(Contract, #5)"))),
      chainAfter: vi.fn(async () => soldOut),
    });
    const { result } = start(d);

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ phase: "failed", failure: { kind: "sold-out" } }),
    );
  });

  it("says the plain sentence when the chain cannot be re-read", async () => {
    const d = deps({
      enter: vi.fn(async () => Promise.reject(new Error("enter reverted"))),
      chainAfter: vi.fn(async () => Promise.reject(new Error("offline"))),
    });
    const { result } = start(d);

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ phase: "failed", failure: { kind: "other" } }),
    );
  });

  it("finds an entry that went through without an answer, and saves it", async () => {
    const d = deps({
      enter: vi.fn(async () => Promise.reject(new Error("enter returned no transaction hash"))),
    });
    const { result } = start(d);

    await waitFor(() => expect(result.current.state).toEqual({ phase: "entered", tokenId: 7 }));
    expect(d.save).toHaveBeenCalledWith(expect.objectContaining({ tokenId: 7, txHash: "" }));
    // No hash came back, so there is nothing to confirm the vault row with.
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it("says it did not go through when no record appears in time", async () => {
    const d = deps({
      enter: vi.fn(async () => Promise.reject(new Error("enter returned no transaction hash"))),
      recordsOf: vi.fn(async () => []),
    });
    const { result } = start(d);

    await waitFor(() => expect(result.current.state.phase).toBe("not-through"));
    expect(vi.mocked(d.recordsOf).mock.calls.length).toBeGreaterThan(1);
  });

  it("says it could not check when the read fails, and checks again on request", async () => {
    const recordsOf = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([record]);
    const d = deps({
      enter: vi.fn(async () => Promise.reject(new Error("enter returned no transaction hash"))),
      recordsOf,
    });
    const { result } = start(d);

    await waitFor(() => expect(result.current.state.phase).toBe("check-failed"));
    act(() => result.current.checkAgain());
    await waitFor(() => expect(result.current.state).toEqual({ phase: "entered", tokenId: 7 }));
    expect(d.enter).toHaveBeenCalledTimes(1);
  });

  it("still enters when confirming fails, and leaves the entry unconfirmed", async () => {
    const d = deps({ confirm: vi.fn(async () => Promise.reject(new Error("api down"))) });
    const { result } = start(d);

    await waitFor(() => expect(result.current.state.phase).toBe("entered"));
    await waitFor(() => expect(d.confirm).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(d.markConfirmed).not.toHaveBeenCalled();
  });

  it("sends details again after they change", async () => {
    const d = deps({
      enter: vi
        .fn()
        .mockRejectedValueOnce(new Error("enter reverted"))
        .mockResolvedValueOnce({ value: 7, txHash: TX, ledger: 1 }),
      chainAfter: vi.fn(async () => soldOut),
    });
    const { result } = start(d);

    await waitFor(() => expect(result.current.state.phase).toBe("failed"));
    act(() => result.current.detailsChanged());
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.phase).toBe("entered"));
    expect(d.submit).toHaveBeenCalledTimes(2);
  });

  it("does nothing without a plan", () => {
    const d = deps();
    const { result } = renderHook(() => useEntryAttempt(null, d), { wrapper });
    act(() => result.current.start());
    expect(d.submit).not.toHaveBeenCalled();
  });
});
