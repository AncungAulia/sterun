/**
 * STE-15 (C5) — the shapes callers see, and the translation from the shapes the
 * contracts speak.
 *
 * The generated bindings hand back the contract's own vocabulary: `snake_case`
 * fields, `Buffer` for `BytesN<32>`, `bigint` for `u64`, and tagged unions like
 * `{ tag: "Open", values: void }` for enums. That is a faithful mirror of the
 * wasm, and it is the wrong thing to put in front of somebody writing an
 * organiser console — the D2 promise is "integrate without writing Rust", and
 * a `{ tag: … }` enum is Rust leaking through.
 *
 * So this module defines the caller-facing shape and owns the conversion:
 *
 *   - `snake_case` -> `camelCase`, because the consumers are TypeScript apps;
 *   - `Buffer` -> lowercase hex `string`, because a 32-byte hash is copied into
 *     URLs, compared in tests, and shown to humans far more often than it is
 *     manipulated as bytes (and `Buffer` does not exist in a browser);
 *   - tagged union -> string literal union, so `state === "Finished"` works and
 *     a typo is a compile error;
 *   - `Option<T>` -> `T | null`, one absent value instead of two.
 *
 * Money and time deliberately do NOT get friendlier: `priceStroops` stays
 * `bigint` and `startsAt` stays `bigint`. An entry fee is `i128` in 7-decimal
 * stroops, and a float round-trip of 0.1 sUSD is off by one stroop — which is
 * enough to make `enter` fail with an error the caller cannot act on. The names
 * carry the unit so nobody has to guess.
 */
import type { EventData, CategoryData, EventStatus as BindingEventStatus } from "event-registry";
import type { RecordData, RecordState as BindingRecordState } from "race-record";

/**
 * Event lifecycle. Legal transitions (INTERFACE.md §1.2; anything else reverts
 * `InvalidStatus(11)`, including a transition to the current status):
 *
 *     Draft     -> Open | Closed
 *     Open      -> Closed | Completed
 *     Closed    -> Open | Completed
 *     Completed -> (terminal)
 */
export type EventStatus = "Draft" | "Open" | "Closed" | "Completed";

/**
 * Record lifecycle. `Finished` and `Dnf` are terminal — there is no exported
 * contract path out of either (INTERFACE.md §2.2).
 */
export type RecordState = "Entered" | "RacepackClaimed" | "Finished" | "Dnf";

export const EVENT_STATUSES: readonly EventStatus[] = ["Draft", "Open", "Closed", "Completed"];
export const RECORD_STATES: readonly RecordState[] = [
  "Entered",
  "RacepackClaimed",
  "Finished",
  "Dnf",
];

/** One event, as `get_event` returns it plus the id the caller asked for. */
export interface SterunEvent {
  eventId: number;
  organiser: string;
  name: string;
  /** sha256 of the off-chain metadata document, lowercase hex, 64 chars. */
  metadataHash: string;
  uri: string;
  /** Unix seconds. `u64` on chain, so `bigint` here. */
  startsAt: bigint;
  status: EventStatus;
}

/** One distance category. `enteredCount` doubles as the next bib number. */
export interface SterunCategory {
  eventId: number;
  categoryId: number;
  /** Soroban `Symbol`, e.g. `10K`. */
  code: string;
  distanceM: number;
  quota: number;
  enteredCount: number;
  /** Entry fee in token stroops (7 decimals). `0n` means a free category. */
  priceStroops: bigint;
  /** `quota - enteredCount`, never negative. Convenience, not chain state. */
  slotsLeft: number;
}

/** One race record. The verifiable thing this whole protocol exists to produce. */
export interface SterunRecord {
  tokenId: number;
  eventId: number;
  categoryId: number;
  bibNo: number;
  /** `sha256(name || national_id || emergency_contact || salt)`, lowercase hex. */
  participantHash: string;
  state: RecordState;
  /** Unix seconds. */
  enteredAt: bigint;
  claimedAt: bigint | null;
  /** Net finish time in seconds. `null` until `record_finish` lands. */
  finishTimeS: number | null;
  resultAt: bigint | null;
}

/** 7 decimals, like every classic Stellar asset exposed through a SAC. */
export const STROOPS_PER_UNIT = 10_000_000n;

/**
 * Stroops as a decimal string — for display only.
 *
 * There is deliberately no `parse` counterpart taking a decimal string: every
 * amount that reaches a contract in this SDK is a `bigint` the caller built,
 * so there is no place where a rounding decision could hide.
 */
export function formatStroops(stroops: bigint): string {
  const sign = stroops < 0n ? "-" : "";
  const abs = stroops < 0n ? -stroops : stroops;
  const whole = abs / STROOPS_PER_UNIT;
  const frac = (abs % STROOPS_PER_UNIT).toString().padStart(7, "0").replace(/0+$/, "");
  return `${sign}${whole}${frac ? `.${frac}` : ""}`;
}

/** Lowercase hex of a 32-byte value, whatever byte container it arrived in. */
export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/**
 * 64 hex chars -> the 32 bytes a `BytesN<32>` argument needs.
 *
 * Strict about length because the alternative is worse: a 31-byte hash is
 * accepted by nothing on chain, but a *silently truncated* one would be
 * accepted by everything and verify against nobody.
 */
export function fromHex32(hex: string, label: string): Buffer {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new TypeError(`${label} must be 32 bytes as 64 hex characters, got ${JSON.stringify(hex)}`);
  }
  return Buffer.from(clean, "hex");
}

const asUint8 = (value: Buffer | Uint8Array): Uint8Array =>
  value instanceof Uint8Array ? value : new Uint8Array(value);

export const toEventStatus = (status: BindingEventStatus): EventStatus => status.tag;
export const toRecordState = (state: BindingRecordState): RecordState => state.tag;

/** The tagged-union shape the bindings want back when we send a status. */
export const fromEventStatus = (status: EventStatus): BindingEventStatus =>
  ({ tag: status, values: undefined }) as BindingEventStatus;

export function toSterunEvent(eventId: number, data: EventData): SterunEvent {
  return {
    eventId,
    organiser: data.organiser,
    name: data.name,
    metadataHash: toHex(asUint8(data.metadata_hash)),
    uri: data.uri,
    startsAt: data.starts_at,
    status: toEventStatus(data.status),
  };
}

export function toSterunCategory(
  eventId: number,
  categoryId: number,
  data: CategoryData,
): SterunCategory {
  return {
    eventId,
    categoryId,
    code: data.code,
    distanceM: data.distance_m,
    quota: data.quota,
    enteredCount: data.entered_count,
    priceStroops: data.price_usdc,
    slotsLeft: Math.max(0, data.quota - data.entered_count),
  };
}

export function toSterunRecord(tokenId: number, data: RecordData): SterunRecord {
  return {
    tokenId,
    eventId: data.event_id,
    categoryId: data.category_id,
    bibNo: data.bib_no,
    participantHash: toHex(asUint8(data.participant_hash)),
    state: toRecordState(data.state),
    enteredAt: data.entered_at,
    claimedAt: data.claimed_at ?? null,
    finishTimeS: data.finish_time_s ?? null,
    resultAt: data.result_at ?? null,
  };
}
