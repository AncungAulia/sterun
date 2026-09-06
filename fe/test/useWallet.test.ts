/**
 * The store, with lib/wallet mocked out. The behaviour worth pinning down is
 * what happens when things go wrong: a user who closes the modal must keep the
 * account they already had, and an error must not leave the button stuck in a
 * connecting state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const connectWallet = vi.fn();
const disconnectWallet = vi.fn();
const initWallet = vi.fn();
const restoreAddress = vi.fn();
const onWalletStateChange = vi.fn();

vi.mock("@/lib/wallet", () => ({
  connectWallet: () => connectWallet(),
  disconnectWallet: () => disconnectWallet(),
  initWallet: () => initWallet(),
  restoreAddress: () => restoreAddress(),
  onWalletStateChange: (cb: (a: string | null) => void) => onWalletStateChange(cb),
  walletErrorMessage: (e: unknown) => (e instanceof Error ? e.message : "Wallet request failed."),
}));

const ADDRESS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
const OTHER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

async function freshStore() {
  vi.resetModules();
  const { useWallet } = await import("@/hooks/useWallet");
  return useWallet;
}

beforeEach(() => {
  vi.clearAllMocks();
  restoreAddress.mockResolvedValue(null);
  onWalletStateChange.mockReturnValue(() => {});
});

describe("initial state", () => {
  it("starts as restoring, so the UI does not flash a connect prompt", async () => {
    const useWallet = await freshStore();

    expect(useWallet.getState().isRestoring).toBe(true);
    expect(useWallet.getState().address).toBeNull();
  });
});

describe("bootstrap", () => {
  it("starts the kit and stops restoring once the lookup settles", async () => {
    restoreAddress.mockResolvedValue(ADDRESS);
    const useWallet = await freshStore();

    useWallet.getState().bootstrap();
    await vi.waitFor(() => expect(useWallet.getState().isRestoring).toBe(false));

    expect(initWallet).toHaveBeenCalledTimes(1);
    expect(useWallet.getState().address).toBe(ADDRESS);
  });

  it("stops restoring even when nothing was connected", async () => {
    const useWallet = await freshStore();

    useWallet.getState().bootstrap();
    await vi.waitFor(() => expect(useWallet.getState().isRestoring).toBe(false));

    expect(useWallet.getState().address).toBeNull();
  });

  it("follows an account switch made in the wallet itself", async () => {
    let notify: ((address: string | null) => void) | undefined;
    onWalletStateChange.mockImplementation((cb) => {
      notify = cb;
      return () => {};
    });
    const useWallet = await freshStore();
    useWallet.getState().bootstrap();

    notify?.(OTHER);

    expect(useWallet.getState().address).toBe(OTHER);
  });

  it("returns the unsubscribe function for the effect to call", async () => {
    const unsubscribe = vi.fn();
    onWalletStateChange.mockReturnValue(unsubscribe);
    const useWallet = await freshStore();

    useWallet.getState().bootstrap()();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("connect", () => {
  it("stores the address on success and clears the connecting flag", async () => {
    connectWallet.mockResolvedValue(ADDRESS);
    const useWallet = await freshStore();

    await useWallet.getState().connect();

    expect(useWallet.getState().address).toBe(ADDRESS);
    expect(useWallet.getState().isConnecting).toBe(false);
    expect(useWallet.getState().error).toBeNull();
  });

  it("surfaces the reason when the user declines", async () => {
    connectWallet.mockRejectedValue(new Error("User declined access"));
    const useWallet = await freshStore();

    await useWallet.getState().connect();

    expect(useWallet.getState().error).toBe("User declined access");
    expect(useWallet.getState().isConnecting).toBe(false);
  });

  it("keeps the existing account when a later connect attempt fails", async () => {
    // Closing the modal is a cancellation. Dropping the account the user
    // already had would read as being logged out for pressing Escape.
    connectWallet.mockResolvedValueOnce(ADDRESS);
    const useWallet = await freshStore();
    await useWallet.getState().connect();

    connectWallet.mockRejectedValueOnce(new Error("User closed the modal"));
    await useWallet.getState().connect();

    expect(useWallet.getState().address).toBe(ADDRESS);
    expect(useWallet.getState().error).toBe("User closed the modal");
  });

  it("clears a previous error when a retry succeeds", async () => {
    connectWallet.mockRejectedValueOnce(new Error("User declined access"));
    const useWallet = await freshStore();
    await useWallet.getState().connect();

    connectWallet.mockResolvedValueOnce(ADDRESS);
    await useWallet.getState().connect();

    expect(useWallet.getState().error).toBeNull();
    expect(useWallet.getState().address).toBe(ADDRESS);
  });
});

describe("disconnect", () => {
  it("clears the address and any error", async () => {
    connectWallet.mockResolvedValue(ADDRESS);
    disconnectWallet.mockResolvedValue(undefined);
    const useWallet = await freshStore();
    await useWallet.getState().connect();

    await useWallet.getState().disconnect();

    expect(disconnectWallet).toHaveBeenCalledTimes(1);
    expect(useWallet.getState().address).toBeNull();
    expect(useWallet.getState().error).toBeNull();
  });
});
