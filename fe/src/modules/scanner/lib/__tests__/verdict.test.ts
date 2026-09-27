/**
 * The desk's decision. Secrets, steps and codes are the frozen vectors'
 * (docs/specs/vectors/totp.json), so a GREEN here is a GREEN the backend and
 * the runner's pass agree with.
 */
import { describe, expect, it } from "vitest";

import type { QueuedClaim, RosterEntry } from "@/modules/scanner/lib/scanner-store";
import { verdictFor, type Presented } from "@/modules/scanner/lib/verdict";

// tp-01 / vf-01..vf-04
const SECRET_A = "9c1f0a7d4e2b63859f0d17c4a6e28b30d5f74196ac30e5b82f6d1904c7ba3e58";
const NOW = 59070000;
const CODE_NOW = "911070";
const CODE_PREVIOUS = "299421"; // step NOW - 1
const CODE_TWO_OLD = "943926"; // step NOW - 2

// tp-02: a code with a leading zero
const SECRET_B = "4d7b1e93a05c26f8d3407e91b6c258aa0f31d74e69b2085c1a3f6d904e7c2b15";
const STEP_B = 59070111;
const CODE_B = "079663";

function entry(overrides: Partial<RosterEntry>): RosterEntry {
  return {
    tokenId: 1,
    bibNo: 101,
    categoryId: 0,
    state: "Entered",
    nameFragment: "Budi S.",
    addOns: [],
    totpSecret: SECRET_A,
    ...overrides,
  };
}

const TOTP = { digits: 6, stepSeconds: 30, toleranceSteps: 1 };

function decide(presented: Presented, entries: RosterEntry[], claims: QueuedClaim[] = [], nowStep = NOW) {
  return verdictFor({ presented, roster: { entries, totp: TOTP }, claims, nowStep });
}

describe("a QR", () => {
  it("is GREEN for a current code on an entered record", async () => {
    const runner = entry({});
    const verdict = await decide({ via: "qr", tokenId: 1, step: NOW, code: CODE_NOW }, [runner]);
    expect(verdict).toEqual({ kind: "green", entry: runner });
  });

  it("is GREEN one step either side, which is a scan during a rollover", async () => {
    const verdict = await decide(
      { via: "qr", tokenId: 1, step: NOW - 1, code: CODE_PREVIOUS },
      [entry({})],
    );
    expect(verdict.kind).toBe("green");
  });

  it("is expired for a screenshot two steps old", async () => {
    const verdict = await decide(
      { via: "qr", tokenId: 1, step: NOW - 2, code: CODE_TWO_OLD },
      [entry({})],
    );
    expect(verdict.kind).toBe("expired");
  });

  it("is expired for a code that is simply wrong", async () => {
    const verdict = await decide({ via: "qr", tokenId: 1, step: NOW, code: "000000" }, [entry({})]);
    expect(verdict.kind).toBe("expired");
  });

  it("keeps a leading zero all the way to GREEN", async () => {
    const verdict = await decide(
      { via: "qr", tokenId: 7, step: STEP_B, code: CODE_B },
      [entry({ tokenId: 7, totpSecret: SECRET_B })],
      [],
      STEP_B,
    );
    expect(verdict.kind).toBe("green");
  });

  it("is unknown for a token that is not on the roster, however good the code", async () => {
    const verdict = await decide({ via: "qr", tokenId: 99, step: NOW, code: CODE_NOW }, [entry({})]);
    expect(verdict).toEqual({ kind: "unknown", bibNo: null });
  });
});

describe("already claimed comes before the code", () => {
  it("from the roster's snapshot, even with a perfect code", async () => {
    const runner = entry({ state: "RacepackClaimed" });
    const verdict = await decide({ via: "qr", tokenId: 1, step: NOW, code: CODE_NOW }, [runner]);
    expect(verdict).toEqual({ kind: "claimed", entry: runner, claimedHere: null });
  });

  it("from this phone's own claim, which no snapshot can see yet", async () => {
    const runner = entry({});
    const mine: QueuedClaim = {
      tokenId: 1,
      bibNo: 101,
      eventId: 3,
      scannedAt: "2026-09-27T01:00:00.000Z",
      status: "waiting",
    };
    const verdict = await decide({ via: "qr", tokenId: 1, step: NOW, code: CODE_NOW }, [runner], [mine]);
    expect(verdict).toEqual({ kind: "claimed", entry: runner, claimedHere: mine });
  });

  it("for a stale code too, because the runner needs the real reason", async () => {
    const verdict = await decide(
      { via: "qr", tokenId: 1, step: NOW - 2, code: CODE_TWO_OLD },
      [entry({ state: "RacepackClaimed" })],
    );
    expect(verdict.kind).toBe("claimed");
  });

  it("for a record that has already finished", async () => {
    const verdict = await decide(
      { via: "qr", tokenId: 1, step: NOW, code: CODE_NOW },
      [entry({ state: "Finished" })],
    );
    expect(verdict.kind).toBe("claimed");
  });
});

describe("a code typed with a bib", () => {
  it("is GREEN with no step, trying the whole window", async () => {
    const verdict = await decide({ via: "typed", bibNo: 101, code: CODE_PREVIOUS }, [entry({})]);
    expect(verdict.kind).toBe("green");
  });

  it("is unknown for a bib that is not on the roster, and names the bib", async () => {
    const verdict = await decide({ via: "typed", bibNo: 555, code: CODE_NOW }, [entry({})]);
    expect(verdict).toEqual({ kind: "unknown", bibNo: 555 });
  });

  it("is expired for five characters, which is a leading zero lost somewhere", async () => {
    const verdict = await decide(
      { via: "typed", bibNo: 7, code: "79663" },
      [entry({ tokenId: 7, bibNo: 7, totpSecret: SECRET_B })],
      [],
      STEP_B,
    );
    expect(verdict.kind).toBe("expired");
  });

  it("tells two runners with one bib apart by the code, on an event from before STE-54", async () => {
    const tenK = entry({ tokenId: 1, bibNo: 0, categoryId: 0, totpSecret: SECRET_B });
    const fiveK = entry({ tokenId: 2, bibNo: 0, categoryId: 1, totpSecret: SECRET_A });

    const verdict = await decide({ via: "typed", bibNo: 0, code: CODE_NOW }, [tenK, fiveK]);
    expect(verdict).toEqual({ kind: "green", entry: fiveK });
  });

  it("is claimed for the right one of the two, not for the one that shares the bib", async () => {
    const tenK = entry({ tokenId: 1, bibNo: 0, totpSecret: SECRET_B, state: "RacepackClaimed" });
    const fiveK = entry({ tokenId: 2, bibNo: 0, totpSecret: SECRET_A });

    const verdict = await decide({ via: "typed", bibNo: 0, code: CODE_NOW }, [tenK, fiveK]);
    expect(verdict.kind).toBe("green");
  });
});
