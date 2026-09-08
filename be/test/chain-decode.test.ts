/**
 * STE-16 — the decoders that stand between RPC and the index.
 *
 * The bias of this file is negative cases, because the positive path is proved
 * again by every other STE-16 test that goes through `FakeChain`. What is only
 * proved here is the *refusal*: an indexer that accepts a half-understood
 * struct writes a row that looks right and is wrong, and nothing downstream
 * ever questions it again.
 */
import { describe, expect, it } from "vitest";
import {
  ChainDecodeError,
  EVENT_STATUSES,
  RECORD_STATES,
  accountAddress,
  bytes32Hex,
  decodeCategory,
  decodeEvent,
  decodeRecord,
  decodeTokenIds,
  i128,
  optional,
  text,
  u32,
  u64,
  unitEnum,
} from "../src/chain/decode.js";

import { EVENT_REGISTRY, ORGANISER } from "./helpers/addresses.js";
const HASH = "ab".repeat(32);

/** The exact shape `scValToNative` produces for `RecordData`. */
const record = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  bib_no: 7,
  category_id: 1,
  claimed_at: null,
  entered_at: 1_800_000_100n,
  event_id: 3,
  finish_time_s: null,
  participant_hash: Buffer.from(HASH, "hex"),
  result_at: null,
  state: ["Entered"],
  ...overrides,
});

const event = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  metadata_hash: Buffer.from(HASH, "hex"),
  name: "Jakarta Run",
  organiser: ORGANISER,
  starts_at: 1_800_000_000n,
  status: ["Open"],
  uri: "ipfs://event/0",
  ...overrides,
});

const category = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  code: "10K",
  distance_m: 10_000,
  entered_count: 3,
  price_usdc: 50_000_000n,
  quota: 200,
  ...overrides,
});

describe("primitives", () => {
  it("takes a u32 as the JS number scValToNative produces", () => {
    expect(u32(0, "x")).toBe(0);
    expect(u32(4_294_967_295, "x")).toBe(4_294_967_295);
  });

  it.each([
    ["a bigint", 5n],
    ["a numeric string", "5"],
    ["a float", 1.5],
    ["null", null],
    ["undefined", undefined],
  ])("refuses %s as a u32", (_label, value) => {
    expect(() => u32(value, "field")).toThrow(ChainDecodeError);
  });

  it.each([
    ["negative", -1],
    ["above 2^32", 4_294_967_296],
  ])("refuses a u32 that is %s", (_label, value) => {
    expect(() => u32(value, "field")).toThrow(/out of range/);
  });

  it("takes a u64 only as a bigint — a Number would lose precision above 2^53", () => {
    expect(u64(18_446_744_073_709_551_615n, "x")).toBe(18_446_744_073_709_551_615n);
    expect(() => u64(5, "x")).toThrow(/expected a u64/);
    expect(() => u64(-1n, "x")).toThrow(/out of range/);
    expect(() => u64(18_446_744_073_709_551_616n, "x")).toThrow(/out of range/);
  });

  it("takes an i128 as a bigint, including negative", () => {
    // i128 is signed. price_usdc cannot be negative (the contract rejects it),
    // but this decoder is for i128 and not for prices.
    expect(i128(-1n, "x")).toBe(-1n);
    expect(() => i128(1, "x")).toThrow(/expected an i128/);
  });

  it("maps Option::None to null and Option::Some to the value", () => {
    expect(optional(null, "x", u32)).toBeNull();
    expect(optional(9, "x", u32)).toBe(9);
  });

  it("does not treat undefined as None — a missing key is a shape change", () => {
    expect(() => optional(undefined, "x", u32)).toThrow(ChainDecodeError);
  });

  it("renders BytesN<32> as lowercase hex without a prefix", () => {
    expect(bytes32Hex(Buffer.alloc(32, 0xab), "x")).toBe("ab".repeat(32));
    expect(bytes32Hex(new Uint8Array(32).fill(1), "x")).toBe("01".repeat(32));
  });

  it.each([
    ["31 bytes", Buffer.alloc(31)],
    ["33 bytes", Buffer.alloc(33)],
    ["a hex string", "ab".repeat(32)],
    ["null", null],
  ])("refuses %s as BytesN<32>", (_label, value) => {
    expect(() => bytes32Hex(value, "field")).toThrow(ChainDecodeError);
  });

  it("reads a unit enum from the one-element vec the host emits", () => {
    expect(unitEnum(["Entered"], "x", RECORD_STATES)).toBe("Entered");
  });

  it("also accepts the bare variant name, so fixtures stay readable", () => {
    expect(unitEnum("Open", "x", EVENT_STATUSES)).toBe("Open");
  });

  it.each([
    ["an unknown variant", ["Cancelled"]],
    ["a two-element vec", ["Entered", "Finished"]],
    ["an empty vec", []],
    ["a number", 0],
  ])("refuses %s as a RecordState", (_label, value) => {
    expect(() => unitEnum(value, "field", RECORD_STATES)).toThrow(ChainDecodeError);
  });

  it("accepts a G-address and refuses anything else shaped like one", () => {
    expect(accountAddress(ORGANISER, "x")).toBe(ORGANISER);
    // A contract address is a valid Stellar address and NOT a valid runner.
    expect(() =>
      accountAddress(EVENT_REGISTRY, "x"),
    ).toThrow(/not a Stellar account address/);
    expect(() => accountAddress(`${ORGANISER}X`, "x")).toThrow(ChainDecodeError);
    expect(() => accountAddress(ORGANISER.toLowerCase(), "x")).toThrow(ChainDecodeError);
  });

  it("refuses a non-string where the spec says String", () => {
    expect(text("Jakarta Run", "x")).toBe("Jakarta Run");
    expect(() => text(1, "x")).toThrow(ChainDecodeError);
  });
});

describe("RecordData", () => {
  it("decodes the frozen shape", () => {
    expect(decodeRecord(42, record())).toEqual({
      tokenId: 42,
      eventId: 3,
      categoryId: 1,
      bibNo: 7,
      participantHash: HASH,
      state: "Entered",
      enteredAt: 1_800_000_100n,
      claimedAt: null,
      finishTimeS: null,
      resultAt: null,
    });
  });

  it("decodes a finished record with every Option present", () => {
    const decoded = decodeRecord(
      1,
      record({
        state: ["Finished"],
        claimed_at: 1_800_000_200n,
        finish_time_s: 3_600,
        result_at: 1_800_000_300n,
      }),
    );
    expect(decoded.state).toBe("Finished");
    expect(decoded.claimedAt).toBe(1_800_000_200n);
    expect(decoded.finishTimeS).toBe(3_600);
    expect(decoded.resultAt).toBe(1_800_000_300n);
  });

  it("decodes a DNF that never claimed a pack — claimed_at stays absent", () => {
    const decoded = decodeRecord(
      1,
      record({ state: ["Dnf"], claimed_at: null, result_at: 1_800_000_400n }),
    );
    expect(decoded.claimedAt).toBeNull();
    expect(decoded.resultAt).toBe(1_800_000_400n);
  });

  it.each([
    "bib_no",
    "category_id",
    "claimed_at",
    "entered_at",
    "event_id",
    "finish_time_s",
    "participant_hash",
    "result_at",
    "state",
  ])("refuses a struct missing %s", (field) => {
    const partial = record();
    delete partial[field];
    expect(() => decodeRecord(1, partial)).toThrow(new RegExp(`${field}.*missing`));
  });

  it("names the field and the token in the error, so a log line is actionable", () => {
    expect(() => decodeRecord(77, record({ bib_no: "7" }))).toThrow(
      /RecordData\(77\)\.bib_no: expected a u32/,
    );
  });

  it.each([
    ["a string", "not a struct"],
    ["an array", []],
    ["null", null],
    ["a buffer", Buffer.alloc(4)],
  ])("refuses %s where a struct belongs", (_label, value) => {
    expect(() => decodeRecord(1, value)).toThrow(/expected a struct/);
  });

  it("ignores fields the contract might add later", () => {
    // Forward compatibility in one direction only: a NEW field is fine, a
    // MISSING one is not. That is what lets a contract grow without a backend
    // deploy while still catching a removal.
    expect(decodeRecord(1, record({ some_future_field: 1 })).bibNo).toBe(7);
  });
});

describe("EventData", () => {
  it("decodes the frozen shape, carrying in the id the struct does not hold", () => {
    expect(decodeEvent(2, event())).toEqual({
      eventId: 2,
      organiser: ORGANISER,
      name: "Jakarta Run",
      metadataHash: HASH,
      uri: "ipfs://event/0",
      startsAt: 1_800_000_000n,
      status: "Open",
    });
  });

  it.each(EVENT_STATUSES)("accepts status %s", (status) => {
    expect(decodeEvent(0, event({ status: [status] })).status).toBe(status);
  });

  it.each(["metadata_hash", "name", "organiser", "starts_at", "status", "uri"])(
    "refuses a struct missing %s",
    (field) => {
      const partial = event();
      delete partial[field];
      expect(() => decodeEvent(0, partial)).toThrow(ChainDecodeError);
    },
  );

  it("refuses an organiser that is a contract rather than an account", () => {
    expect(() =>
      decodeEvent(0, event({ organiser: EVENT_REGISTRY })),
    ).toThrow(ChainDecodeError);
  });
});

describe("CategoryData", () => {
  it("decodes the frozen shape and keeps the price as a bigint", () => {
    const decoded = decodeCategory(1, 0, category());
    expect(decoded).toEqual({
      eventId: 1,
      categoryId: 0,
      code: "10K",
      distanceM: 10_000,
      quota: 200,
      priceStroops: 50_000_000n,
      enteredCount: 3,
    });
    // 5 sUSD in 7-decimal representation. Never a float: 0.1 sUSD through a
    // double is off by a stroop, and a stroop off is a failed `enter`.
    expect(typeof decoded.priceStroops).toBe("bigint");
  });

  it("accepts a free category priced at zero", () => {
    expect(decodeCategory(0, 0, category({ price_usdc: 0n })).priceStroops).toBe(0n);
  });

  it("refuses a price that arrived as a number", () => {
    expect(() => decodeCategory(0, 0, category({ price_usdc: 50_000_000 }))).toThrow(
      /price_usdc: expected an i128/,
    );
  });
});

describe("records_of", () => {
  it("decodes a vec of token ids", () => {
    expect(decodeTokenIds([3, 1, 2])).toEqual([3, 1, 2]);
  });

  it("decodes the empty vec a runner with no records returns", () => {
    expect(decodeTokenIds([])).toEqual([]);
  });

  it("refuses a non-vec and names the index of a bad element", () => {
    expect(() => decodeTokenIds("nope")).toThrow(/expected a vec of u32/);
    expect(() => decodeTokenIds([1, "2"])).toThrow(/\[1\]: expected a u32/);
  });
});
