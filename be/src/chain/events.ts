/**
 * STE-16 (C8) — decoding contract events into something an indexer can apply.
 *
 * The shapes are frozen in `docs/specs/INTERFACE.md` §1.3 and §2.3: topics are
 * `[Symbol(name), ...#[topic] fields in declaration order]` and data is a map
 * keyed by field name (alphabetical), empty when every field is a topic.
 *
 * Two rules here are security properties rather than tidiness, and both have
 * tests that fail loudly if they are ever relaxed:
 *
 *   **Filter by contract id, not by topic name.** INTERFACE.md §2.3 says so
 *   outright. Anyone can deploy a contract that emits `record_entered` with any
 *   payload they like; `getEvents` will return it if our filter is a topic
 *   filter alone. Only the two addresses in `docs/deployments.md` may produce
 *   Sterun events, and each name is bound to the one contract that owns it.
 *
 *   **Ignore what we do not recognise; refuse what we half-recognise.** An
 *   unknown event name, or one of ours from the wrong emitter, is skipped —
 *   the chain is allowed to contain things this version does not model. But an
 *   event that IS ours, from the right contract, with the wrong payload shape
 *   is a spec drift, and swallowing it would mean writing wrong rows quietly.
 *   That throws.
 */
import { scValToNative, type rpc } from "@stellar/stellar-sdk";
import {
  ChainDecodeError,
  EVENT_STATUSES,
  accountAddress,
  i128,
  u32,
  unitEnum,
  type EventStatus,
} from "./decode.js";

/** One event as it comes off the RPC, already converted out of XDR. */
export interface RawChainEvent {
  /** The RPC event id — unique, and the natural primary key for ingestion. */
  id: string;
  contractId: string;
  type: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  inSuccessfulContractCall: boolean;
  /** `scValToNative` of each topic. */
  topics: unknown[];
  /** `scValToNative` of the data map. `{}` when the event has no data fields. */
  data: unknown;
}

export type DecodedEvent =
  | { name: "event_created"; eventId: number; organiser: string }
  | {
      name: "category_added";
      eventId: number;
      categoryId: number;
      priceStroops: bigint;
      quota: number;
    }
  | { name: "event_status_changed"; eventId: number; status: EventStatus }
  | { name: "scanner_added"; eventId: number; scanner: string }
  | { name: "scanner_removed"; eventId: number; scanner: string }
  | { name: "slot_reserved"; eventId: number; categoryId: number; seq: number }
  | { name: "mint"; to: string; tokenId: number }
  | { name: "record_entered"; runner: string; eventId: number; bibNo: number; tokenId: number }
  | { name: "racepack_claimed"; tokenId: number; eventId: number; operator: string }
  | { name: "record_finished"; tokenId: number; eventId: number; finishTimeS: number }
  | { name: "record_dnf"; tokenId: number; eventId: number };

export type DecodedEventName = DecodedEvent["name"];

/** An event plus where on the chain it happened. */
export interface ChainEventEnvelope {
  id: string;
  contractId: string;
  ledger: number;
  ledgerClosedAt: Date;
  txHash: string;
  event: DecodedEvent;
}

export interface KnownContracts {
  eventRegistry: string;
  raceRecord: string;
}

/** Which contract is allowed to emit each name. Nothing else may. */
const EMITTER: Readonly<Record<DecodedEventName, keyof KnownContracts>> = {
  event_created: "eventRegistry",
  category_added: "eventRegistry",
  event_status_changed: "eventRegistry",
  scanner_added: "eventRegistry",
  scanner_removed: "eventRegistry",
  slot_reserved: "eventRegistry",
  mint: "raceRecord",
  record_entered: "raceRecord",
  racepack_claimed: "raceRecord",
  record_finished: "raceRecord",
  record_dnf: "raceRecord",
};

export const KNOWN_EVENT_NAMES = Object.keys(EMITTER) as DecodedEventName[];

const isName = (s: string): s is DecodedEventName => s in EMITTER;

function topic(raw: RawChainEvent, index: number, at: string): unknown {
  const value = raw.topics[index];
  if (value === undefined) {
    throw new ChainDecodeError(
      `${at}.topics[${index}]`,
      `missing — event has ${raw.topics.length} topics, which is not the frozen shape`,
    );
  }
  return value;
}

function dataField(raw: RawChainEvent, key: string, at: string): unknown {
  const data = raw.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ChainDecodeError(`${at}.data`, "expected a map of field name to value");
  }
  if (!(key in data)) {
    throw new ChainDecodeError(`${at}.data.${key}`, "missing from the event's data map");
  }
  return (data as Record<string, unknown>)[key];
}

/**
 * Decode one event, or `null` when it is not one of ours.
 *
 * `null` covers: a system event, an event from a failed invocation, an event
 * from any contract other than the two we deployed, an unknown topic name, and
 * one of our names emitted by the wrong one of our two contracts (a
 * `record_entered` from EventRegistry is not a Sterun entry).
 */
export function decodeChainEvent(
  raw: RawChainEvent,
  contracts: KnownContracts,
): ChainEventEnvelope | null {
  if (raw.type !== "contract") return null;
  if (!raw.inSuccessfulContractCall) return null;

  const first = raw.topics[0];
  if (typeof first !== "string" || !isName(first)) return null;
  const name: DecodedEventName = first;

  // The contract-id gate. Deliberately before any payload decoding, so a forged
  // event never even reaches a decoder that could throw and turn someone else's
  // contract into an indexer outage.
  if (raw.contractId !== contracts[EMITTER[name]]) return null;

  const at = `${name}@${raw.id}`;
  const event = decodePayload(name, raw, at);

  const closedAt = new Date(raw.ledgerClosedAt);
  if (Number.isNaN(closedAt.getTime())) {
    throw new ChainDecodeError(`${at}.ledgerClosedAt`, `not a timestamp: ${raw.ledgerClosedAt}`);
  }

  return {
    id: raw.id,
    contractId: raw.contractId,
    ledger: u32(raw.ledger, `${at}.ledger`),
    ledgerClosedAt: closedAt,
    txHash: raw.txHash,
    event,
  };
}

function decodePayload(name: DecodedEventName, raw: RawChainEvent, at: string): DecodedEvent {
  switch (name) {
    case "event_created":
      return {
        name,
        eventId: u32(topic(raw, 1, at), `${at}.event_id`),
        organiser: accountAddress(topic(raw, 2, at), `${at}.organiser`),
      };
    case "category_added":
      return {
        name,
        eventId: u32(topic(raw, 1, at), `${at}.event_id`),
        categoryId: u32(dataField(raw, "category_id", at), `${at}.category_id`),
        priceStroops: i128(dataField(raw, "price", at), `${at}.price`),
        quota: u32(dataField(raw, "quota", at), `${at}.quota`),
      };
    case "event_status_changed":
      return {
        name,
        eventId: u32(topic(raw, 1, at), `${at}.event_id`),
        status: unitEnum(dataField(raw, "status", at), `${at}.status`, EVENT_STATUSES),
      };
    case "scanner_added":
    case "scanner_removed":
      return {
        name,
        eventId: u32(topic(raw, 1, at), `${at}.event_id`),
        scanner: accountAddress(topic(raw, 2, at), `${at}.scanner`),
      };
    case "slot_reserved":
      return {
        name,
        eventId: u32(topic(raw, 1, at), `${at}.event_id`),
        categoryId: u32(topic(raw, 2, at), `${at}.category_id`),
        seq: u32(dataField(raw, "seq", at), `${at}.seq`),
      };
    case "mint":
      return {
        name,
        to: accountAddress(topic(raw, 1, at), `${at}.to`),
        tokenId: u32(dataField(raw, "token_id", at), `${at}.token_id`),
      };
    case "record_entered":
      return {
        name,
        runner: accountAddress(topic(raw, 1, at), `${at}.runner`),
        eventId: u32(topic(raw, 2, at), `${at}.event_id`),
        bibNo: u32(dataField(raw, "bib_no", at), `${at}.bib_no`),
        tokenId: u32(dataField(raw, "token_id", at), `${at}.token_id`),
      };
    case "racepack_claimed":
      return {
        name,
        tokenId: u32(topic(raw, 1, at), `${at}.token_id`),
        eventId: u32(topic(raw, 2, at), `${at}.event_id`),
        operator: accountAddress(dataField(raw, "operator", at), `${at}.operator`),
      };
    case "record_finished":
      return {
        name,
        tokenId: u32(topic(raw, 1, at), `${at}.token_id`),
        eventId: u32(topic(raw, 2, at), `${at}.event_id`),
        finishTimeS: u32(dataField(raw, "finish_time_s", at), `${at}.finish_time_s`),
      };
    case "record_dnf":
      return {
        name,
        tokenId: u32(topic(raw, 1, at), `${at}.token_id`),
        eventId: u32(topic(raw, 2, at), `${at}.event_id`),
      };
  }
}

/**
 * `rpc.Api.EventResponse` -> {@link RawChainEvent}.
 *
 * `contractId` is optional in the SDK's type (system events have none), and an
 * event without one can never match a contract filter, so it becomes the empty
 * string and is dropped by the gate above rather than crashing here.
 */
export function fromRpcEvent(e: rpc.Api.EventResponse): RawChainEvent {
  return {
    id: e.id,
    contractId: e.contractId ? e.contractId.contractId() : "",
    type: e.type,
    ledger: e.ledger,
    ledgerClosedAt: e.ledgerClosedAt,
    txHash: e.txHash,
    inSuccessfulContractCall: e.inSuccessfulContractCall,
    topics: e.topic.map((t) => scValToNative(t)),
    data: scValToNative(e.value),
  };
}
