/**
 * STE-16 — decoding the eleven frozen contract events.
 *
 * The security-relevant half of this file is "events from the wrong contract".
 * `getEvents` is a public feed: anybody can deploy a contract that publishes a
 * topic named `record_entered` carrying whatever they like, and an indexer that
 * filters on topic names alone will happily materialise it. INTERFACE.md §2.3
 * says to filter per contract id; these tests are what makes that true rather
 * than intended.
 */
import { describe, expect, it } from "vitest";
import { ChainDecodeError } from "../src/chain/decode.js";
import {
  KNOWN_EVENT_NAMES,
  decodeChainEvent,
  type KnownContracts,
  type RawChainEvent,
} from "../src/chain/events.js";
import {
  categoryAdded,
  eventCreated,
  eventStatusChanged,
  mint,
  racepackClaimed,
  recordDnf,
  recordEntered,
  recordFinished,
  scannerAdded,
  scannerRemoved,
  slotReserved,
} from "./helpers/fake-events.js";

import { ADDRESSES, ORGANISER, RUNNER, SCANNER, SUSD_SAC as SAC } from "./helpers/addresses.js";

const CONTRACTS: KnownContracts = ADDRESSES;

const registry = { contractId: CONTRACTS.eventRegistry };
const raceRecord = { contractId: CONTRACTS.raceRecord };

const decode = (raw: RawChainEvent) => decodeChainEvent(raw, CONTRACTS);

describe("EventRegistry events (INTERFACE.md §1.3)", () => {
  it("decodes event_created — both fields are topics, data is empty", () => {
    const decoded = decode(eventCreated(registry, 3, ORGANISER));
    expect(decoded?.event).toEqual({ name: "event_created", eventId: 3, organiser: ORGANISER });
  });

  it("decodes category_added — event_id is the only topic, the rest is data", () => {
    const decoded = decode(categoryAdded(registry, 1, 2, 200, 50_000_000n));
    expect(decoded?.event).toEqual({
      name: "category_added",
      eventId: 1,
      categoryId: 2,
      quota: 200,
      priceStroops: 50_000_000n,
    });
  });

  it("keeps the price as a bigint all the way through", () => {
    const decoded = decode(categoryAdded(registry, 0, 0, 1, 1n));
    expect(decoded?.event).toMatchObject({ priceStroops: 1n });
  });

  it("decodes event_status_changed, whose status is an enum in the data map", () => {
    const decoded = decode(eventStatusChanged(registry, 1, "Open"));
    expect(decoded?.event).toEqual({ name: "event_status_changed", eventId: 1, status: "Open" });
  });

  it("decodes scanner_added and scanner_removed", () => {
    expect(decode(scannerAdded(registry, 1, SCANNER))?.event).toEqual({
      name: "scanner_added",
      eventId: 1,
      scanner: SCANNER,
    });
    expect(decode(scannerRemoved(registry, 1, SCANNER))?.event).toEqual({
      name: "scanner_removed",
      eventId: 1,
      scanner: SCANNER,
    });
  });

  it("decodes slot_reserved, whose seq is the count BEFORE the increment", () => {
    expect(decode(slotReserved(registry, 1, 0, 4))?.event).toEqual({
      name: "slot_reserved",
      eventId: 1,
      categoryId: 0,
      seq: 4,
    });
  });
});

describe("RaceRecord events (INTERFACE.md §2.3)", () => {
  it("decodes mint, which OpenZeppelin emits inside enter", () => {
    expect(decode(mint(raceRecord, RUNNER, 7))?.event).toEqual({
      name: "mint",
      to: RUNNER,
      tokenId: 7,
    });
  });

  it("decodes record_entered", () => {
    expect(decode(recordEntered(raceRecord, RUNNER, 1, 7, 12))?.event).toEqual({
      name: "record_entered",
      runner: RUNNER,
      eventId: 1,
      tokenId: 7,
      bibNo: 12,
    });
  });

  it("decodes racepack_claimed with the operator in the data map", () => {
    expect(decode(racepackClaimed(raceRecord, 7, 1, SCANNER))?.event).toEqual({
      name: "racepack_claimed",
      tokenId: 7,
      eventId: 1,
      operator: SCANNER,
    });
  });

  it("decodes record_finished", () => {
    expect(decode(recordFinished(raceRecord, 7, 1, 3_600))?.event).toEqual({
      name: "record_finished",
      tokenId: 7,
      eventId: 1,
      finishTimeS: 3_600,
    });
  });

  it("decodes record_dnf, which has no data fields at all", () => {
    expect(decode(recordDnf(raceRecord, 7, 1))?.event).toEqual({
      name: "record_dnf",
      tokenId: 7,
      eventId: 1,
    });
  });
});

describe("envelope", () => {
  it("carries the ledger, the transaction and the close time through", () => {
    const raw = recordEntered({ ...raceRecord, ledger: 512, txHash: "ab".repeat(32) }, RUNNER, 1, 0, 1);
    const decoded = decode(raw);
    expect(decoded?.ledger).toBe(512);
    expect(decoded?.txHash).toBe("ab".repeat(32));
    expect(decoded?.ledgerClosedAt.toISOString()).toBe(raw.ledgerClosedAt);
  });

  it("refuses an unparseable close time rather than storing an Invalid Date", () => {
    const raw = { ...recordDnf(raceRecord, 1, 1), ledgerClosedAt: "not a date" };
    expect(() => decode(raw)).toThrow(/not a timestamp/);
  });
});

describe("what is ignored", () => {
  it("ignores an event from a contract that is not ours", () => {
    // The SAC's own `transfer` shows up in the same feed, because `enter` calls
    // it in the same transaction.
    expect(decode(recordEntered({ contractId: SAC }, RUNNER, 1, 0, 1))).toBeNull();
  });

  it("ignores one of OUR names emitted by the WRONG one of our contracts", () => {
    // The sharpest version of the rule: the contract id is right for Sterun and
    // wrong for this event. A registry that emitted `record_entered` would mean
    // something is very wrong, and materialising it would be worse.
    expect(decode(recordEntered(registry, RUNNER, 1, 0, 1))).toBeNull();
    expect(decode(eventCreated(raceRecord, 1, ORGANISER))).toBeNull();
  });

  it("ignores a forged record_entered from an attacker's own contract", () => {
    const forged = recordEntered(
      { contractId: "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSHN" },
      RUNNER,
      1,
      999,
      1,
    );
    expect(decode(forged)).toBeNull();
  });

  it("ignores an event from a failed invocation", () => {
    const failed = recordEntered({ ...raceRecord, inSuccessfulContractCall: false }, RUNNER, 1, 0, 1);
    expect(decode(failed)).toBeNull();
  });

  it("ignores system events", () => {
    expect(decode(recordDnf({ ...raceRecord, type: "system" }, 1, 1))).toBeNull();
  });

  it("ignores a topic name this version does not model", () => {
    // Forward compatibility: a future contract event must not stop the poller.
    const unknown = { ...recordDnf(raceRecord, 1, 1), topics: ["record_transferred", 1, 1] };
    expect(decode(unknown)).toBeNull();
  });

  it("ignores an event whose first topic is not a symbol at all", () => {
    expect(decode({ ...recordDnf(raceRecord, 1, 1), topics: [42, 1, 1] })).toBeNull();
  });

  it("ignores an event with no topics", () => {
    expect(decode({ ...recordDnf(raceRecord, 1, 1), topics: [] })).toBeNull();
  });
});

describe("what is refused", () => {
  it("throws when one of our events has too few topics", () => {
    // Not ignored: this is our contract, our event name, and a shape that
    // cannot happen unless the frozen layout changed. Skipping it quietly
    // would drop a real entry.
    const truncated = { ...recordEntered(raceRecord, RUNNER, 1, 0, 1), topics: ["record_entered"] };
    expect(() => decode(truncated)).toThrow(ChainDecodeError);
  });

  it("throws when a data field the spec requires is missing", () => {
    const missing = { ...recordFinished(raceRecord, 1, 1, 60), data: {} };
    expect(() => decode(missing)).toThrow(/finish_time_s.*missing/);
  });

  it("throws when the data map is not a map", () => {
    const wrong = { ...recordFinished(raceRecord, 1, 1, 60), data: "finish_time_s=60" };
    expect(() => decode(wrong)).toThrow(/expected a map/);
  });

  it("throws when a topic has the wrong type", () => {
    const wrong = { ...recordEntered(raceRecord, RUNNER, 1, 0, 1), topics: ["record_entered", 7, 1] };
    expect(() => decode(wrong)).toThrow(/runner: expected a string/);
  });

  it("throws when a topic is a well-formed address of the wrong kind", () => {
    // A contract address parses as a string and is not a runner. Caught by the
    // decoder's shape check rather than by the database's CHECK constraint four
    // layers later.
    const wrong = {
      ...recordEntered(raceRecord, RUNNER, 1, 0, 1),
      topics: ["record_entered", "CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64", 1],
    };
    expect(() => decode(wrong)).toThrow(/runner: not a Stellar account address/);
  });

  it("throws when an enum carries a variant the spec does not define", () => {
    expect(() => decode(eventStatusChanged(registry, 1, "Cancelled"))).toThrow(/unknown variant/);
  });
});

describe("coverage of the frozen surface", () => {
  it("models every event INTERFACE.md §1.3 and §2.3 define, and nothing else", () => {
    // If a spec change adds an event, this list is where it is noticed.
    expect([...KNOWN_EVENT_NAMES].sort()).toEqual([
      "category_added",
      "event_created",
      "event_status_changed",
      "mint",
      "racepack_claimed",
      "record_dnf",
      "record_entered",
      "record_finished",
      "scanner_added",
      "scanner_removed",
      "slot_reserved",
    ]);
  });
});
