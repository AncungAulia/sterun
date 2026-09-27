/**
 * STE-25 — a crashed device fails the step; it never lets the run end as a pass.
 *
 * Run: pnpm --filter be exec tsx --test ../docs/rehearsal/test/device-process.test.ts
 *
 * Each call below is also raced against a timeout. Without it, the regression
 * this guards against would not fail the test — it would hang it, or, exactly
 * like the rehearsal did, let node exit with nothing left to wait on.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { Device } from "../src/device-process";

const fixture = (name: string) => join(import.meta.dirname, "fixtures", name);

function settlesWithin<T>(promise: Promise<T>, ms = 5_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`still unsettled after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

test("a healthy device answers its calls", async () => {
  const device = new Device("desk-A", fixture("device.mjs"));
  try {
    assert.deepEqual(await settlesWithin(device.call("echo", { value: { bib: 4 } })), { bib: 4 });
  } finally {
    device.stop();
  }
});

test("a device that dies before it is ready fails the call", async () => {
  const device = new Device("desk-A", fixture("dies-at-start.mjs"));
  await assert.rejects(settlesWithin(device.call("sync")), /desk-A process exited \(code 1/);
});

test("a device that dies while a call is waiting fails that call", async () => {
  const device = new Device("desk-B", fixture("device.mjs"));
  await assert.rejects(settlesWithin(device.call("crash")), /desk-B crash: desk-B process exited \(code 3/);
});

test("a device that died between steps fails the next call", async () => {
  const device = new Device("phones", fixture("device.mjs"));
  await assert.rejects(settlesWithin(device.call("crash")), /process exited/);
  await assert.rejects(settlesWithin(device.call("echo", { value: 1 })), /phones echo: phones process exited \(code 3/);
});
