/**
 * STE-68 — the batch claim is used only when both the live contract and the
 * SDK build have it, and single calls otherwise.
 *
 * Run: pnpm --filter be exec tsx --test ../docs/rehearsal/test/claims.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CLAIM_MAX_BATCH, chooseClaimPath, chunk, claimRacepacks, sdkHasBatch, wasmExports, type ClaimClient } from "../src/claims";

// Real RaceRecord wasm that was live on testnet before STE-41 and STE-60, kept
// by sc/ for its upgrade tests. Read from disk: no network.
const TESTDATA = join(__dirname, "..", "..", "..", "sc", "contracts", "race_record", "testdata");
const preUntimed = readFileSync(join(TESTDATA, "race_record_live_pre_untimed.wasm"));
const preResults = readFileSync(join(TESTDATA, "race_record_live_pre_results.wasm"));

test("the exported functions are read from the wasm's own spec", () => {
  assert.equal(wasmExports(preResults, "claim_racepack"), true);
  assert.equal(wasmExports(preResults, "claim_racepack_many"), false);
  // A function one upgrade added, present after it and absent before it.
  assert.equal(wasmExports(preUntimed, "record_finish_untimed"), false);
  assert.equal(wasmExports(preResults, "record_finish_untimed"), true);
  assert.equal(wasmExports(new Uint8Array([0, 1, 2, 3]), "claim_racepack"), null, "garbage is unreadable, not 'absent'");
});

test("batch only when the contract exports it AND the SDK has it", () => {
  assert.equal(chooseClaimPath(true, true).kind, "batch");
  assert.equal(chooseClaimPath(true, false).kind, "single");
  assert.match(chooseClaimPath(true, false).why, /rebuild the SDK/);
  assert.equal(chooseClaimPath(false, true).kind, "single");
  assert.match(chooseClaimPath(false, true).why, /not upgraded/);
  assert.equal(chooseClaimPath(null, true).kind, "single", "an unreadable contract is never assumed to have it");
});

test("the SDK is feature-detected, not version-checked", () => {
  assert.equal(sdkHasBatch({ claimRacepack() {} }), false);
  assert.equal(sdkHasBatch({ claimRacepack() {}, claimRacepackMany() {} }), true);
});

test("the cap is the contract's, and a long queue is split under it", () => {
  assert.equal(CLAIM_MAX_BATCH, 100);
  const ids = Array.from({ length: 250 }, (_, i) => i);
  assert.deepEqual(chunk(ids, CLAIM_MAX_BATCH).map((b) => b.length), [100, 100, 50]);
  assert.throws(() => chunk(ids, 0), RangeError);
});

function fakeClient(withBatch: boolean) {
  const calls: string[] = [];
  const client: ClaimClient = {
    async claimRacepack(tokenId) {
      calls.push(`single ${tokenId}`);
      return { txHash: `s${tokenId}` };
    },
  };
  if (withBatch) {
    client.claimRacepackMany = async (ids) => {
      calls.push(`batch ${ids.join(",")}`);
      return { txHash: "b", value: ids.includes(3) ? [{ tokenId: 3, reason: "not-entered" }] : [] };
    };
  }
  return { client, calls };
}

test("the batch path sends one signature and reports what it skipped", async () => {
  const { client, calls } = fakeClient(true);
  const out = await claimRacepacks(client, [1, 2, 3], "GOP", {}, chooseClaimPath(true, true));
  assert.deepEqual(calls, ["batch 1,2,3"]);
  assert.equal(out.txs.length, 1);
  assert.deepEqual(out.skipped, [{ tokenId: 3, reason: "not-entered" }]);
});

test("the single path sends one signature per pack, even if the SDK has the batch", async () => {
  const { client, calls } = fakeClient(true);
  const out = await claimRacepacks(client, [1, 2], "GOP", {}, chooseClaimPath(false, true));
  assert.deepEqual(calls, ["single 1", "single 2"]);
  assert.deepEqual(out.txs.map((t) => t.hash), ["s1", "s2"]);
});
