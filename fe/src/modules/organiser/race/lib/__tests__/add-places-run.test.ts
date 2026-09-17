// @vitest-environment node
// Node, not jsdom: the announcement text is hashed by stellar-sdk, which refuses
// jsdom's Uint8Array (fe/CLAUDE.md, Tests).
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import { announcementToSign } from "@/lib/event/announcements";

import {
  INITIAL_STATE,
  SIGNATURE_FRESH_MS,
  isDone,
  runAddPlaces,
  type AddPlacesDeps,
  type AddPlacesPlan,
  type AddPlacesState,
} from "../add-places-run";

const T0 = Date.parse("2026-09-18T01:12:00.000Z");

const plan: AddPlacesPlan = {
  eventId: 7,
  categoryId: 1,
  organiser: "GORGANISER",
  newQuota: 800,
  body: "Entries for 10K raised from 500 to 800.",
};

function deps(overrides: Partial<AddPlacesDeps> = {}) {
  const calls: string[] = [];
  const all: AddPlacesDeps = {
    now: () => T0,
    signMessage: vi.fn(async () => {
      calls.push("sign");
      return "c2lnbmF0dXJl";
    }),
    increaseQuota: vi.fn(async () => {
      calls.push("raise");
    }),
    quotaOnChain: vi.fn(async () => 500),
    publish: vi.fn(async () => {
      calls.push("publish");
    }),
    onChange: vi.fn(),
    ...overrides,
  };
  return { deps: all, calls };
}

describe("runAddPlaces", () => {
  it("signs the announcement, raises the entries, then publishes, in that order", async () => {
    const { deps: d, calls } = deps();
    const state = await runAddPlaces(plan, INITIAL_STATE, d);

    expect(calls).toEqual(["sign", "raise", "publish"]);
    expect(isDone(state)).toBe(true);
    expect(state.running).toBeNull();
    expect(state.failed).toBeNull();
  });

  it("signs exactly the announcement for this race, dated now, and publishes that signature", async () => {
    const { deps: d } = deps();
    await runAddPlaces(plan, INITIAL_STATE, d);

    const publishedAt = "2026-09-18T01:12:00.000Z";
    expect(d.signMessage).toHaveBeenCalledWith(announcementToSign({ eventId: 7, publishedAt, body: plan.body }));
    expect(d.publish).toHaveBeenCalledWith({
      eventId: 7,
      signer: "GORGANISER",
      publishedAt,
      body: plan.body,
      signature: "c2lnbmF0dXJl",
    });
  });

  it("reports each step as it starts, so the dialog can follow", async () => {
    const { deps: d } = deps();
    await runAddPlaces(plan, INITIAL_STATE, d);
    const running = vi
      .mocked(d.onChange)
      .mock.calls.map(([s]) => s.running)
      .filter((step, i, all) => step !== null && step !== all[i - 1]);
    expect(running).toEqual(["sign", "raise", "publish"]);
  });

  it("stops before any entries move when the announcement is declined", async () => {
    const { deps: d, calls } = deps({
      signMessage: vi.fn(async () => {
        throw new Error("User declined the request");
      }),
    });
    const state = await runAddPlaces(plan, INITIAL_STATE, d);

    expect(calls).toEqual([]);
    expect(d.increaseQuota).not.toHaveBeenCalled();
    expect(state.failed).toEqual({ step: "sign", message: "You declined this in your wallet. Nothing was sent." });
  });

  it("does not ask the ledger about a declined raise, and keeps the signature for the retry", async () => {
    const { deps: d } = deps({
      increaseQuota: vi.fn(async () => {
        throw new Error("User rejected the transaction");
      }),
    });
    const state = await runAddPlaces(plan, INITIAL_STATE, d);

    expect(d.quotaOnChain).not.toHaveBeenCalled();
    expect(state.failed?.step).toBe("raise");
    expect(state.signed).not.toBeNull();
    expect(state.raised).toBe(false);
  });

  it("counts a raise with no answer as landed when the ledger already holds the new entries", async () => {
    const { deps: d, calls } = deps({
      increaseQuota: vi.fn(async () => {
        throw new Error("increaseQuota returned no transaction hash");
      }),
      quotaOnChain: vi.fn(async () => 800),
    });
    const state = await runAddPlaces(plan, INITIAL_STATE, d);

    expect(calls).toEqual(["sign", "publish"]);
    expect(isDone(state)).toBe(true);
  });

  it("fails the raise when the ledger holds the old number, some other number, or cannot be asked", async () => {
    for (const quotaOnChain of [
      vi.fn(async () => 500),
      vi.fn(async () => 900),
      vi.fn(async () => Promise.reject(new Error("rpc down"))),
    ]) {
      const { deps: d } = deps({
        increaseQuota: vi.fn(async () => {
          throw new Error("simulation failed");
        }),
        quotaOnChain,
      });
      const state = await runAddPlaces(plan, INITIAL_STATE, d);
      expect(state.failed).toEqual({ step: "raise", message: "Something went wrong. Please try again." });
      expect(d.publish).not.toHaveBeenCalled();
    }
  });

  it("after the entries landed, a failed publish keeps both and a retry only publishes", async () => {
    let attempts = 0;
    const { deps: d, calls } = deps({
      publish: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new ApiError(0, "unreachable", "Could not reach our server. Check your signal and try again.");
        calls.push("publish");
      }),
    });

    const first = await runAddPlaces(plan, INITIAL_STATE, d);
    expect(first.raised).toBe(true);
    expect(first.failed).toEqual({
      step: "publish",
      message: "Could not reach our server. Check your signal and try again.",
    });

    const second = await runAddPlaces(plan, first, d);
    expect(calls).toEqual(["sign", "raise", "publish"]);
    expect(isDone(second)).toBe(true);
  });

  it("signs again before publishing when the signature has grown too old for the server", async () => {
    const signed: AddPlacesState = {
      ...INITIAL_STATE,
      raised: true,
      signed: { publishedAt: new Date(T0).toISOString(), body: plan.body, signature: "old" },
      failed: { step: "publish", message: "x" },
    };
    const { deps: d, calls } = deps({ now: () => T0 + SIGNATURE_FRESH_MS + 1 });
    const state = await runAddPlaces(plan, signed, d);

    expect(calls).toEqual(["sign", "publish"]);
    expect(d.increaseQuota).not.toHaveBeenCalled();
    expect(vi.mocked(d.publish).mock.calls[0]![0].publishedAt).toBe(new Date(T0 + SIGNATURE_FRESH_MS + 1).toISOString());
    expect(isDone(state)).toBe(true);
  });

  it("keeps a signature still inside the window", async () => {
    const signed: AddPlacesState = {
      ...INITIAL_STATE,
      raised: true,
      signed: { publishedAt: new Date(T0).toISOString(), body: plan.body, signature: "kept" },
    };
    const { deps: d, calls } = deps({ now: () => T0 + SIGNATURE_FRESH_MS - 1 });
    await runAddPlaces(plan, signed, d);
    expect(calls).toEqual(["publish"]);
  });

  it("drops a signature the server called stale, so the next press signs again", async () => {
    const { deps: d } = deps({
      publish: vi.fn(async () => {
        throw new ApiError(400, "stale-announcement", "Something went wrong on our side. Please try again.");
      }),
    });
    const state = await runAddPlaces(plan, INITIAL_STATE, d);
    expect(state.raised).toBe(true);
    expect(state.signed).toBeNull();
    expect(state.failed?.step).toBe("publish");
  });
});
