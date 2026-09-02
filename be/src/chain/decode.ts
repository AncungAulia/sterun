/**
 * STE-16 (C8) — turning contract return values into typed rows.
 *
 * `scValToNative` gets us from XDR to plain JavaScript, and then stops being
 * helpful: a `RecordData` arrives as `Record<string, unknown>` where a u64 is a
 * bigint, an `Option<T>` that is `None` is `null`, and a unit enum variant is a
 * one-element array of strings (`["Entered"]`). Nothing checks that the shape
 * is the one `docs/specs/INTERFACE.md` froze.
 *
 * This module does that check, and it refuses rather than guesses. An indexer
 * is a cache that people will later trust as if it were the chain, so the
 * failure mode to avoid is not "crashed on a weird value" — it is "wrote a row
 * that looks fine and is wrong". Every decoder here throws
 * {@link ChainDecodeError} naming the field and what it saw, and no decoder has
 * a default.
 *
 * The field lists below are the frozen ones (INTERFACE.md §1.2 and §2.2). If a
 * contract change ever adds a field, these decoders keep working (unknown keys
 * are ignored) but the missing-field tests will catch a *removed* one.
 */

/** Lifecycle states of a race record — INTERFACE.md §2.2. */
export const RECORD_STATES = ["Entered", "RacepackClaimed", "Finished", "Dnf"] as const;
export type RecordState = (typeof RECORD_STATES)[number];

/** Event statuses — INTERFACE.md §1.2. */
export const EVENT_STATUSES = ["Draft", "Open", "Closed", "Completed"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export class ChainDecodeError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(`${field}: ${message}`);
    this.name = "ChainDecodeError";
  }
}

/** `EventData` plus the id it was read under, which the struct does not carry. */
export interface ChainEvent {
  eventId: number;
  organiser: string;
  name: string;
  /** lowercase hex, 64 chars — the commitment to the off-chain metadata doc. */
  metadataHash: string;
  uri: string;
  /** Unix seconds. u64 on-chain, so bigint here. */
  startsAt: bigint;
  status: EventStatus;
}

/** `CategoryData` plus the `(event_id, category_id)` it was read under. */
export interface ChainCategory {
  eventId: number;
  categoryId: number;
  code: string;
  distanceM: number;
  quota: number;
  /** `price_usdc`, i128 in the token's 7-decimal representation. Never a float. */
  priceStroops: bigint;
  /** Also the next bib sequence for the category. */
  enteredCount: number;
}

/** `RecordData` plus the token id and owner, which the struct does not carry. */
export interface ChainRecord {
  tokenId: number;
  eventId: number;
  categoryId: number;
  bibNo: number;
  /** lowercase hex, 64 chars. */
  participantHash: string;
  state: RecordState;
  enteredAt: bigint;
  claimedAt: bigint | null;
  finishTimeS: number | null;
  resultAt: bigint | null;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !Buffer.isBuffer(v);

function field(source: unknown, name: string, at: string): unknown {
  if (!isPlainObject(source)) {
    throw new ChainDecodeError(at, `expected a struct, got ${describe(source)}`);
  }
  if (!(name in source)) {
    throw new ChainDecodeError(
      `${at}.${name}`,
      "missing — the contract's return shape no longer matches docs/specs/INTERFACE.md",
    );
  }
  return source[name];
}

/** A short, safe rendering of an unexpected value for an error message. */
function describe(v: unknown): string {
  if (v === null) return "null";
  if (Buffer.isBuffer(v)) return `${v.length}-byte buffer`;
  if (Array.isArray(v)) return `array(${v.length})`;
  if (typeof v === "bigint") return `bigint ${v}`;
  if (typeof v === "object") return "object";
  return `${typeof v} ${JSON.stringify(v)}`;
}

/**
 * A u32 as it arrives from `scValToNative`: a JS number, already in range.
 *
 * Rejecting non-integers and negatives is not paranoia about the host — it is
 * what makes a decoder that is also fed hand-built fixtures and (in rebuild)
 * values that crossed a JSON boundary safe to trust.
 */
export function u32(value: unknown, at: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ChainDecodeError(at, `expected a u32, got ${describe(value)}`);
  }
  if (value < 0 || value > 0xff_ff_ff_ff) {
    throw new ChainDecodeError(at, `u32 out of range: ${value}`);
  }
  return value;
}

/** A u64 — a bigint, because 2^53 is not the limit the contract works to. */
export function u64(value: unknown, at: string): bigint {
  if (typeof value !== "bigint") {
    throw new ChainDecodeError(at, `expected a u64 (bigint), got ${describe(value)}`);
  }
  if (value < 0n || value > 0xff_ff_ff_ff_ff_ff_ff_ffn) {
    throw new ChainDecodeError(at, `u64 out of range: ${value}`);
  }
  return value;
}

/** An i128 — money. bigint all the way; a float here loses stroops. */
export function i128(value: unknown, at: string): bigint {
  if (typeof value !== "bigint") {
    throw new ChainDecodeError(at, `expected an i128 (bigint), got ${describe(value)}`);
  }
  return value;
}

/**
 * `Option<T>` — `None` decodes to `null`, `Some(v)` to `v`.
 *
 * Only `null` counts as absent. `undefined` means the key was missing entirely,
 * which is a shape change rather than an empty option, and `field()` has
 * already rejected it.
 */
export function optional<T>(
  value: unknown,
  at: string,
  decode: (v: unknown, at: string) => T,
): T | null {
  return value === null ? null : decode(value, at);
}

export function text(value: unknown, at: string): string {
  if (typeof value !== "string") {
    throw new ChainDecodeError(at, `expected a string, got ${describe(value)}`);
  }
  return value;
}

/**
 * `BytesN<32>` as lowercase hex.
 *
 * Hex rather than a Buffer because everything downstream — Postgres `bytea`
 * comparisons, the JSON API, `docs/specs/HASH_AND_TOTP.md` — speaks in
 * lowercase hex without a `0x` prefix.
 */
export function bytes32Hex(value: unknown, at: string): string {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    throw new ChainDecodeError(at, `expected 32 bytes, got ${describe(value)}`);
  }
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (buf.length !== 32) {
    throw new ChainDecodeError(at, `expected 32 bytes, got ${buf.length}`);
  }
  return buf.toString("hex");
}

/**
 * A Soroban unit enum variant.
 *
 * `#[contracttype] enum` variants encode as a vec whose first element is the
 * variant name, so `scValToNative` yields `["Entered"]`. Accepting the bare
 * string too costs nothing and makes hand-written fixtures readable.
 */
export function unitEnum<T extends string>(
  value: unknown,
  at: string,
  allowed: readonly T[],
): T {
  const name = Array.isArray(value) ? value[0] : value;
  if (typeof name !== "string") {
    throw new ChainDecodeError(at, `expected an enum variant, got ${describe(value)}`);
  }
  if (Array.isArray(value) && value.length !== 1) {
    throw new ChainDecodeError(
      at,
      `expected a unit enum variant (one element), got ${value.length} elements`,
    );
  }
  if (!(allowed as readonly string[]).includes(name)) {
    throw new ChainDecodeError(at, `unknown variant ${JSON.stringify(name)}; expected one of ${allowed.join(", ")}`);
  }
  return name as T;
}

/**
 * A Stellar account address (`G…`).
 *
 * Checked by shape rather than by `StrKey`, deliberately: this rejects the same
 * strings the `participants.runner_address` CHECK constraint rejects, so a
 * value that decodes here is a value that can be stored.
 */
export function accountAddress(value: unknown, at: string): string {
  const s = text(value, at);
  if (!/^G[A-Z2-7]{55}$/.test(s)) {
    throw new ChainDecodeError(at, `not a Stellar account address: ${JSON.stringify(s.slice(0, 12))}…`);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Structs — the frozen shapes
// ---------------------------------------------------------------------------

export function decodeEvent(eventId: number, value: unknown): ChainEvent {
  const at = `EventData(${eventId})`;
  return {
    eventId: u32(eventId, `${at}.event_id`),
    organiser: accountAddress(field(value, "organiser", at), `${at}.organiser`),
    name: text(field(value, "name", at), `${at}.name`),
    metadataHash: bytes32Hex(field(value, "metadata_hash", at), `${at}.metadata_hash`),
    uri: text(field(value, "uri", at), `${at}.uri`),
    startsAt: u64(field(value, "starts_at", at), `${at}.starts_at`),
    status: unitEnum(field(value, "status", at), `${at}.status`, EVENT_STATUSES),
  };
}

export function decodeCategory(eventId: number, categoryId: number, value: unknown): ChainCategory {
  const at = `CategoryData(${eventId},${categoryId})`;
  return {
    eventId: u32(eventId, `${at}.event_id`),
    categoryId: u32(categoryId, `${at}.category_id`),
    code: text(field(value, "code", at), `${at}.code`),
    distanceM: u32(field(value, "distance_m", at), `${at}.distance_m`),
    quota: u32(field(value, "quota", at), `${at}.quota`),
    priceStroops: i128(field(value, "price_usdc", at), `${at}.price_usdc`),
    enteredCount: u32(field(value, "entered_count", at), `${at}.entered_count`),
  };
}

export function decodeRecord(tokenId: number, value: unknown): ChainRecord {
  const at = `RecordData(${tokenId})`;
  return {
    tokenId: u32(tokenId, `${at}.token_id`),
    eventId: u32(field(value, "event_id", at), `${at}.event_id`),
    categoryId: u32(field(value, "category_id", at), `${at}.category_id`),
    bibNo: u32(field(value, "bib_no", at), `${at}.bib_no`),
    participantHash: bytes32Hex(field(value, "participant_hash", at), `${at}.participant_hash`),
    state: unitEnum(field(value, "state", at), `${at}.state`, RECORD_STATES),
    enteredAt: u64(field(value, "entered_at", at), `${at}.entered_at`),
    claimedAt: optional(field(value, "claimed_at", at), `${at}.claimed_at`, u64),
    finishTimeS: optional(field(value, "finish_time_s", at), `${at}.finish_time_s`, u32),
    resultAt: optional(field(value, "result_at", at), `${at}.result_at`, u64),
  };
}

/** `records_of` — a `Vec<u32>`, empty rather than reverting when there are none. */
export function decodeTokenIds(value: unknown, at = "records_of"): number[] {
  if (!Array.isArray(value)) {
    throw new ChainDecodeError(at, `expected a vec of u32, got ${describe(value)}`);
  }
  return value.map((v, i) => u32(v, `${at}[${i}]`));
}
