/**
 * STE-68 — every refusal of `POST /faucet` is named, and the daily cap stops
 * the run with its retry time instead of being retried into.
 *
 * Run: pnpm --filter be exec tsx --test ../docs/rehearsal/test/faucet.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { FaucetStoppedError, classifyFaucetReply, fundFromFaucet, payoutBudget } from "../src/faucet";

const ROUTE = readFileSync(join(__dirname, "..", "..", "..", "be", "src", "routes", "faucet.ts"), "utf8");

test("the words the classifier matches are the route's own", () => {
  // If the backend rewords a 429, this fails here rather than a seed run
  // retrying a daily cap as though it were the per-client limiter.
  assert.match(ROUTE, /the faucet has handed out today's limit/);
  assert.match(ROUTE, /this wallet already received test sUSD/);
  assert.match(ROUTE, /error: "rate-limited"/);
  assert.match(ROUTE, /error: "faucet-empty"/);
  assert.match(ROUTE, /error: "faucet-unavailable"/);
});

test("a payout", () => {
  const reply = classifyFaucetReply(200, { tx_hash: "ab".repeat(32), paid_stroops: "500000000" });
  assert.deepEqual(reply, { kind: "paid", txHash: "ab".repeat(32), paidStroops: 500_000_000n });
});

test("the daily cap is its own kind, with the time it lifts", () => {
  const reply = classifyFaucetReply(429, {
    error: "rate-limited",
    message: "the faucet has handed out today's limit; try again at 2026-09-26T08:00:00.000Z",
    retry_at: "2026-09-26T08:00:00.000Z",
  });
  assert.equal(reply.kind, "daily-cap");
  assert.equal(reply.kind === "daily-cap" && reply.retryAt, "2026-09-26T08:00:00.000Z");
});

test("the address window is not the daily cap", () => {
  const reply = classifyFaucetReply(429, {
    error: "rate-limited",
    message: "this wallet already received test sUSD; it can ask again at 2026-09-26T08:00:00.000Z",
    retry_at: "2026-09-26T08:00:00.000Z",
  });
  assert.equal(reply.kind, "address-window");
});

test("fastify's own limiter is the one worth waiting out", () => {
  const reply = classifyFaucetReply(429, { statusCode: 429, error: "Too Many Requests", message: "Rate limit exceeded, retry in 1 minute" });
  assert.equal(reply.kind, "ip-limit");
});

test("an empty float, no faucet, no trustline, and anything else", () => {
  assert.equal(classifyFaucetReply(503, { error: "faucet-empty", message: "dry" }).kind, "empty");
  assert.equal(classifyFaucetReply(503, { error: "faucet-unavailable", message: "none" }).kind, "unavailable");
  assert.equal(classifyFaucetReply(409, { error: "no-trustline", message: "trust" }).kind, "no-trustline");
  assert.equal(classifyFaucetReply(502, "Bad Gateway").kind, "other");
});

test("the daily cap reads as a named failure that says when to run again", () => {
  const reply = classifyFaucetReply(429, {
    error: "rate-limited",
    message: "the faucet has handed out today's limit; try again at 2026-09-26T08:00:00.000Z",
    retry_at: "2026-09-26T08:00:00.000Z",
  });
  assert.equal(reply.kind, "daily-cap");
  if (reply.kind !== "daily-cap") return;
  const error = new FaucetStoppedError(reply, 7);
  assert.equal(error.name, "FaucetDailyCapReached");
  assert.match(error.message, /daily cap is reached \(7 wallet\(s\) paid/);
  assert.match(error.message, /until 2026-09-26T08:00:00.000Z/);
  assert.match(error.message, /do not loop/);
});

test("the payout budget is checked against the live cap before anything is paid", () => {
  const route = { dailyCapStroops: "50000000000" };
  assert.deepEqual(payoutBudget(route, "500000000", 16), { perDay: 100, needed: 16, fits: true });
  assert.equal(payoutBudget(route, "500000000", 101).fits, false);
  assert.equal(payoutBudget(route, "0", 1).fits, false);
});

test("fundFromFaucet waits out the per-client limiter once, and stops at the daily cap", async () => {
  const waits: number[] = [];
  const wait = async (ms: number) => void waits.push(ms);
  const replies = [
    { status: 429, body: { statusCode: 429, error: "Too Many Requests", message: "Rate limit exceeded" } },
    { status: 200, body: { tx_hash: "cd".repeat(32), paid_stroops: "500000000" } },
  ];
  const paid = await fundFromFaucet(async () => replies.shift()!, "R1", 0, wait);
  assert.equal(paid.txHash, "cd".repeat(32));
  assert.deepEqual(waits, [65_000]);

  let asked = 0;
  const capped = async () => {
    asked += 1;
    return { status: 429, body: { error: "rate-limited", message: "the faucet has handed out today's limit; try again at X", retry_at: "X" } };
  };
  await assert.rejects(fundFromFaucet(capped, "R2", 3, wait), (error: Error) => error instanceof FaucetStoppedError && error.name === "FaucetDailyCapReached");
  assert.equal(asked, 1, "the daily cap is never retried");
});
