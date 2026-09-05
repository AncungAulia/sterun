/**
 * STE-15 — the translation between what the contract says and what a caller
 * reads.
 *
 * The conversions look trivial, and two of them are not. `fromHex32` is the
 * only place a `participant_hash` becomes bytes, so a lenient version of it
 * would let a truncated hash reach `enter` — where it would be accepted, stored
 * forever, and verify against nobody. `formatStroops` is the only place money
 * becomes text, and every float in that path is a wrong entry fee.
 */
import { describe, expect, it } from "vitest";
import {
  EVENT_STATUSES,
  RECORD_STATES,
  STROOPS_PER_UNIT,
  formatStroops,
  fromEventStatus,
  fromHex32,
  toHex,
  toSterunCategory,
  toSterunEvent,
  toSterunRecord,
} from "../src/types.js";

const HASH = "feb3cea959e59a1f5a42e9bac1f36e0fccc266de05960e173226fcadfd63fe29";

describe("hex, both ways", () => {
  it("round-trips a 32-byte hash without changing a nibble", () => {
    expect(toHex(new Uint8Array(fromHex32(HASH, "h")))).toBe(HASH);
  });

  it("pads bytes below 0x10, which is where a naive toString(16) loses data", () => {
    expect(toHex(new Uint8Array([0x00, 0x01, 0x0f, 0xff]))).toBe("00010fff");
  });

  it("accepts uppercase and an 0x prefix, and normalises both", () => {
    const upper = HASH.toUpperCase();
    expect(toHex(new Uint8Array(fromHex32(upper, "h")))).toBe(HASH);
    expect(toHex(new Uint8Array(fromHex32(`0x${HASH}`, "h")))).toBe(HASH);
  });

  it.each([
    ["too short", HASH.slice(0, 62)],
    ["too long", `${HASH}ab`],
    ["not hex", "z".repeat(64)],
    ["empty", ""],
    ["whitespace padded", ` ${HASH} `],
  ])("refuses a hash that is %s rather than silently truncating it", (_label, value) => {
    // Truncation is the dangerous failure: 31 bytes is rejected by everything
    // on chain, but a silently shortened 32 is accepted by everything and
    // matches nobody.
    expect(() => fromHex32(value, "participantHash")).toThrow(TypeError);
    expect(() => fromHex32(value, "participantHash")).toThrow(/participantHash/);
  });
});

describe("stroops are integers all the way down", () => {
  it("formats the 5 sUSD entry fee the rehearsal event actually charges", () => {
    expect(formatStroops(50_000_000n)).toBe("5");
  });

  it("keeps the stroop that a float round-trip of 0.1 loses", () => {
    // 0.1 sUSD is 1_000_000 stroops. Through a float it comes back as
    // 999999.9999999999, and one stroop short of the fee makes enter fail.
    expect(formatStroops(1_000_000n)).toBe("0.1");
    expect(formatStroops(1n)).toBe("0.0000001");
    expect(formatStroops(STROOPS_PER_UNIT - 1n)).toBe("0.9999999");
  });

  it("handles zero, negatives and amounts past Number.MAX_SAFE_INTEGER", () => {
    expect(formatStroops(0n)).toBe("0");
    expect(formatStroops(-50_000_000n)).toBe("-5");
    expect(formatStroops(-1n)).toBe("-0.0000001");
    expect(formatStroops(90_071_992_547_409_910n)).toBe("9007199254.740991");
  });
});

describe("contract shapes become caller shapes", () => {
  it("converts an event, including the tagged status enum", () => {
    const event = toSterunEvent(7, {
      metadata_hash: Buffer.from(HASH, "hex"),
      name: "Sterun Testnet Rehearsal 2026",
      organiser: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
      starts_at: 1789000000n,
      status: { tag: "Open", values: undefined },
      uri: "https://sterun.xyz/events/x.json",
    });
    expect(event).toEqual({
      eventId: 7,
      organiser: "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN",
      name: "Sterun Testnet Rehearsal 2026",
      metadataHash: HASH,
      uri: "https://sterun.xyz/events/x.json",
      startsAt: 1789000000n,
      status: "Open",
    });
  });

  it("round-trips every event status through the bindings' tagged form", () => {
    for (const status of EVENT_STATUSES) {
      expect(fromEventStatus(status)).toEqual({ tag: status, values: undefined });
    }
  });

  it("computes slotsLeft, and never reports a negative one", () => {
    const base = { code: "10K", distance_m: 10_000, price_usdc: 50_000_000n };
    expect(toSterunCategory(0, 0, { ...base, quota: 5, entered_count: 4 }).slotsLeft).toBe(1);
    expect(toSterunCategory(0, 0, { ...base, quota: 5, entered_count: 5 }).slotsLeft).toBe(0);
    // entered_count can only reach quota through reserve_slot, but a client
    // that renders "-1 slots left" because of an over-count would be worse than
    // one that renders "full".
    expect(toSterunCategory(0, 0, { ...base, quota: 5, entered_count: 9 }).slotsLeft).toBe(0);
  });

  it("keeps the entry fee a bigint rather than a number", () => {
    const category = toSterunCategory(0, 0, {
      code: "10K",
      distance_m: 10_000,
      quota: 5,
      entered_count: 0,
      price_usdc: 50_000_000n,
    });
    expect(category.priceStroops).toBe(50_000_000n);
    expect(typeof category.priceStroops).toBe("bigint");
  });

  it("converts a finished record, with its optionals resolved to null or a value", () => {
    const record = toSterunRecord(0, {
      bib_no: 0,
      category_id: 0,
      claimed_at: 1788252342n,
      entered_at: 1788252277n,
      event_id: 0,
      finish_time_s: 3161,
      participant_hash: Buffer.from(HASH, "hex"),
      result_at: 1788252352n,
      state: { tag: "Finished", values: undefined },
    });
    expect(record).toEqual({
      tokenId: 0,
      eventId: 0,
      categoryId: 0,
      bibNo: 0,
      participantHash: HASH,
      state: "Finished",
      enteredAt: 1788252277n,
      claimedAt: 1788252342n,
      finishTimeS: 3161,
      resultAt: 1788252352n,
    });
  });

  it("turns a freshly entered record's absent optionals into null, not undefined", () => {
    // `undefined` disappears from JSON.stringify; `null` survives it. The
    // profile page and the roster bundle both serialise these.
    const record = toSterunRecord(9, {
      bib_no: 3,
      category_id: 1,
      claimed_at: undefined,
      entered_at: 1788252277n,
      event_id: 2,
      finish_time_s: undefined,
      participant_hash: Buffer.from(HASH, "hex"),
      result_at: undefined,
      state: { tag: "Entered", values: undefined },
    });
    expect(record.claimedAt).toBeNull();
    expect(record.finishTimeS).toBeNull();
    expect(record.resultAt).toBeNull();
    expect(JSON.parse(JSON.stringify({ ...record, enteredAt: "x" }))).toHaveProperty(
      "claimedAt",
      null,
    );
  });

  it("carries every record state across unchanged", () => {
    for (const state of RECORD_STATES) {
      const record = toSterunRecord(0, {
        bib_no: 0,
        category_id: 0,
        claimed_at: undefined,
        entered_at: 0n,
        event_id: 0,
        finish_time_s: undefined,
        participant_hash: Buffer.from(HASH, "hex"),
        result_at: undefined,
        state: { tag: state, values: undefined },
      });
      expect(record.state).toBe(state);
    }
  });

  it("reads a finish time of 0 as a value, not as absent", () => {
    // The contract rejects finish_time_s == 0 with InvalidFinishTime(105), so
    // this cannot arrive from chain — but `?? null` on a 0 would be a bug the
    // day anything else produces one, and it costs one test to rule out.
    const record = toSterunRecord(0, {
      bib_no: 0,
      category_id: 0,
      claimed_at: 0n,
      entered_at: 0n,
      event_id: 0,
      finish_time_s: 0,
      participant_hash: Buffer.from(HASH, "hex"),
      result_at: 0n,
      state: { tag: "Finished", values: undefined },
    });
    expect(record.finishTimeS).toBe(0);
    expect(record.claimedAt).toBe(0n);
    expect(record.resultAt).toBe(0n);
  });
});
