// @vitest-environment node
/**
 * The sUSD balance read against live testnet, with no fake in the way.
 *
 * Written after `readSusdBalance` shipped calling `getSACBalance`, which throws
 * for every wallet address: the unit tests mocked the RPC server, so they
 * passed while the wallet menu and Get test sUSD failed for every runner
 * (found by Ancung, 2026-09-15). This file runs the real read on the three
 * shapes a runner's wallet can be in.
 *
 * Opt-in, like the rest of test/e2e: `STERUN_E2E=1 pnpm --filter fe test test/e2e`.
 */
import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { readSusdBalance } from "@/lib/wallet/susd";

const LIVE = process.env.STERUN_E2E === "1";

/** `sterun-runner-b` in docs/deployments.md: funded by `pnpm faucet`, holds sUSD. */
const FUNDED_RUNNER = "GD7DHD3FDWZRBU5GCI5LTQT2VFRJXRTSCG6DJOP5SNVOATYE76POYVCE";
/** A real wallet with test XLM and no sUSD trustline (Ancung's, as of 2026-09-15). */
const NO_TRUSTLINE = "GA5VKC7QHIIC7GBXMHLILU2LMKKXYAHOFNE77CUOGMLO4GB3ZKP5HZS7";

describe.skipIf(!LIVE)("readSusdBalance on testnet", () => {
  it("reads the balance of a wallet that holds sUSD", async () => {
    const balance = await readSusdBalance(FUNDED_RUNNER);
    expect(balance.kind).toBe("balance");
    if (balance.kind === "balance") expect(balance.stroops).toBeGreaterThan(0n);
  }, 30_000);

  it("says a funded wallet with no trustline has no trustline", async () => {
    expect(await readSusdBalance(NO_TRUSTLINE)).toEqual({ kind: "no-trustline" });
  }, 30_000);

  it("says a wallet that was never funded does not exist yet", async () => {
    expect(await readSusdBalance(Keypair.random().publicKey())).toEqual({ kind: "no-account" });
  }, 30_000);
});
