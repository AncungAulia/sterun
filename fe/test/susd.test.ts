/**
 * sUSD from the runner's side: can they pay, and if not, how they get some.
 * The RPC server is injected and the backend is mocked at `apiFetch`, so no
 * test reaches testnet.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch,
}));

import { ApiError } from "@/lib/api";
import { readSusdBalance, requestTestSusd, shortfall, type BalanceReader } from "@/lib/susd";

const ADDRESS = "GAJVXTF5RIXZWXL5MBOFMMF7SUMUKPU6LBG6CAO4U2FUH5HQCYCUPWVR";
const CHALLENGE = { nonce: "n", expires_at: "x" };

function server(options: { balance: string | null; accountExists?: boolean }): BalanceReader {
  return {
    getSACBalance: vi.fn(async () =>
      options.balance === null ? {} : { balanceEntry: { amount: options.balance } },
    ),
    getAccount: vi.fn(async () => {
      if (options.accountExists === false) throw new Error("Account not found: " + ADDRESS);
      return {};
    }),
  };
}

describe("readSusdBalance", () => {
  it("reads the balance in stroops, exactly", async () => {
    expect(await readSusdBalance(ADDRESS, server({ balance: "1500000001" }))).toEqual({
      kind: "balance",
      stroops: 1_500_000_001n,
    });
  });

  it("reads a zero balance as a balance, not as a missing trustline", async () => {
    expect(await readSusdBalance(ADDRESS, server({ balance: "0" }))).toEqual({
      kind: "balance",
      stroops: 0n,
    });
  });

  it("tells a missing trustline from a wallet that was never funded", async () => {
    expect(await readSusdBalance(ADDRESS, server({ balance: null }))).toEqual({ kind: "no-trustline" });
    expect(await readSusdBalance(ADDRESS, server({ balance: null, accountExists: false }))).toEqual({
      kind: "no-account",
    });
  });

  it("asks for sUSD by its issuer on the configured network", async () => {
    const reader = server({ balance: "1" });
    await readSusdBalance(ADDRESS, reader);
    const [address, asset, passphrase] = vi.mocked(reader.getSACBalance).mock.calls[0];
    expect(address).toBe(ADDRESS);
    expect(asset.getCode()).toBe("sUSD");
    expect(asset.getIssuer()).toBe("GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW");
    expect(passphrase).toBe("Test SDF Network ; September 2015");
  });
});

describe("shortfall", () => {
  it("is zero when the balance covers the total exactly", () => {
    expect(shortfall({ kind: "balance", stroops: 300n }, 300n)).toBe(0n);
  });

  it("is the difference when it does not", () => {
    expect(shortfall({ kind: "balance", stroops: 100n }, 300n)).toBe(200n);
  });

  it("is the whole total with no trustline or no account", () => {
    expect(shortfall({ kind: "no-trustline" }, 300n)).toBe(300n);
    expect(shortfall({ kind: "no-account" }, 300n)).toBe(300n);
  });

  it("is zero for a free entry, whatever the wallet holds", () => {
    expect(shortfall({ kind: "no-account" }, 0n)).toBe(0n);
  });
});

describe("requestTestSusd", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("signs a challenge and asks the faucet to pay the signer", async () => {
    apiFetch.mockResolvedValueOnce(CHALLENGE).mockResolvedValueOnce({});
    const sign = vi.fn(async () => "sig");

    expect(await requestTestSusd(ADDRESS, sign)).toEqual({ kind: "sent" });
    expect(sign).toHaveBeenCalledWith("n", { address: ADDRESS });
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/faucet",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-sterun-address": ADDRESS,
          "x-sterun-nonce": "n",
          "x-sterun-signature": "sig",
        }),
      }),
    );
  });

  it.each([
    [404, "not-found", "unavailable"],
    [429, "rate-limited", "rate-limited"],
    [429, "http-error", "rate-limited"],
    [503, "faucet-empty", "empty"],
  ])("maps a %s %s to %s", async (status, code, kind) => {
    apiFetch.mockResolvedValueOnce(CHALLENGE).mockRejectedValueOnce(new ApiError(status, code, "x"));
    expect(await requestTestSusd(ADDRESS, async () => "sig")).toEqual({ kind });
  });

  it("rethrows anything it has no sentence for", async () => {
    apiFetch.mockResolvedValueOnce(CHALLENGE).mockRejectedValueOnce(new ApiError(500, "internal", "x"));
    await expect(requestTestSusd(ADDRESS, async () => "sig")).rejects.toBeInstanceOf(ApiError);
  });
});
