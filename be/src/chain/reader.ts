/**
 * STE-16 (C8) — read-only access to the two contracts.
 *
 * Every method here is a **simulation**: nothing is signed, nothing is
 * submitted, no account needs funds. That is what makes the indexer's rebuild
 * path safe to run at any time — replaying from the chain costs nothing and
 * changes nothing.
 *
 * ## Why not the generated bindings
 *
 * `sc/bindings/` exists and STE-15 will use it. This module does not, for three
 * reasons that are specific to a long-running background job:
 *
 *   1. the bindings pin `@stellar/stellar-sdk` ^14.6.1 while `be/` is on ^17,
 *      so using them here would run two RPC clients in one process;
 *   2. they ship as sources with `dist/` uncommitted, so consuming them means
 *      `npm install && npm run build` inside two more packages — a step
 *      `.github/workflows/typescript.yml` does not have and should not grow
 *      just so the indexer can read a struct;
 *   3. what we need from them is the *shape* of four return values, and
 *      `chain/decode.ts` checks those shapes against the frozen spec more
 *      strictly than the generated parsers do.
 *
 * The seam is narrow on purpose: {@link ContractCaller} is the only place that
 * touches the network, so tests drive the whole indexer with a fake.
 */
import {
  Account,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  decodeCategory,
  decodeEvent,
  decodeRecord,
  decodeTokenIds,
  accountAddress,
  u32,
  type ChainCategory,
  type ChainEvent,
  type ChainRecord,
} from "./decode.js";
import { ContractRevertError, asContractRevert } from "./errors.js";

/** Simulation never lands in a ledger, so this only has to be non-zero. */
const SIMULATION_TIMEOUT_SECONDS = 60;

/** One simulated view call. */
export interface SimulationResult {
  /** `scValToNative` of the return value. `undefined` when there was none. */
  value: unknown;
  /**
   * The read-only footprint the host computed for the call — exactly the ledger
   * entries this invocation had to read. The TTL keeper uses these rather than
   * rebuilding storage keys by hand, so it stays correct without knowing how
   * OpenZeppelin lays out its owner and enumeration keys.
   */
  readOnlyKeys: xdr.LedgerKey[];
  /** The RPC server's latest known ledger when it answered. */
  latestLedger: number;
}

/**
 * The one network-facing seam. Implemented by {@link RpcContractCaller} in
 * production and by a fake in tests.
 */
export interface ContractCaller {
  simulate(contractId: string, method: string, args: xdr.ScVal[]): Promise<SimulationResult>;
}

/**
 * A simulation that failed for a reason that is not a contract revert:
 * transport, a malformed request, or an entry that has been archived.
 */
export class ChainCallError extends Error {
  constructor(
    readonly context: string,
    message: string,
    /**
     * Set when RPC answered with a restoration preamble — the call touched an
     * **archived** entry. This is the signal the TTL keeper's runbook exists
     * for, so it is a flag rather than a substring for someone to grep.
     */
    readonly needsRestore = false,
  ) {
    super(`${context}: ${message}`);
    this.name = "ChainCallError";
  }
}

export class RpcContractCaller implements ContractCaller {
  private readonly server: rpc.Server;
  private account: Account | undefined;

  constructor(
    rpcUrl: string,
    private readonly networkPassphrase: string,
    /**
     * Any account that exists on the network. It signs nothing and pays
     * nothing; the host just needs a source to build a transaction envelope
     * around.
     */
    private readonly sourceAccount: string,
  ) {
    this.server = new rpc.Server(rpcUrl);
  }

  async simulate(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
  ): Promise<SimulationResult> {
    const context = `${method}() on ${contractId}`;
    const source = await this.source(context);
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(SIMULATION_TIMEOUT_SECONDS)
      .build();

    let sim: rpc.Api.SimulateTransactionResponse;
    try {
      sim = await this.server.simulateTransaction(tx);
    } catch (e) {
      throw new ChainCallError(context, e instanceof Error ? e.message : String(e));
    }

    if (rpc.Api.isSimulationError(sim)) {
      const revert = asContractRevert(sim.error, context);
      if (revert) throw revert;
      throw new ChainCallError(context, sim.error);
    }
    // A restore preamble means the call READ an archived entry: the answer is
    // what the value would have been, not what the ledger currently serves.
    // Returning it would put resurrected data in the index and hide the
    // archival that the keeper exists to prevent.
    if (rpc.Api.isSimulationRestore(sim)) {
      throw new ChainCallError(
        context,
        "a ledger entry this call reads has been ARCHIVED; restore it before " +
          "indexing again (runbook: be/OPERATIONS.md, 'Restoring an archived entry')",
        true,
      );
    }

    return {
      value: sim.result ? scValToNative(sim.result.retval) : undefined,
      readOnlyKeys: sim.transactionData.build().resources.footprint.readOnly,
      latestLedger: sim.latestLedger,
    };
  }

  /**
   * Loaded once and reused. `TransactionBuilder.build()` bumps the sequence
   * number on the object it is given, which is harmless here — a simulated
   * envelope is never submitted, so its sequence is never checked.
   */
  private async source(context: string): Promise<Account> {
    if (this.account) return this.account;
    try {
      this.account = await this.server.getAccount(this.sourceAccount);
    } catch (e) {
      throw new ChainCallError(
        context,
        `simulation source account ${this.sourceAccount} could not be loaded: ` +
          `${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return this.account;
  }
}

export interface ChainReaderAddresses {
  eventRegistry: string;
  raceRecord: string;
}

const u32Arg = (n: number): xdr.ScVal => nativeToScVal(n, { type: "u32" });
const addressArg = (a: string): xdr.ScVal => nativeToScVal(a, { type: "address" });

/**
 * Typed reads of the frozen view surface (docs/specs/INTERFACE.md §1.1, §2.1).
 *
 * Only views appear here. Anything that mutates state belongs to a signer, and
 * the indexer has none.
 */
export class ChainReader {
  constructor(
    private readonly caller: ContractCaller,
    private readonly addresses: ChainReaderAddresses,
  ) {}

  // -- EventRegistry (C1) ----------------------------------------------------

  /** `event_count()` — never reverts; `0` before the first event. */
  async eventCount(): Promise<number> {
    const { value } = await this.caller.simulate(this.addresses.eventRegistry, "event_count", []);
    return u32(value, "event_count");
  }

  /** `category_count(event_id)` — never reverts; `0` for an unknown event. */
  async categoryCount(eventId: number): Promise<number> {
    const { value } = await this.caller.simulate(
      this.addresses.eventRegistry,
      "category_count",
      [u32Arg(eventId)],
    );
    return u32(value, `category_count(${eventId})`);
  }

  /** `get_event(event_id)`. Reverts `EventNotFound(2)` for an unknown id. */
  async getEvent(eventId: number): Promise<ChainEvent> {
    const { value } = await this.caller.simulate(this.addresses.eventRegistry, "get_event", [
      u32Arg(eventId),
    ]);
    return decodeEvent(eventId, value);
  }

  /**
   * `get_category(event_id, category_id)`.
   *
   * Reverts `CategoryNotFound(3)` even when it is the *event* that does not
   * exist — INTERFACE.md §1.1 says so explicitly. Never use this revert to tell
   * the two apart.
   */
  async getCategory(eventId: number, categoryId: number): Promise<ChainCategory> {
    const { value } = await this.caller.simulate(this.addresses.eventRegistry, "get_category", [
      u32Arg(eventId),
      u32Arg(categoryId),
    ]);
    return decodeCategory(eventId, categoryId, value);
  }

  /** `is_scanner(event_id, addr)` — never reverts; `false` when absent. */
  async isScanner(eventId: number, address: string): Promise<boolean> {
    const { value } = await this.caller.simulate(this.addresses.eventRegistry, "is_scanner", [
      u32Arg(eventId),
      addressArg(address),
    ]);
    if (typeof value !== "boolean") {
      throw new ChainCallError(
        `is_scanner(${eventId}, ${address})`,
        `expected a bool, got ${typeof value}`,
      );
    }
    return value;
  }

  /** `get_organiser(event_id)`. Reverts `EventNotFound(2)` for an unknown id. */
  async getOrganiser(eventId: number): Promise<string> {
    const { value } = await this.caller.simulate(
      this.addresses.eventRegistry,
      "get_organiser",
      [u32Arg(eventId)],
    );
    return accountAddress(value, `get_organiser(${eventId})`);
  }

  // -- RaceRecord (C2) -------------------------------------------------------

  /**
   * `total_supply()`.
   *
   * Also the exclusive upper bound on token ids: records are minted with
   * `Enumerable::sequential_mint` from 0 and there is no burn export, so ids
   * are exactly `0 .. total_supply - 1` with no gaps. The rebuild walk depends
   * on that, and `test/chain-reader.test.ts` states it as an assumption so a
   * future contract with a burn path breaks the test rather than the index.
   */
  async totalSupply(): Promise<number> {
    const { value } = await this.caller.simulate(this.addresses.raceRecord, "total_supply", []);
    return u32(value, "total_supply");
  }

  /** `record_of(token_id)`. Reverts `RecordNotFound(101)` for an unknown id. */
  async recordOf(tokenId: number): Promise<ChainRecord> {
    const { value } = await this.caller.simulate(this.addresses.raceRecord, "record_of", [
      u32Arg(tokenId),
    ]);
    return decodeRecord(tokenId, value);
  }

  /** `owner_of(token_id)`. Panics `NonExistentToken(200)` for an unknown id. */
  async ownerOf(tokenId: number): Promise<string> {
    const { value } = await this.caller.simulate(this.addresses.raceRecord, "owner_of", [
      u32Arg(tokenId),
    ]);
    return accountAddress(value, `owner_of(${tokenId})`);
  }

  /** `records_of(runner)` — never reverts; `[]` for an address with none. */
  async recordsOf(runner: string): Promise<number[]> {
    const { value } = await this.caller.simulate(this.addresses.raceRecord, "records_of", [
      addressArg(runner),
    ]);
    return decodeTokenIds(value, `records_of(${runner})`);
  }

  /**
   * The read-only footprint of reading one record — every ledger entry that has
   * to stay alive for `record_of` + `owner_of` to keep answering.
   *
   * This is how the TTL keeper learns its keys. It deliberately asks the host
   * instead of constructing `DataKey::Record(id)` and OpenZeppelin's
   * `NFTStorageKey::Owner(id)` itself: those are internal layouts of two
   * different crates, and a keeper that extends the wrong key reports success
   * while the record archives anyway.
   */
  async recordFootprint(tokenId: number): Promise<xdr.LedgerKey[]> {
    const [record, owner] = await Promise.all([
      this.caller.simulate(this.addresses.raceRecord, "record_of", [u32Arg(tokenId)]),
      this.caller.simulate(this.addresses.raceRecord, "owner_of", [u32Arg(tokenId)]),
    ]);
    return dedupeKeys([...record.readOnlyKeys, ...owner.readOnlyKeys]);
  }

  /** Same, for one runner's enumeration entries (`records_of`). */
  async runnerFootprint(runner: string): Promise<xdr.LedgerKey[]> {
    const { readOnlyKeys } = await this.caller.simulate(
      this.addresses.raceRecord,
      "records_of",
      [addressArg(runner)],
    );
    return dedupeKeys(readOnlyKeys);
  }
}

/**
 * Ledger keys by XDR identity.
 *
 * `xdr.LedgerKey` instances have no useful equality, and both probe calls carry
 * the contract instance and wasm entries — without this the keeper would pay to
 * extend the same key several times per record.
 */
export function dedupeKeys(keys: xdr.LedgerKey[]): xdr.LedgerKey[] {
  const seen = new Set<string>();
  const out: xdr.LedgerKey[] = [];
  for (const key of keys) {
    const id = key.toXdr("base64");
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(key);
  }
  return out;
}

export { ContractRevertError };
