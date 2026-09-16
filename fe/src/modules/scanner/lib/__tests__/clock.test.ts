/**
 * The clock check, with every clock and the network injected, so the three
 * sources and the order between them are tested without waiting on anything.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { forgetServerTime, measureDrift, rememberServerTime } from "@/modules/scanner/lib/clock";

const TRUE_TIME = Date.parse("2026-09-27T01:00:00.000Z");

beforeEach(() => forgetServerTime());

describe("with signal", () => {
  it("measures against this app's own Date header", async () => {
    const reading = await measureDrift(0, {
      online: () => true,
      now: () => TRUE_TIME + 240_000,
      perfNow: () => 1_000,
      headDate: async () => new Date(TRUE_TIME).toUTCString(),
    });
    expect(reading).toEqual({ driftSeconds: 240, source: "server" });
  });

  it("falls back when the signal bar lied and the request failed", async () => {
    const reading = await measureDrift(-95, {
      online: () => true,
      now: () => TRUE_TIME,
      perfNow: () => 0,
      headDate: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(reading).toEqual({ driftSeconds: -95, source: "stored" });
  });

  it("falls back when there is no readable Date header", async () => {
    const reading = await measureDrift(12, {
      online: () => true,
      now: () => TRUE_TIME,
      perfNow: () => 0,
      headDate: async () => null,
    });
    expect(reading.source).toBe("stored");
  });
});

describe("without signal", () => {
  it("sees a clock fixed in Settings, from the true time learned earlier in this visit", async () => {
    // Downloaded at perf 1,000 ms, when true time was TRUE_TIME.
    rememberServerTime(TRUE_TIME, () => 1_000);

    // Ten minutes later on the monotonic clock. The phone was 4 minutes fast...
    const before = await measureDrift(240, {
      online: () => false,
      perfNow: () => 601_000,
      now: () => TRUE_TIME + 600_000 + 240_000,
    });
    expect(before).toEqual({ driftSeconds: 240, source: "anchor" });

    // ...and the volunteer set it right. The wall clock jumped; performance.now did not.
    const after = await measureDrift(240, {
      online: () => false,
      perfNow: () => 661_000,
      now: () => TRUE_TIME + 660_000,
    });
    expect(after).toEqual({ driftSeconds: 0, source: "anchor" });
  });

  it("uses a server reading from earlier in the visit as its anchor too", async () => {
    await measureDrift(0, {
      online: () => true,
      now: () => TRUE_TIME,
      perfNow: () => 0,
      headDate: async () => new Date(TRUE_TIME).toUTCString(),
    });

    const reading = await measureDrift(999, {
      online: () => false,
      perfNow: () => 30_000,
      now: () => TRUE_TIME + 30_000 - 120_000,
    });
    expect(reading).toEqual({ driftSeconds: -120, source: "anchor" });
  });

  it("has only the stored drift after a reload with no signal, and says that is its source", async () => {
    const reading = await measureDrift(240, { online: () => false, now: () => TRUE_TIME, perfNow: () => 0 });
    expect(reading).toEqual({ driftSeconds: 240, source: "stored" });
  });
});
