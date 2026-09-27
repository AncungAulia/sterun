/**
 * STE-68 — a missing trustline is an answer, not a failure.
 *
 * The first live seed run failed at S.2 because `getAssetBalance` throws
 * `Trustline for ... not found for ...` instead of answering with an empty
 * `balanceEntry`, which left `addTrustline` unreachable. These pin both halves:
 * the throw is read as "no trustline", and anything else still propagates.
 *
 * Run: pnpm --filter be exec tsx --test ../docs/rehearsal/test/trustline.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { Asset } from "@stellar/stellar-sdk";

import { readBalance, readHasTrustline, type BalanceReader } from "../src/trustline";

const PASSPHRASE = "Test SDF Network ; September 2015";

const ADDRESS = "GDNANOE7AO36MCHKDMKRW2MJINJFUS2LZBMQDZCFUWCR7P3AJODIGUFF";
const ISSUER = "GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW";
const SUSD = new Asset("sUSD", ISSUER);

/** Verbatim shape of the error testnet returned on 2026-09-25. */
const noTrustline = (): BalanceReader => ({
  getAssetBalance: async () => {
    throw new Error(`Trustline for sUSD:${ISSUER} not found for ${ADDRESS}`);
  },
});

const holds = (amount: string): BalanceReader => ({
  getAssetBalance: async () => ({ balanceEntry: { amount } }),
});

const rejects = (message: string): BalanceReader => ({
  getAssetBalance: async () => {
    throw new Error(message);
  },
});

test("a thrown missing trustline reads as no trustline, not as a failure", async () => {
  assert.equal(await readHasTrustline(noTrustline(), ADDRESS, SUSD, PASSPHRASE), false);
  assert.equal(await readBalance(noTrustline(), ADDRESS, SUSD, PASSPHRASE), 0n);
});

test("a held trustline reads as held, with its amount", async () => {
  assert.equal(await readHasTrustline(holds("125000000"), ADDRESS, SUSD, PASSPHRASE), true);
  assert.equal(await readBalance(holds("125000000"), ADDRESS, SUSD, PASSPHRASE), 125_000_000n);
});

test("an empty balanceEntry is still no trustline", async () => {
  const empty: BalanceReader = { getAssetBalance: async () => ({ balanceEntry: null }) };
  assert.equal(await readHasTrustline(empty, ADDRESS, SUSD, PASSPHRASE), false);
  assert.equal(await readBalance(empty, ADDRESS, SUSD, PASSPHRASE), 0n);
});

test("every other failure still throws — a slow node is not an empty wallet", async () => {
  for (const message of ["fetch failed", "timeout of 30000ms exceeded", "Account not found"]) {
    await assert.rejects(() => readHasTrustline(rejects(message), ADDRESS, SUSD, PASSPHRASE), new RegExp(message.split(" ")[0]));
    await assert.rejects(() => readBalance(rejects(message), ADDRESS, SUSD, PASSPHRASE), new RegExp(message.split(" ")[0]));
  }
});
