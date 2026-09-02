/**
 * An in-memory pair of contracts, speaking XDR.
 *
 * This is a fake of the *network*, not of our code: it implements
 * {@link ContractCaller}, which is the one interface that touches RPC, and
 * answers with real `xdr.ScVal`s in the exact shapes `docs/specs/INTERFACE.md`
 * freezes. Everything above it — `ChainReader`, every decoder, the indexer, the
 * keeper — runs unmodified.
 *
 * Faking one layer lower (stubbing `ChainReader` itself) would have been less
 * work and would have tested less: the decoders are where a spec drift shows
 * up, and stubbing above them means the tests agree with whatever the code
 * currently believes.
 */
import { createHash } from "node:crypto";
import { Address, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import type {
  ContractCaller,
  SimulationResult,
} from "../../src/chain/reader.js";
import type { EventStatus, RecordState } from "../../src/chain/decode.js";
import { ContractRevertError, classifyContractError } from "../../src/chain/errors.js";

export interface FakeEvent {
  eventId: number;
  organiser: string;
  name: string;
  metadataHash: string;
  uri: string;
  startsAt: bigint;
  status: EventStatus;
  scanners: string[];
}

export interface FakeCategory {
  eventId: number;
  categoryId: number;
  code: string;
  distanceM: number;
  quota: number;
  priceStroops: bigint;
  enteredCount: number;
}

export interface FakeRecord {
  tokenId: number;
  eventId: number;
  categoryId: number;
  bibNo: number;
  owner: string;
  participantHash: string;
  state: RecordState;
  enteredAt: bigint;
  claimedAt: bigint | null;
  finishTimeS: number | null;
  resultAt: bigint | null;
}

const sym = (s: string): xdr.ScVal => xdr.ScVal.scvSymbol(s);
const u32 = (n: number): xdr.ScVal => xdr.ScVal.scvU32(n);
const u64 = (n: bigint): xdr.ScVal => xdr.ScVal.scvU64(n);
const opt = (v: xdr.ScVal | null): xdr.ScVal => v ?? xdr.ScVal.scvVoid();
const bytes = (hex: string): xdr.ScVal => xdr.ScVal.scvBytes(Buffer.from(hex, "hex"));
const addr = (a: string): xdr.ScVal => nativeToScVal(a, { type: "address" });

/** A `#[contracttype]` struct: an ScMap keyed by symbol. */
export const struct = (fields: Record<string, xdr.ScVal>): xdr.ScVal =>
  xdr.ScVal.scvMap(
    Object.entries(fields)
      // Soroban sorts struct keys; sorting here too means the fixture is
      // byte-comparable with what a real host would emit.
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, val]) => new xdr.ScMapEntry({ key: sym(key), val })),
  );

/** A unit enum variant: a one-element vec holding the variant name. */
export const unitVariant = (name: string): xdr.ScVal => xdr.ScVal.scvVec([sym(name)]);

/**
 * A distinct, deterministic ledger key per (contract, label).
 *
 * The keeper only ever compares and counts these, so what matters is that two
 * different entries produce two different keys and the same entry produces the
 * same one twice.
 *
 * The label is hashed rather than used as a symbol because an ScVal symbol caps
 * at 32 bytes and `owned:G…` is 62 — a real contract would key this on an
 * address, not on a string, and the encoding of a fake key is not what these
 * tests are about.
 */
export function fakeLedgerKey(contractId: string, label: string): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(contractId).toScAddress(),
      key: xdr.ScVal.scvBytes(createHash("sha256").update(label).digest()),
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
}

export interface FakeChainAddresses {
  eventRegistry: string;
  raceRecord: string;
}

export class FakeChain implements ContractCaller {
  readonly events = new Map<number, FakeEvent>();
  readonly categories = new Map<string, FakeCategory>();
  readonly records = new Map<number, FakeRecord>();
  /** Every simulate() call, for asserting what was and was not asked for. */
  readonly calls: Array<{ contractId: string; method: string; args: unknown[] }> = [];
  latestLedger = 1_000;

  constructor(readonly addresses: FakeChainAddresses) {}

  addEvent(event: Partial<FakeEvent> & { eventId: number; organiser: string }): FakeEvent {
    const full: FakeEvent = {
      name: `Event ${event.eventId}`,
      metadataHash: "aa".repeat(32),
      uri: `ipfs://event/${event.eventId}`,
      startsAt: 1_800_000_000n,
      status: "Draft",
      scanners: [],
      ...event,
    };
    this.events.set(full.eventId, full);
    return full;
  }

  addCategory(
    category: Partial<FakeCategory> & { eventId: number; categoryId: number },
  ): FakeCategory {
    const full: FakeCategory = {
      code: "10K",
      distanceM: 10_000,
      quota: 100,
      priceStroops: 50_000_000n,
      enteredCount: 0,
      ...category,
    };
    this.categories.set(`${full.eventId}:${full.categoryId}`, full);
    return full;
  }

  addRecord(
    record: Partial<FakeRecord> & { tokenId: number; eventId: number; owner: string },
  ): FakeRecord {
    const full: FakeRecord = {
      categoryId: 0,
      bibNo: record.tokenId + 1,
      participantHash: `${record.tokenId.toString(16).padStart(2, "0")}`.repeat(32).slice(0, 64),
      state: "Entered",
      enteredAt: 1_800_000_100n,
      claimedAt: null,
      finishTimeS: null,
      resultAt: null,
      ...record,
    };
    this.records.set(full.tokenId, full);
    return full;
  }

  async simulate(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
  ): Promise<SimulationResult> {
    const native = args.map((a) => scValToNative(a));
    this.calls.push({ contractId, method, args: native });

    if (contractId === this.addresses.eventRegistry) return this.registry(method, native);
    if (contractId === this.addresses.raceRecord) return this.raceRecord(method, native);
    throw new Error(`fake chain has no contract ${contractId}`);
  }

  private result(value: xdr.ScVal | undefined, keys: xdr.LedgerKey[]): SimulationResult {
    return {
      value: value === undefined ? undefined : scValToNative(value),
      readOnlyKeys: keys,
      latestLedger: this.latestLedger,
    };
  }

  private revert(code: number, context: string): never {
    throw new ContractRevertError(
      classifyContractError(code),
      context,
      `HostError: Error(Contract, #${code})`,
    );
  }

  private registry(method: string, args: unknown[]): SimulationResult {
    const instance = [fakeLedgerKey(this.addresses.eventRegistry, "instance")];
    switch (method) {
      case "event_count":
        return this.result(u32(this.events.size), instance);

      case "category_count": {
        const eventId = args[0] as number;
        const n = [...this.categories.values()].filter((c) => c.eventId === eventId).length;
        return this.result(u32(n), instance);
      }

      case "get_event": {
        const event = this.events.get(args[0] as number);
        if (!event) this.revert(2, `get_event(${args[0]})`);
        return this.result(
          struct({
            metadata_hash: bytes(event.metadataHash),
            name: xdr.ScVal.scvString(event.name),
            organiser: addr(event.organiser),
            starts_at: u64(event.startsAt),
            status: unitVariant(event.status),
            uri: xdr.ScVal.scvString(event.uri),
          }),
          [...instance, fakeLedgerKey(this.addresses.eventRegistry, `event:${event.eventId}`)],
        );
      }

      case "get_category": {
        const category = this.categories.get(`${args[0]}:${args[1]}`);
        // CategoryNotFound even when it is the EVENT that is missing —
        // INTERFACE.md §1.1 says so, and a fake that got this wrong would let
        // code that relies on the difference pass.
        if (!category) this.revert(3, `get_category(${args[0]}, ${args[1]})`);
        return this.result(
          struct({
            code: sym(category.code),
            distance_m: u32(category.distanceM),
            entered_count: u32(category.enteredCount),
            price_usdc: nativeToScVal(category.priceStroops, { type: "i128" }),
            quota: u32(category.quota),
          }),
          instance,
        );
      }

      case "get_organiser": {
        const event = this.events.get(args[0] as number);
        if (!event) this.revert(2, `get_organiser(${args[0]})`);
        return this.result(addr(event.organiser), instance);
      }

      case "is_scanner": {
        const event = this.events.get(args[0] as number);
        // Never reverts, even for an unknown event.
        return this.result(
          xdr.ScVal.scvBool(event?.scanners.includes(args[1] as string) ?? false),
          instance,
        );
      }

      default:
        throw new Error(`fake EventRegistry has no method ${method}`);
    }
  }

  private raceRecord(method: string, args: unknown[]): SimulationResult {
    const instance = [
      fakeLedgerKey(this.addresses.raceRecord, "instance"),
      fakeLedgerKey(this.addresses.raceRecord, "wasm"),
    ];
    switch (method) {
      case "total_supply":
        return this.result(u32(this.records.size), instance);

      case "record_of": {
        const record = this.records.get(args[0] as number);
        if (!record) this.revert(101, `record_of(${args[0]})`);
        return this.result(
          struct({
            bib_no: u32(record.bibNo),
            category_id: u32(record.categoryId),
            claimed_at: opt(record.claimedAt === null ? null : u64(record.claimedAt)),
            entered_at: u64(record.enteredAt),
            event_id: u32(record.eventId),
            finish_time_s: opt(record.finishTimeS === null ? null : u32(record.finishTimeS)),
            participant_hash: bytes(record.participantHash),
            result_at: opt(record.resultAt === null ? null : u64(record.resultAt)),
            state: unitVariant(record.state),
          }),
          [...instance, fakeLedgerKey(this.addresses.raceRecord, `record:${record.tokenId}`)],
        );
      }

      case "owner_of": {
        const record = this.records.get(args[0] as number);
        // OZ panics NonExistentToken(200) rather than returning an option.
        if (!record) this.revert(200, `owner_of(${args[0]})`);
        return this.result(addr(record.owner), [
          ...instance,
          fakeLedgerKey(this.addresses.raceRecord, `owner:${record.tokenId}`),
        ]);
      }

      case "records_of": {
        const owner = args[0] as string;
        const owned = [...this.records.values()].filter((r) => r.owner === owner);
        return this.result(
          xdr.ScVal.scvVec(owned.map((r) => u32(r.tokenId))),
          [...instance, fakeLedgerKey(this.addresses.raceRecord, `owned:${owner}`)],
        );
      }

      default:
        throw new Error(`fake RaceRecord has no method ${method}`);
    }
  }
}
