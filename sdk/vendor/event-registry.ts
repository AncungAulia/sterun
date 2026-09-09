import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export const Errors = {
  1: {message:"NotInitialized"},
  2: {message:"EventNotFound"},
  3: {message:"CategoryNotFound"},
  4: {message:"EventNotOpen"},
  5: {message:"QuotaFull"},
  6: {message:"RaceRecordNotSet"},
  7: {message:"RaceRecordAlreadySet"},
  /**
   * `quota == 0`
   */
  8: {message:"InvalidQuota"},
  /**
   * `price_usdc < 0`
   */
  9: {message:"InvalidPrice"},
  /**
   * `distance_m == 0`
   */
  10: {message:"InvalidDistance"},
  /**
   * Illegal [`EventStatus`] transition.
   */
  11: {message:"InvalidStatus"},
  12: {message:"ScannerAlreadyAdded"},
  13: {message:"ScannerNotFound"},
  /**
   * `(event_id, addon_id)` is not a known add-on (v2).
   */
  14: {message:"AddOnNotFound"},
  /**
   * `reserved_count >= quota` on an add-on (v2).
   */
  15: {message:"AddOnQuotaFull"},
  /**
   * The address is already on the organiser allowlist (v2.1).
   */
  16: {message:"OrganiserAlreadyAdded"},
  /**
   * `remove_organiser` on an address that is not on the allowlist (v2.1).
   */
  17: {message:"OrganiserNotFound"},
  /**
   * `create_event` from an address the admin never allowlisted (v2.1).
   */
  18: {message:"NotAllowlistedOrganiser"}
}

/**
 * Storage schema. `Admin` / `RaceRecordAddr` / `EventCount` live in instance
 * storage (tiny, global, read on most calls); everything else is persistent
 * so it survives archival cycles.
 */
export type DataKey = {tag: "Admin", values: void} | {tag: "RaceRecordAddr", values: void} | {tag: "EventCount", values: void} | {tag: "Event", values: readonly [u32]} | {tag: "Category", values: readonly [u32, u32]} | {tag: "CategoryCount", values: readonly [u32]} | {tag: "Scanner", values: readonly [u32, string]} | {tag: "AddOn", values: readonly [u32, u32]} | {tag: "AddOnCount", values: readonly [u32]} | {tag: "Organiser", values: readonly [string]};


/**
 * One paid extra an entrant can buy alongside their category — a jersey, a
 * tumbler, a bus seat (STE-35). Add-ons are per event and priced independently
 * of the category, and `quota` is enforced the same way a category's is: an
 * organiser who has 200 jerseys sells 200, not 201.
 * 
 * `reserved_count` counts units taken. It is bumped by
 * [`EventRegistry::reserve_addon`] and never goes down — cancelling a race
 * does not un-sell its jerseys, because the refund is an off-chain promise.
 */
export interface AddOnData {
  code: string;
  /**
 * 7-decimal token representation (sUSD on testnet, USDC on mainnet).
 */
price_usdc: i128;
  quota: u32;
  reserved_count: u32;
}


/**
 * One race event. `metadata_hash` commits to the off-chain detail document
 * pointed at by `uri`; no PII ever lands here.
 */
export interface EventData {
  metadata_hash: Buffer;
  name: string;
  organiser: string;
  starts_at: u64;
  status: EventStatus;
  uri: string;
}


/**
 * Lifecycle of an event. `Draft` -> `Open` -> `Closed` -> `Completed`, with
 * `Closed` <-> `Open` allowed so an organiser can re-open registration.
 * `Completed` is terminal.
 * 
 * `Cancelled` (v2) is reachable from every non-terminal state and is itself
 * terminal. It is **not** the same thing as `Closed`: `Closed` means
 * registration is shut but the race is still happening, and the organiser can
 * re-open it. `Cancelled` means the race is off. Nothing on-chain refunds
 * anybody — refunds stay an off-chain promise (`docs/SYSTEM_DESIGN.md` §11) —
 * so the value of this status is that the chain, not a website banner, is
 * where "this race is not happening" is recorded.
 * 
 * The variant is appended last on purpose. A `#[contracttype]` enum travels as
 * its variant *name*, so every `EventData` already written keeps decoding.
 */
export type EventStatus = {tag: "Draft", values: void} | {tag: "Open", values: void} | {tag: "Closed", values: void} | {tag: "Completed", values: void} | {tag: "Cancelled", values: void};


/**
 * One distance category of an event. `entered_count` doubles as the bib
 * sequence handed out by [`EventRegistry::reserve_slot`].
 */
export interface CategoryData {
  code: string;
  distance_m: u32;
  entered_count: u32;
  /**
 * 7-decimal token representation (sUSD on testnet, USDC on mainnet).
 */
price_usdc: i128;
  quota: u32;
}











export interface Client {
  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replaces this contract's own wasm. **Admin only.**
   * 
   * Soroban upgrades are protocol-level: the executable is swapped in place
   * and the contract keeps its address, its storage and its balances. There
   * is no proxy and no `delegatecall`, so there is also no storage-slot
   * aliasing to get wrong — but the new code does reinterpret the *existing*
   * entries, which is why [`DataKey`] is append-only forever (see the module
   * docs).
   * 
   * Two consequences worth knowing before calling this:
   * 
   * * The swap takes effect **after** this invocation finishes, so the new
   * code cannot run in the same transaction. A migration therefore needs a
   * second call.
   * * `new_wasm_hash` must already be uploaded to the ledger, and nothing
   * checks that it is a *Sterun* contract, or that it kept an `upgrade`
   * function of its own. Upgrading to a wasm without one ends
   * upgradeability permanently.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a add_addon transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds a paid add-on to an event (STE-35). Add-on ids restart at 0 for
   * every event, exactly like category ids.
   * 
   * The validation mirrors [`Self::add_category`] and reuses its error codes
   * on purpose: `quota == 0` is [`Error::InvalidQuota`] and a negative price
   * is [`Error::InvalidPrice`] whether the thing priced is a distance or a
   * jersey. A free add-on (`price_usdc == 0`) is legal — a race can hand out
   * a bib belt to whoever asks for one and still cap how many it hands out.
   */
  add_addon: ({event_id, code, price_usdc, quota}: {event_id: u32, code: string, price_usdc: i128, quota: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a get_addon transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_addon: ({event_id, addon_id}: {event_id: u32, addon_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<AddOnData>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a get_event transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_event: ({event_id}: {event_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<EventData>>>

  /**
   * Construct and simulate a is_scanner transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * `false` when the address was never added, or was removed.
   */
  is_scanner: ({event_id, addr}: {event_id: u32, addr: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a add_scanner transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Allowlists a volunteer device for race-day check-in on this event.
   */
  add_scanner: ({event_id, scanner}: {event_id: u32, scanner: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a addon_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * How many add-ons this event has. Also the exclusive upper bound on a
   * valid `addon_id`, which is what bounds the loop in `RaceRecord.enter`.
   */
  addon_count: ({event_id}: {event_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a event_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  event_count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a add_category transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds a distance category to an event. Category ids restart at 0 for
   * every event.
   */
  add_category: ({event_id, code, distance_m, quota, price_usdc}: {event_id: u32, code: string, distance_m: u32, quota: u32, price_usdc: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a create_event transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Creates an event owned by `organiser`. Ids are assigned from a
   * monotonic counter and never reused. The event starts in
   * [`EventStatus::Draft`] so categories can be added before registration
   * opens.
   * 
   * **Two gates, and they answer different questions** (v2.1).
   * `organiser.require_auth()` answers "does the caller hold this keypair";
   * the allowlist check answers "is this keypair one the admin vetted".
   * Without the second, `name` is an unchecked `String` and the first gate
   * happily lets a stranger sign for their own address while calling their
   * event "Jakarta Marathon 2026". Hence
   * [`Error::NotAllowlistedOrganiser`] — see [`Self::add_organiser`].
   * 
   * The auth check runs first so a caller who does not hold the key learns
   * nothing about who is on the allowlist.
   */
  create_event: ({organiser, name, metadata_hash, uri, starts_at}: {organiser: string, name: string, metadata_hash: Buffer, uri: string, starts_at: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a get_category transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_category: ({event_id, category_id}: {event_id: u32, category_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<CategoryData>>>

  /**
   * Construct and simulate a is_organiser transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * `false` when the address was never allowlisted, or was removed (v2.1).
   * 
   * This is the read a console uses to decide whether to show the "create
   * event" form at all. It is not the enforcement — [`Self::create_event`]
   * is — so a client that skips it gets a revert, not an event.
   */
  is_organiser: ({addr}: {addr: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a reserve_slot transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Reserves one slot in a category and returns its bib sequence number.
   * 
   * **Only the wired RaceRecord contract may call this.** The gate is
   * invoker-contract authorization: the stored `RaceRecordAddr` must
   * authorize, and a contract address authorizes implicitly *only* when it
   * is the direct cross-contract caller. RaceRecord does not implement
   * `CustomAccountInterface` (`__check_auth`), so there is no signature an
   * EOA could present for that address either — no one can mint a slot
   * without going through `RaceRecord.enter`.
   * 
   * The quota check and the increment happen in this one invocation, so two
   * simultaneous entries can never both take the last slot: the second
   * transaction reads the already-incremented `entered_count` and reverts
   * with [`Error::QuotaFull`].
   */
  reserve_slot: ({event_id, category_id}: {event_id: u32, category_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a add_organiser transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Puts `organiser` on the allowlist, which is what [`Self::create_event`]
   * checks. **Admin only.**
   * 
   * The allowlist exists because `create_event` takes the event's `name` as
   * a free `String`. `organiser.require_auth()` proves the caller controls
   * that keypair and nothing more — it cannot say whether the keypair
   * belongs to the race it just named itself after. Anyone could create
   * "Jakarta Marathon 2026" and start selling entries to it. The allowlist
   * is the missing half: a keypair the admin has actually vetted off-chain.
   * 
   * Access is granted per address, not per event, and the grant is what an
   * organiser gets *before* they have an event. Per-event authority stays
   * where it already lives — in `EventData.organiser`.
   */
  add_organiser: ({organiser}: {organiser: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_organiser transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_organiser: ({event_id}: {event_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a reserve_addon transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Takes one unit of an add-on and returns **the price to charge for it**.
   * 
   * Same gate as [`Self::reserve_slot`]: only the wired RaceRecord contract
   * can call this, by invoker-contract authorization. An entrant cannot
   * reserve a jersey without paying for it, because the only code path that
   * reaches here is `RaceRecord.enter`, which charges what this returns
   * inside the same invocation.
   * 
   * **Why it returns the price instead of a sequence number.** The caller
   * needs the price, and reading it separately would mean a second
   * cross-contract call against state that could, in principle, be a
   * different value by then. Returning it from the reserving call makes the
   * amount charged and the unit reserved the same read. The sequence number
   * is still published on [`AddOnReserved`] for anyone fulfilling the order.
   * 
   * The quota check and the increment happen in this one invocation, so the
   * last jersey cannot be sold twice: the second entry reads the
   * already-incremented `reserved_count` and reverts with
   * [`Error::AddOnQuotaFull`].
   */
  reserve_addon: ({event_id, addon_id}: {event_id: u32, addon_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a category_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  category_count: ({event_id}: {event_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a remove_scanner transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revokes a volunteer device. The entry is removed rather than set to
   * `false` so the organiser stops paying rent for it.
   */
  remove_scanner: ({event_id, scanner}: {event_id: u32, scanner: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_race_record transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_race_record: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a set_race_record transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One-shot wiring of the RaceRecord contract address, done by the admin
   * once both contracts are deployed. A second call is rejected so the
   * trusted caller of [`Self::reserve_slot`] can never be swapped out.
   */
  set_race_record: ({race_record}: {race_record: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a remove_organiser transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revokes an organiser. **Admin only.**
   * 
   * Like [`Self::remove_scanner`], the entry is removed rather than set to
   * `false`, so the contract stops paying rent for a revoked address.
   * 
   * Revoking is forward-looking only: events the address already created
   * keep their organiser, and it keeps every per-event power over them
   * (`add_category`, `set_event_status`, the scanner allowlist, and
   * `record_finish` over in RaceRecord). What it loses is the ability to
   * create *new* events. Taking a running race away from the organiser
   * mid-event would strand its entrants, and a race whose entries are
   * already sold cannot be un-run by a storage write.
   */
  remove_organiser: ({organiser}: {organiser: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_event_status transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Moves the event through its lifecycle. Only forward moves are legal,
   * plus the `Open` <-> `Closed` toggle; `Completed` and `Cancelled` are
   * terminal and a no-op transition is rejected so no misleading event is
   * emitted.
   * 
   * Cancelling stops entries by itself: [`Self::reserve_slot`] and
   * [`Self::reserve_addon`] both require `Open`, so a cancelled event
   * rejects every new entry with [`Error::EventNotOpen`] without needing a
   * guard of its own.
   */
  set_event_status: ({event_id, status}: {event_id: u32, status: EventStatus}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin}: {admin: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAEgAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAADUV2ZW50Tm90Rm91bmQAAAAAAAACAAAAAAAAABBDYXRlZ29yeU5vdEZvdW5kAAAAAwAAAAAAAAAMRXZlbnROb3RPcGVuAAAABAAAAAAAAAAJUXVvdGFGdWxsAAAAAAAABQAAAAAAAAAQUmFjZVJlY29yZE5vdFNldAAAAAYAAAAAAAAAFFJhY2VSZWNvcmRBbHJlYWR5U2V0AAAABwAAAAxgcXVvdGEgPT0gMGAAAAAMSW52YWxpZFF1b3RhAAAACAAAABBgcHJpY2VfdXNkYyA8IDBgAAAADEludmFsaWRQcmljZQAAAAkAAAARYGRpc3RhbmNlX20gPT0gMGAAAAAAAAAPSW52YWxpZERpc3RhbmNlAAAAAAoAAAAjSWxsZWdhbCBbYEV2ZW50U3RhdHVzYF0gdHJhbnNpdGlvbi4AAAAADUludmFsaWRTdGF0dXMAAAAAAAALAAAAAAAAABNTY2FubmVyQWxyZWFkeUFkZGVkAAAAAAwAAAAAAAAAD1NjYW5uZXJOb3RGb3VuZAAAAAANAAAAMmAoZXZlbnRfaWQsIGFkZG9uX2lkKWAgaXMgbm90IGEga25vd24gYWRkLW9uICh2MikuAAAAAAANQWRkT25Ob3RGb3VuZAAAAAAAAA4AAAAsYHJlc2VydmVkX2NvdW50ID49IHF1b3RhYCBvbiBhbiBhZGQtb24gKHYyKS4AAAAOQWRkT25RdW90YUZ1bGwAAAAAAA8AAAA5VGhlIGFkZHJlc3MgaXMgYWxyZWFkeSBvbiB0aGUgb3JnYW5pc2VyIGFsbG93bGlzdCAodjIuMSkuAAAAAAAAFU9yZ2FuaXNlckFscmVhZHlBZGRlZAAAAAAAABAAAABFYHJlbW92ZV9vcmdhbmlzZXJgIG9uIGFuIGFkZHJlc3MgdGhhdCBpcyBub3Qgb24gdGhlIGFsbG93bGlzdCAodjIuMSkuAAAAAAAAEU9yZ2FuaXNlck5vdEZvdW5kAAAAAAAAEQAAAEJgY3JlYXRlX2V2ZW50YCBmcm9tIGFuIGFkZHJlc3MgdGhlIGFkbWluIG5ldmVyIGFsbG93bGlzdGVkICh2Mi4xKS4AAAAAABdOb3RBbGxvd2xpc3RlZE9yZ2FuaXNlcgAAAAAS",
        "AAAAAgAAALRTdG9yYWdlIHNjaGVtYS4gYEFkbWluYCAvIGBSYWNlUmVjb3JkQWRkcmAgLyBgRXZlbnRDb3VudGAgbGl2ZSBpbiBpbnN0YW5jZQpzdG9yYWdlICh0aW55LCBnbG9iYWwsIHJlYWQgb24gbW9zdCBjYWxscyk7IGV2ZXJ5dGhpbmcgZWxzZSBpcyBwZXJzaXN0ZW50CnNvIGl0IHN1cnZpdmVzIGFyY2hpdmFsIGN5Y2xlcy4AAAAAAAAAB0RhdGFLZXkAAAAACgAAAAAAAAAVaW5zdGFuY2UgLT4gYEFkZHJlc3NgAAAAAAAABUFkbWluAAAAAAAAAAAAABVpbnN0YW5jZSAtPiBgQWRkcmVzc2AAAAAAAAAOUmFjZVJlY29yZEFkZHIAAAAAAAAAAAARaW5zdGFuY2UgLT4gYHUzMmAAAAAAAAAKRXZlbnRDb3VudAAAAAAAAQAAADBwZXJzaXN0ZW50IC0+IFtgRXZlbnREYXRhYF0sIGtleWVkIGJ5IGBldmVudF9pZGAAAAAFRXZlbnQAAAAAAAABAAAABAAAAAEAAABCcGVyc2lzdGVudCAtPiBbYENhdGVnb3J5RGF0YWBdLCBrZXllZCBieSBgKGV2ZW50X2lkLCBjYXRlZ29yeV9pZClgAAAAAAAIQ2F0ZWdvcnkAAAACAAAABAAAAAQAAAABAAAAKHBlcnNpc3RlbnQgLT4gYHUzMmAsIGtleWVkIGJ5IGBldmVudF9pZGAAAAANQ2F0ZWdvcnlDb3VudAAAAAAAAAEAAAAEAAAAAQAAADRwZXJzaXN0ZW50IC0+IGBib29sYCwga2V5ZWQgYnkgYChldmVudF9pZCwgc2Nhbm5lcilgAAAAB1NjYW5uZXIAAAAAAgAAAAQAAAATAAAAAQAAAEFwZXJzaXN0ZW50IC0+IFtgQWRkT25EYXRhYF0sIGtleWVkIGJ5IGAoZXZlbnRfaWQsIGFkZG9uX2lkKWAgKHYyKQAAAAAAAAVBZGRPbgAAAAAAAAIAAAAEAAAABAAAAAEAAAAtcGVyc2lzdGVudCAtPiBgdTMyYCwga2V5ZWQgYnkgYGV2ZW50X2lkYCAodjIpAAAAAAAACkFkZE9uQ291bnQAAAAAAAEAAAAEAAAAAQAAASRwZXJzaXN0ZW50IC0+IGBib29sYCwga2V5ZWQgYnkgdGhlIG9yZ2FuaXNlciBhZGRyZXNzICh2Mi4xKQoKQXBwZW5kZWQgbGFzdCwgbGlrZSBldmVyeSB2YXJpYW50IGJlZm9yZSBpdC4gVGhpcyBvbmUgbGFuZGVkIG9uIGEKY29udHJhY3QgdGhhdCB3YXMgYWxyZWFkeSBsaXZlIGFuZCBhbHJlYWR5IGhvbGRpbmcgZXZlbnRzLCBzbyB0aGUKYXBwZW5kLW9ubHkgcnVsZSBzdG9wcGVkIGJlaW5nIGFkdmljZSBoZXJlIGFuZCBzdGFydGVkIGJlaW5nIHRoZSByZWFzb24KYGV2ZW50X2lkYCAwIHN0aWxsIGRlY29kZXMuAAAACU9yZ2FuaXNlcgAAAAAAAAEAAAAT",
        "AAAAAQAAAd5PbmUgcGFpZCBleHRyYSBhbiBlbnRyYW50IGNhbiBidXkgYWxvbmdzaWRlIHRoZWlyIGNhdGVnb3J5IOKAlCBhIGplcnNleSwgYQp0dW1ibGVyLCBhIGJ1cyBzZWF0IChTVEUtMzUpLiBBZGQtb25zIGFyZSBwZXIgZXZlbnQgYW5kIHByaWNlZCBpbmRlcGVuZGVudGx5Cm9mIHRoZSBjYXRlZ29yeSwgYW5kIGBxdW90YWAgaXMgZW5mb3JjZWQgdGhlIHNhbWUgd2F5IGEgY2F0ZWdvcnkncyBpczogYW4Kb3JnYW5pc2VyIHdobyBoYXMgMjAwIGplcnNleXMgc2VsbHMgMjAwLCBub3QgMjAxLgoKYHJlc2VydmVkX2NvdW50YCBjb3VudHMgdW5pdHMgdGFrZW4uIEl0IGlzIGJ1bXBlZCBieQpbYEV2ZW50UmVnaXN0cnk6OnJlc2VydmVfYWRkb25gXSBhbmQgbmV2ZXIgZ29lcyBkb3duIOKAlCBjYW5jZWxsaW5nIGEgcmFjZQpkb2VzIG5vdCB1bi1zZWxsIGl0cyBqZXJzZXlzLCBiZWNhdXNlIHRoZSByZWZ1bmQgaXMgYW4gb2ZmLWNoYWluIHByb21pc2UuAAAAAAAAAAAACUFkZE9uRGF0YQAAAAAAAAQAAAAAAAAABGNvZGUAAAARAAAAQjctZGVjaW1hbCB0b2tlbiByZXByZXNlbnRhdGlvbiAoc1VTRCBvbiB0ZXN0bmV0LCBVU0RDIG9uIG1haW5uZXQpLgAAAAAACnByaWNlX3VzZGMAAAAAAAsAAAAAAAAABXF1b3RhAAAAAAAABAAAAAAAAAAOcmVzZXJ2ZWRfY291bnQAAAAAAAQ=",
        "AAAAAQAAAHVPbmUgcmFjZSBldmVudC4gYG1ldGFkYXRhX2hhc2hgIGNvbW1pdHMgdG8gdGhlIG9mZi1jaGFpbiBkZXRhaWwgZG9jdW1lbnQKcG9pbnRlZCBhdCBieSBgdXJpYDsgbm8gUElJIGV2ZXIgbGFuZHMgaGVyZS4AAAAAAAAAAAAACUV2ZW50RGF0YQAAAAAAAAYAAAAAAAAADW1ldGFkYXRhX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAEbmFtZQAAABAAAAAAAAAACW9yZ2FuaXNlcgAAAAAAABMAAAAAAAAACXN0YXJ0c19hdAAAAAAAAAYAAAAAAAAABnN0YXR1cwAAAAAH0AAAAAtFdmVudFN0YXR1cwAAAAAAAAAAA3VyaQAAAAAQ",
        "AAAABQAAAAAAAAAAAAAACkFkZE9uQWRkZWQAAAAAAAEAAAAMYWRkX29uX2FkZGVkAAAABAAAAAAAAAAIZXZlbnRfaWQAAAAEAAAAAQAAAAAAAAAIYWRkb25faWQAAAAEAAAAAAAAAAAAAAAFcXVvdGEAAAAAAAAEAAAAAAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAI=",
        "AAAAAgAAAypMaWZlY3ljbGUgb2YgYW4gZXZlbnQuIGBEcmFmdGAgLT4gYE9wZW5gIC0+IGBDbG9zZWRgIC0+IGBDb21wbGV0ZWRgLCB3aXRoCmBDbG9zZWRgIDwtPiBgT3BlbmAgYWxsb3dlZCBzbyBhbiBvcmdhbmlzZXIgY2FuIHJlLW9wZW4gcmVnaXN0cmF0aW9uLgpgQ29tcGxldGVkYCBpcyB0ZXJtaW5hbC4KCmBDYW5jZWxsZWRgICh2MikgaXMgcmVhY2hhYmxlIGZyb20gZXZlcnkgbm9uLXRlcm1pbmFsIHN0YXRlIGFuZCBpcyBpdHNlbGYKdGVybWluYWwuIEl0IGlzICoqbm90KiogdGhlIHNhbWUgdGhpbmcgYXMgYENsb3NlZGA6IGBDbG9zZWRgIG1lYW5zCnJlZ2lzdHJhdGlvbiBpcyBzaHV0IGJ1dCB0aGUgcmFjZSBpcyBzdGlsbCBoYXBwZW5pbmcsIGFuZCB0aGUgb3JnYW5pc2VyIGNhbgpyZS1vcGVuIGl0LiBgQ2FuY2VsbGVkYCBtZWFucyB0aGUgcmFjZSBpcyBvZmYuIE5vdGhpbmcgb24tY2hhaW4gcmVmdW5kcwphbnlib2R5IOKAlCByZWZ1bmRzIHN0YXkgYW4gb2ZmLWNoYWluIHByb21pc2UgKGBkb2NzL1NZU1RFTV9ERVNJR04ubWRgIMKnMTEpIOKAlApzbyB0aGUgdmFsdWUgb2YgdGhpcyBzdGF0dXMgaXMgdGhhdCB0aGUgY2hhaW4sIG5vdCBhIHdlYnNpdGUgYmFubmVyLCBpcwp3aGVyZSAidGhpcyByYWNlIGlzIG5vdCBoYXBwZW5pbmciIGlzIHJlY29yZGVkLgoKVGhlIHZhcmlhbnQgaXMgYXBwZW5kZWQgbGFzdCBvbiBwdXJwb3NlLiBBIGAjW2NvbnRyYWN0dHlwZV1gIGVudW0gdHJhdmVscyBhcwppdHMgdmFyaWFudCAqbmFtZSosIHNvIGV2ZXJ5IGBFdmVudERhdGFgIGFscmVhZHkgd3JpdHRlbiBrZWVwcyBkZWNvZGluZy4AAAAAAAAAAAALRXZlbnRTdGF0dXMAAAAABQAAAAAAAAAAAAAABURyYWZ0AAAAAAAAAAAAAAAAAAAET3BlbgAAAAAAAAAAAAAABkNsb3NlZAAAAAAAAAAAAAAAAAAJQ29tcGxldGVkAAAAAAAAAAAAAAAAAAAJQ2FuY2VsbGVkAAAA",
        "AAAAAQAAAH1PbmUgZGlzdGFuY2UgY2F0ZWdvcnkgb2YgYW4gZXZlbnQuIGBlbnRlcmVkX2NvdW50YCBkb3VibGVzIGFzIHRoZSBiaWIKc2VxdWVuY2UgaGFuZGVkIG91dCBieSBbYEV2ZW50UmVnaXN0cnk6OnJlc2VydmVfc2xvdGBdLgAAAAAAAAAAAAAMQ2F0ZWdvcnlEYXRhAAAABQAAAAAAAAAEY29kZQAAABEAAAAAAAAACmRpc3RhbmNlX20AAAAAAAQAAAAAAAAADWVudGVyZWRfY291bnQAAAAAAAAEAAAAQjctZGVjaW1hbCB0b2tlbiByZXByZXNlbnRhdGlvbiAoc1VTRCBvbiB0ZXN0bmV0LCBVU0RDIG9uIG1haW5uZXQpLgAAAAAACnByaWNlX3VzZGMAAAAAAAsAAAAAAAAABXF1b3RhAAAAAAAABA==",
        "AAAABQAAAAAAAAAAAAAADEV2ZW50Q3JlYXRlZAAAAAEAAAANZXZlbnRfY3JlYXRlZAAAAAAAAAIAAAAAAAAACGV2ZW50X2lkAAAABAAAAAEAAAAAAAAACW9yZ2FuaXNlcgAAAAAAABMAAAABAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADFNjYW5uZXJBZGRlZAAAAAEAAAANc2Nhbm5lcl9hZGRlZAAAAAAAAAIAAAAAAAAACGV2ZW50X2lkAAAABAAAAAEAAAAAAAAAB3NjYW5uZXIAAAAAEwAAAAEAAAAC",
        "AAAABQAAAAAAAAAAAAAADFNsb3RSZXNlcnZlZAAAAAEAAAANc2xvdF9yZXNlcnZlZAAAAAAAAAMAAAAAAAAACGV2ZW50X2lkAAAABAAAAAEAAAAAAAAAC2NhdGVnb3J5X2lkAAAAAAQAAAABAAAAAAAAAANzZXEAAAAABAAAAAAAAAAC",
        "AAAAAAAAA1NSZXBsYWNlcyB0aGlzIGNvbnRyYWN0J3Mgb3duIHdhc20uICoqQWRtaW4gb25seS4qKgoKU29yb2JhbiB1cGdyYWRlcyBhcmUgcHJvdG9jb2wtbGV2ZWw6IHRoZSBleGVjdXRhYmxlIGlzIHN3YXBwZWQgaW4gcGxhY2UKYW5kIHRoZSBjb250cmFjdCBrZWVwcyBpdHMgYWRkcmVzcywgaXRzIHN0b3JhZ2UgYW5kIGl0cyBiYWxhbmNlcy4gVGhlcmUKaXMgbm8gcHJveHkgYW5kIG5vIGBkZWxlZ2F0ZWNhbGxgLCBzbyB0aGVyZSBpcyBhbHNvIG5vIHN0b3JhZ2Utc2xvdAphbGlhc2luZyB0byBnZXQgd3Jvbmcg4oCUIGJ1dCB0aGUgbmV3IGNvZGUgZG9lcyByZWludGVycHJldCB0aGUgKmV4aXN0aW5nKgplbnRyaWVzLCB3aGljaCBpcyB3aHkgW2BEYXRhS2V5YF0gaXMgYXBwZW5kLW9ubHkgZm9yZXZlciAoc2VlIHRoZSBtb2R1bGUKZG9jcykuCgpUd28gY29uc2VxdWVuY2VzIHdvcnRoIGtub3dpbmcgYmVmb3JlIGNhbGxpbmcgdGhpczoKCiogVGhlIHN3YXAgdGFrZXMgZWZmZWN0ICoqYWZ0ZXIqKiB0aGlzIGludm9jYXRpb24gZmluaXNoZXMsIHNvIHRoZSBuZXcKY29kZSBjYW5ub3QgcnVuIGluIHRoZSBzYW1lIHRyYW5zYWN0aW9uLiBBIG1pZ3JhdGlvbiB0aGVyZWZvcmUgbmVlZHMgYQpzZWNvbmQgY2FsbC4KKiBgbmV3X3dhc21faGFzaGAgbXVzdCBhbHJlYWR5IGJlIHVwbG9hZGVkIHRvIHRoZSBsZWRnZXIsIGFuZCBub3RoaW5nCmNoZWNrcyB0aGF0IGl0IGlzIGEgKlN0ZXJ1biogY29udHJhY3QsIG9yIHRoYXQgaXQga2VwdCBhbiBgdXBncmFkZWAKZnVuY3Rpb24gb2YgaXRzIG93bi4gVXBncmFkaW5nIHRvIGEgd2FzbSB3aXRob3V0IG9uZSBlbmRzCnVwZ3JhZGVhYmlsaXR5IHBlcm1hbmVudGx5LgAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAABQAAAW9PbmUgdW5pdCBvZiBhbiBhZGQtb24gdGFrZW4uIGBzZXFgIGlzIHRoYXQgdW5pdCdzIDAtYmFzZWQgbnVtYmVyLCB3aGljaCBpcwp3aGF0IHR1cm5zICIyMDAgamVyc2V5cyBzb2xkIiBpbnRvICJqZXJzZXkgMzciIGZvciBhIGZ1bGZpbG1lbnQgZGVzaywgYW5kCmBwcmljZWAgaXMgdGhlIGFtb3VudCBbYEV2ZW50UmVnaXN0cnk6OnJlc2VydmVfYWRkb25gXSB0b2xkIFJhY2VSZWNvcmQgdG8KY2hhcmdlIGZvciBpdCDigJQgcmVjb3JkaW5nIGl0IGhlcmUgbWVhbnMgdGhlIGxlZGdlciBzaG93cyB0aGUgcHJpY2UgdGhhdCB3YXMKYWN0dWFsbHkgYXBwbGllZCwgbm90IHRoZSBwcmljZSB0aGUgYWRkLW9uIGhhcHBlbnMgdG8gY2FycnkgdG9kYXkuAAAAAAAAAAANQWRkT25SZXNlcnZlZAAAAAAAAAEAAAAPYWRkX29uX3Jlc2VydmVkAAAAAAQAAAAAAAAACGV2ZW50X2lkAAAABAAAAAEAAAAAAAAACGFkZG9uX2lkAAAABAAAAAEAAAAAAAAAA3NlcQAAAAAEAAAAAAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADUNhdGVnb3J5QWRkZWQAAAAAAAABAAAADmNhdGVnb3J5X2FkZGVkAAAAAAAEAAAAAAAAAAhldmVudF9pZAAAAAQAAAABAAAAAAAAAAtjYXRlZ29yeV9pZAAAAAAEAAAAAAAAAAAAAAAFcXVvdGEAAAAAAAAEAAAAAAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAM1FbWl0dGVkIHdoZW4gdGhlIGFkbWluIHB1dHMgYW4gYWRkcmVzcyBvbiB0aGUgb3JnYW5pc2VyIGFsbG93bGlzdCAodjIuMSkuClRoZXJlIGlzIG5vIGBldmVudF9pZGAgaGVyZSBvbiBwdXJwb3NlOiB0aGUgYWxsb3dsaXN0IGlzIGNvbnRyYWN0LXdpZGUsIGFuZAppdCBpcyBncmFudGVkIGJlZm9yZSB0aGUgZ3JhbnRlZSBoYXMgYW55IGV2ZW50IHRvIG5hbWUuAAAAAAAAAAAAAA5PcmdhbmlzZXJBZGRlZAAAAAAAAQAAAA9vcmdhbmlzZXJfYWRkZWQAAAAAAQAAAAAAAAAJb3JnYW5pc2VyAAAAAAAAEwAAAAEAAAAC",
        "AAAABQAAAAAAAAAAAAAADlNjYW5uZXJSZW1vdmVkAAAAAAABAAAAD3NjYW5uZXJfcmVtb3ZlZAAAAAACAAAAAAAAAAhldmVudF9pZAAAAAQAAAABAAAAAAAAAAdzY2FubmVyAAAAABMAAAABAAAAAg==",
        "AAAAAAAAAdlBZGRzIGEgcGFpZCBhZGQtb24gdG8gYW4gZXZlbnQgKFNURS0zNSkuIEFkZC1vbiBpZHMgcmVzdGFydCBhdCAwIGZvcgpldmVyeSBldmVudCwgZXhhY3RseSBsaWtlIGNhdGVnb3J5IGlkcy4KClRoZSB2YWxpZGF0aW9uIG1pcnJvcnMgW2BTZWxmOjphZGRfY2F0ZWdvcnlgXSBhbmQgcmV1c2VzIGl0cyBlcnJvciBjb2RlcwpvbiBwdXJwb3NlOiBgcXVvdGEgPT0gMGAgaXMgW2BFcnJvcjo6SW52YWxpZFF1b3RhYF0gYW5kIGEgbmVnYXRpdmUgcHJpY2UKaXMgW2BFcnJvcjo6SW52YWxpZFByaWNlYF0gd2hldGhlciB0aGUgdGhpbmcgcHJpY2VkIGlzIGEgZGlzdGFuY2Ugb3IgYQpqZXJzZXkuIEEgZnJlZSBhZGQtb24gKGBwcmljZV91c2RjID09IDBgKSBpcyBsZWdhbCDigJQgYSByYWNlIGNhbiBoYW5kIG91dAphIGJpYiBiZWx0IHRvIHdob2V2ZXIgYXNrcyBmb3Igb25lIGFuZCBzdGlsbCBjYXAgaG93IG1hbnkgaXQgaGFuZHMgb3V0LgAAAAAAAAlhZGRfYWRkb24AAAAAAAAEAAAAAAAAAAhldmVudF9pZAAAAAQAAAAAAAAABGNvZGUAAAARAAAAAAAAAApwcmljZV91c2RjAAAAAAALAAAAAAAAAAVxdW90YQAAAAAAAAQAAAABAAAD6QAAAAQAAAAD",
        "AAAAAAAAAAAAAAAJZ2V0X2FkZG9uAAAAAAAAAgAAAAAAAAAIZXZlbnRfaWQAAAAEAAAAAAAAAAhhZGRvbl9pZAAAAAQAAAABAAAD6QAAB9AAAAAJQWRkT25EYXRhAAAAAAAAAw==",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAAAAAAAJZ2V0X2V2ZW50AAAAAAAAAQAAAAAAAAAIZXZlbnRfaWQAAAAEAAAAAQAAA+kAAAfQAAAACUV2ZW50RGF0YQAAAAAAAAM=",
        "AAAAAAAAADlgZmFsc2VgIHdoZW4gdGhlIGFkZHJlc3Mgd2FzIG5ldmVyIGFkZGVkLCBvciB3YXMgcmVtb3ZlZC4AAAAAAAAKaXNfc2Nhbm5lcgAAAAAAAgAAAAAAAAAIZXZlbnRfaWQAAAAEAAAAAAAAAARhZGRyAAAAEwAAAAEAAAAB",
        "AAAABQAAALBFbWl0dGVkIGJ5IFtgRXZlbnRSZWdpc3RyeTo6dXBncmFkZWBdLiBBbiBpbmRleGVyIHRoYXQgaGFzIHRvIGV4cGxhaW4gd2h5IGEKY29udHJhY3QncyBiZWhhdmlvdXIgY2hhbmdlZCB1bmRlciBhIHN0YWJsZSBhZGRyZXNzIG5lZWRzIHRoZSBsZWRnZXIgdG8gc2F5CnNvOyB0aGlzIGlzIHRoYXQgcmVjb3JkLgAAAAAAAAAQQ29udHJhY3RVcGdyYWRlZAAAAAEAAAARY29udHJhY3RfdXBncmFkZWQAAAAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAEE9yZ2FuaXNlclJlbW92ZWQAAAABAAAAEW9yZ2FuaXNlcl9yZW1vdmVkAAAAAAAAAQAAAAAAAAAJb3JnYW5pc2VyAAAAAAAAEwAAAAEAAAAC",
        "AAAAAAAAAEJBbGxvd2xpc3RzIGEgdm9sdW50ZWVyIGRldmljZSBmb3IgcmFjZS1kYXkgY2hlY2staW4gb24gdGhpcyBldmVudC4AAAAAAAthZGRfc2Nhbm5lcgAAAAACAAAAAAAAAAhldmVudF9pZAAAAAQAAAAAAAAAB3NjYW5uZXIAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAItIb3cgbWFueSBhZGQtb25zIHRoaXMgZXZlbnQgaGFzLiBBbHNvIHRoZSBleGNsdXNpdmUgdXBwZXIgYm91bmQgb24gYQp2YWxpZCBgYWRkb25faWRgLCB3aGljaCBpcyB3aGF0IGJvdW5kcyB0aGUgbG9vcCBpbiBgUmFjZVJlY29yZC5lbnRlcmAuAAAAAAthZGRvbl9jb3VudAAAAAABAAAAAAAAAAhldmVudF9pZAAAAAQAAAABAAAABA==",
        "AAAAAAAAAAAAAAALZXZlbnRfY291bnQAAAAAAAAAAAEAAAAE",
        "AAAAAAAAAFBBZGRzIGEgZGlzdGFuY2UgY2F0ZWdvcnkgdG8gYW4gZXZlbnQuIENhdGVnb3J5IGlkcyByZXN0YXJ0IGF0IDAgZm9yCmV2ZXJ5IGV2ZW50LgAAAAxhZGRfY2F0ZWdvcnkAAAAFAAAAAAAAAAhldmVudF9pZAAAAAQAAAAAAAAABGNvZGUAAAARAAAAAAAAAApkaXN0YW5jZV9tAAAAAAAEAAAAAAAAAAVxdW90YQAAAAAAAAQAAAAAAAAACnByaWNlX3VzZGMAAAAAAAsAAAABAAAD6QAAAAQAAAAD",
        "AAAAAAAAAvFDcmVhdGVzIGFuIGV2ZW50IG93bmVkIGJ5IGBvcmdhbmlzZXJgLiBJZHMgYXJlIGFzc2lnbmVkIGZyb20gYQptb25vdG9uaWMgY291bnRlciBhbmQgbmV2ZXIgcmV1c2VkLiBUaGUgZXZlbnQgc3RhcnRzIGluCltgRXZlbnRTdGF0dXM6OkRyYWZ0YF0gc28gY2F0ZWdvcmllcyBjYW4gYmUgYWRkZWQgYmVmb3JlIHJlZ2lzdHJhdGlvbgpvcGVucy4KCioqVHdvIGdhdGVzLCBhbmQgdGhleSBhbnN3ZXIgZGlmZmVyZW50IHF1ZXN0aW9ucyoqICh2Mi4xKS4KYG9yZ2FuaXNlci5yZXF1aXJlX2F1dGgoKWAgYW5zd2VycyAiZG9lcyB0aGUgY2FsbGVyIGhvbGQgdGhpcyBrZXlwYWlyIjsKdGhlIGFsbG93bGlzdCBjaGVjayBhbnN3ZXJzICJpcyB0aGlzIGtleXBhaXIgb25lIHRoZSBhZG1pbiB2ZXR0ZWQiLgpXaXRob3V0IHRoZSBzZWNvbmQsIGBuYW1lYCBpcyBhbiB1bmNoZWNrZWQgYFN0cmluZ2AgYW5kIHRoZSBmaXJzdCBnYXRlCmhhcHBpbHkgbGV0cyBhIHN0cmFuZ2VyIHNpZ24gZm9yIHRoZWlyIG93biBhZGRyZXNzIHdoaWxlIGNhbGxpbmcgdGhlaXIKZXZlbnQgIkpha2FydGEgTWFyYXRob24gMjAyNiIuIEhlbmNlCltgRXJyb3I6Ok5vdEFsbG93bGlzdGVkT3JnYW5pc2VyYF0g4oCUIHNlZSBbYFNlbGY6OmFkZF9vcmdhbmlzZXJgXS4KClRoZSBhdXRoIGNoZWNrIHJ1bnMgZmlyc3Qgc28gYSBjYWxsZXIgd2hvIGRvZXMgbm90IGhvbGQgdGhlIGtleSBsZWFybnMKbm90aGluZyBhYm91dCB3aG8gaXMgb24gdGhlIGFsbG93bGlzdC4AAAAAAAAMY3JlYXRlX2V2ZW50AAAABQAAAAAAAAAJb3JnYW5pc2VyAAAAAAAAEwAAAAAAAAAEbmFtZQAAABAAAAAAAAAADW1ldGFkYXRhX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAADdXJpAAAAABAAAAAAAAAACXN0YXJ0c19hdAAAAAAAAAYAAAABAAAD6QAAAAQAAAAD",
        "AAAAAAAAAAAAAAAMZ2V0X2NhdGVnb3J5AAAAAgAAAAAAAAAIZXZlbnRfaWQAAAAEAAAAAAAAAAtjYXRlZ29yeV9pZAAAAAAEAAAAAQAAA+kAAAfQAAAADENhdGVnb3J5RGF0YQAAAAM=",
        "AAAAAAAAARRgZmFsc2VgIHdoZW4gdGhlIGFkZHJlc3Mgd2FzIG5ldmVyIGFsbG93bGlzdGVkLCBvciB3YXMgcmVtb3ZlZCAodjIuMSkuCgpUaGlzIGlzIHRoZSByZWFkIGEgY29uc29sZSB1c2VzIHRvIGRlY2lkZSB3aGV0aGVyIHRvIHNob3cgdGhlICJjcmVhdGUKZXZlbnQiIGZvcm0gYXQgYWxsLiBJdCBpcyBub3QgdGhlIGVuZm9yY2VtZW50IOKAlCBbYFNlbGY6OmNyZWF0ZV9ldmVudGBdCmlzIOKAlCBzbyBhIGNsaWVudCB0aGF0IHNraXBzIGl0IGdldHMgYSByZXZlcnQsIG5vdCBhbiBldmVudC4AAAAMaXNfb3JnYW5pc2VyAAAAAQAAAAAAAAAEYWRkcgAAABMAAAABAAAAAQ==",
        "AAAAAAAAAvVSZXNlcnZlcyBvbmUgc2xvdCBpbiBhIGNhdGVnb3J5IGFuZCByZXR1cm5zIGl0cyBiaWIgc2VxdWVuY2UgbnVtYmVyLgoKKipPbmx5IHRoZSB3aXJlZCBSYWNlUmVjb3JkIGNvbnRyYWN0IG1heSBjYWxsIHRoaXMuKiogVGhlIGdhdGUgaXMKaW52b2tlci1jb250cmFjdCBhdXRob3JpemF0aW9uOiB0aGUgc3RvcmVkIGBSYWNlUmVjb3JkQWRkcmAgbXVzdAphdXRob3JpemUsIGFuZCBhIGNvbnRyYWN0IGFkZHJlc3MgYXV0aG9yaXplcyBpbXBsaWNpdGx5ICpvbmx5KiB3aGVuIGl0CmlzIHRoZSBkaXJlY3QgY3Jvc3MtY29udHJhY3QgY2FsbGVyLiBSYWNlUmVjb3JkIGRvZXMgbm90IGltcGxlbWVudApgQ3VzdG9tQWNjb3VudEludGVyZmFjZWAgKGBfX2NoZWNrX2F1dGhgKSwgc28gdGhlcmUgaXMgbm8gc2lnbmF0dXJlIGFuCkVPQSBjb3VsZCBwcmVzZW50IGZvciB0aGF0IGFkZHJlc3MgZWl0aGVyIOKAlCBubyBvbmUgY2FuIG1pbnQgYSBzbG90CndpdGhvdXQgZ29pbmcgdGhyb3VnaCBgUmFjZVJlY29yZC5lbnRlcmAuCgpUaGUgcXVvdGEgY2hlY2sgYW5kIHRoZSBpbmNyZW1lbnQgaGFwcGVuIGluIHRoaXMgb25lIGludm9jYXRpb24sIHNvIHR3bwpzaW11bHRhbmVvdXMgZW50cmllcyBjYW4gbmV2ZXIgYm90aCB0YWtlIHRoZSBsYXN0IHNsb3Q6IHRoZSBzZWNvbmQKdHJhbnNhY3Rpb24gcmVhZHMgdGhlIGFscmVhZHktaW5jcmVtZW50ZWQgYGVudGVyZWRfY291bnRgIGFuZCByZXZlcnRzCndpdGggW2BFcnJvcjo6UXVvdGFGdWxsYF0uAAAAAAAADHJlc2VydmVfc2xvdAAAAAIAAAAAAAAACGV2ZW50X2lkAAAABAAAAAAAAAALY2F0ZWdvcnlfaWQAAAAABAAAAAEAAAPpAAAABAAAAAM=",
        "AAAABQAAAAAAAAAAAAAAEkV2ZW50U3RhdHVzQ2hhbmdlZAAAAAAAAQAAABRldmVudF9zdGF0dXNfY2hhbmdlZAAAAAIAAAAAAAAACGV2ZW50X2lkAAAABAAAAAEAAAAAAAAABnN0YXR1cwAAAAAH0AAAAAtFdmVudFN0YXR1cwAAAAAAAAAAAg==",
        "AAAAAAAAAEdSdW5zIG9uY2UgYXQgZGVwbG95IHRpbWUuIFN0b3JlcyB0aGUgYWRtaW4gYW5kIHNlZWRzIHRoZSBldmVudCBjb3VudGVyLgAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAslQdXRzIGBvcmdhbmlzZXJgIG9uIHRoZSBhbGxvd2xpc3QsIHdoaWNoIGlzIHdoYXQgW2BTZWxmOjpjcmVhdGVfZXZlbnRgXQpjaGVja3MuICoqQWRtaW4gb25seS4qKgoKVGhlIGFsbG93bGlzdCBleGlzdHMgYmVjYXVzZSBgY3JlYXRlX2V2ZW50YCB0YWtlcyB0aGUgZXZlbnQncyBgbmFtZWAgYXMKYSBmcmVlIGBTdHJpbmdgLiBgb3JnYW5pc2VyLnJlcXVpcmVfYXV0aCgpYCBwcm92ZXMgdGhlIGNhbGxlciBjb250cm9scwp0aGF0IGtleXBhaXIgYW5kIG5vdGhpbmcgbW9yZSDigJQgaXQgY2Fubm90IHNheSB3aGV0aGVyIHRoZSBrZXlwYWlyCmJlbG9uZ3MgdG8gdGhlIHJhY2UgaXQganVzdCBuYW1lZCBpdHNlbGYgYWZ0ZXIuIEFueW9uZSBjb3VsZCBjcmVhdGUKIkpha2FydGEgTWFyYXRob24gMjAyNiIgYW5kIHN0YXJ0IHNlbGxpbmcgZW50cmllcyB0byBpdC4gVGhlIGFsbG93bGlzdAppcyB0aGUgbWlzc2luZyBoYWxmOiBhIGtleXBhaXIgdGhlIGFkbWluIGhhcyBhY3R1YWxseSB2ZXR0ZWQgb2ZmLWNoYWluLgoKQWNjZXNzIGlzIGdyYW50ZWQgcGVyIGFkZHJlc3MsIG5vdCBwZXIgZXZlbnQsIGFuZCB0aGUgZ3JhbnQgaXMgd2hhdCBhbgpvcmdhbmlzZXIgZ2V0cyAqYmVmb3JlKiB0aGV5IGhhdmUgYW4gZXZlbnQuIFBlci1ldmVudCBhdXRob3JpdHkgc3RheXMKd2hlcmUgaXQgYWxyZWFkeSBsaXZlcyDigJQgaW4gYEV2ZW50RGF0YS5vcmdhbmlzZXJgLgAAAAAAAA1hZGRfb3JnYW5pc2VyAAAAAAAAAQAAAAAAAAAJb3JnYW5pc2VyAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAANZ2V0X29yZ2FuaXNlcgAAAAAAAAEAAAAAAAAACGV2ZW50X2lkAAAABAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAA/NUYWtlcyBvbmUgdW5pdCBvZiBhbiBhZGQtb24gYW5kIHJldHVybnMgKip0aGUgcHJpY2UgdG8gY2hhcmdlIGZvciBpdCoqLgoKU2FtZSBnYXRlIGFzIFtgU2VsZjo6cmVzZXJ2ZV9zbG90YF06IG9ubHkgdGhlIHdpcmVkIFJhY2VSZWNvcmQgY29udHJhY3QKY2FuIGNhbGwgdGhpcywgYnkgaW52b2tlci1jb250cmFjdCBhdXRob3JpemF0aW9uLiBBbiBlbnRyYW50IGNhbm5vdApyZXNlcnZlIGEgamVyc2V5IHdpdGhvdXQgcGF5aW5nIGZvciBpdCwgYmVjYXVzZSB0aGUgb25seSBjb2RlIHBhdGggdGhhdApyZWFjaGVzIGhlcmUgaXMgYFJhY2VSZWNvcmQuZW50ZXJgLCB3aGljaCBjaGFyZ2VzIHdoYXQgdGhpcyByZXR1cm5zCmluc2lkZSB0aGUgc2FtZSBpbnZvY2F0aW9uLgoKKipXaHkgaXQgcmV0dXJucyB0aGUgcHJpY2UgaW5zdGVhZCBvZiBhIHNlcXVlbmNlIG51bWJlci4qKiBUaGUgY2FsbGVyCm5lZWRzIHRoZSBwcmljZSwgYW5kIHJlYWRpbmcgaXQgc2VwYXJhdGVseSB3b3VsZCBtZWFuIGEgc2Vjb25kCmNyb3NzLWNvbnRyYWN0IGNhbGwgYWdhaW5zdCBzdGF0ZSB0aGF0IGNvdWxkLCBpbiBwcmluY2lwbGUsIGJlIGEKZGlmZmVyZW50IHZhbHVlIGJ5IHRoZW4uIFJldHVybmluZyBpdCBmcm9tIHRoZSByZXNlcnZpbmcgY2FsbCBtYWtlcyB0aGUKYW1vdW50IGNoYXJnZWQgYW5kIHRoZSB1bml0IHJlc2VydmVkIHRoZSBzYW1lIHJlYWQuIFRoZSBzZXF1ZW5jZSBudW1iZXIKaXMgc3RpbGwgcHVibGlzaGVkIG9uIFtgQWRkT25SZXNlcnZlZGBdIGZvciBhbnlvbmUgZnVsZmlsbGluZyB0aGUgb3JkZXIuCgpUaGUgcXVvdGEgY2hlY2sgYW5kIHRoZSBpbmNyZW1lbnQgaGFwcGVuIGluIHRoaXMgb25lIGludm9jYXRpb24sIHNvIHRoZQpsYXN0IGplcnNleSBjYW5ub3QgYmUgc29sZCB0d2ljZTogdGhlIHNlY29uZCBlbnRyeSByZWFkcyB0aGUKYWxyZWFkeS1pbmNyZW1lbnRlZCBgcmVzZXJ2ZWRfY291bnRgIGFuZCByZXZlcnRzIHdpdGgKW2BFcnJvcjo6QWRkT25RdW90YUZ1bGxgXS4AAAAADXJlc2VydmVfYWRkb24AAAAAAAACAAAAAAAAAAhldmVudF9pZAAAAAQAAAAAAAAACGFkZG9uX2lkAAAABAAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAAAAAAAAOY2F0ZWdvcnlfY291bnQAAAAAAAEAAAAAAAAACGV2ZW50X2lkAAAABAAAAAEAAAAE",
        "AAAAAAAAAHZSZXZva2VzIGEgdm9sdW50ZWVyIGRldmljZS4gVGhlIGVudHJ5IGlzIHJlbW92ZWQgcmF0aGVyIHRoYW4gc2V0IHRvCmBmYWxzZWAgc28gdGhlIG9yZ2FuaXNlciBzdG9wcyBwYXlpbmcgcmVudCBmb3IgaXQuAAAAAAAOcmVtb3ZlX3NjYW5uZXIAAAAAAAIAAAAAAAAACGV2ZW50X2lkAAAABAAAAAAAAAAHc2Nhbm5lcgAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAPZ2V0X3JhY2VfcmVjb3JkAAAAAAAAAAABAAAD6QAAABMAAAAD",
        "AAAAAAAAAMtPbmUtc2hvdCB3aXJpbmcgb2YgdGhlIFJhY2VSZWNvcmQgY29udHJhY3QgYWRkcmVzcywgZG9uZSBieSB0aGUgYWRtaW4Kb25jZSBib3RoIGNvbnRyYWN0cyBhcmUgZGVwbG95ZWQuIEEgc2Vjb25kIGNhbGwgaXMgcmVqZWN0ZWQgc28gdGhlCnRydXN0ZWQgY2FsbGVyIG9mIFtgU2VsZjo6cmVzZXJ2ZV9zbG90YF0gY2FuIG5ldmVyIGJlIHN3YXBwZWQgb3V0LgAAAAAPc2V0X3JhY2VfcmVjb3JkAAAAAAEAAAAAAAAAC3JhY2VfcmVjb3JkAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAnRSZXZva2VzIGFuIG9yZ2FuaXNlci4gKipBZG1pbiBvbmx5LioqCgpMaWtlIFtgU2VsZjo6cmVtb3ZlX3NjYW5uZXJgXSwgdGhlIGVudHJ5IGlzIHJlbW92ZWQgcmF0aGVyIHRoYW4gc2V0IHRvCmBmYWxzZWAsIHNvIHRoZSBjb250cmFjdCBzdG9wcyBwYXlpbmcgcmVudCBmb3IgYSByZXZva2VkIGFkZHJlc3MuCgpSZXZva2luZyBpcyBmb3J3YXJkLWxvb2tpbmcgb25seTogZXZlbnRzIHRoZSBhZGRyZXNzIGFscmVhZHkgY3JlYXRlZAprZWVwIHRoZWlyIG9yZ2FuaXNlciwgYW5kIGl0IGtlZXBzIGV2ZXJ5IHBlci1ldmVudCBwb3dlciBvdmVyIHRoZW0KKGBhZGRfY2F0ZWdvcnlgLCBgc2V0X2V2ZW50X3N0YXR1c2AsIHRoZSBzY2FubmVyIGFsbG93bGlzdCwgYW5kCmByZWNvcmRfZmluaXNoYCBvdmVyIGluIFJhY2VSZWNvcmQpLiBXaGF0IGl0IGxvc2VzIGlzIHRoZSBhYmlsaXR5IHRvCmNyZWF0ZSAqbmV3KiBldmVudHMuIFRha2luZyBhIHJ1bm5pbmcgcmFjZSBhd2F5IGZyb20gdGhlIG9yZ2FuaXNlcgptaWQtZXZlbnQgd291bGQgc3RyYW5kIGl0cyBlbnRyYW50cywgYW5kIGEgcmFjZSB3aG9zZSBlbnRyaWVzIGFyZQphbHJlYWR5IHNvbGQgY2Fubm90IGJlIHVuLXJ1biBieSBhIHN0b3JhZ2Ugd3JpdGUuAAAAEHJlbW92ZV9vcmdhbmlzZXIAAAABAAAAAAAAAAlvcmdhbmlzZXIAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAbNNb3ZlcyB0aGUgZXZlbnQgdGhyb3VnaCBpdHMgbGlmZWN5Y2xlLiBPbmx5IGZvcndhcmQgbW92ZXMgYXJlIGxlZ2FsLApwbHVzIHRoZSBgT3BlbmAgPC0+IGBDbG9zZWRgIHRvZ2dsZTsgYENvbXBsZXRlZGAgYW5kIGBDYW5jZWxsZWRgIGFyZQp0ZXJtaW5hbCBhbmQgYSBuby1vcCB0cmFuc2l0aW9uIGlzIHJlamVjdGVkIHNvIG5vIG1pc2xlYWRpbmcgZXZlbnQgaXMKZW1pdHRlZC4KCkNhbmNlbGxpbmcgc3RvcHMgZW50cmllcyBieSBpdHNlbGY6IFtgU2VsZjo6cmVzZXJ2ZV9zbG90YF0gYW5kCltgU2VsZjo6cmVzZXJ2ZV9hZGRvbmBdIGJvdGggcmVxdWlyZSBgT3BlbmAsIHNvIGEgY2FuY2VsbGVkIGV2ZW50CnJlamVjdHMgZXZlcnkgbmV3IGVudHJ5IHdpdGggW2BFcnJvcjo6RXZlbnROb3RPcGVuYF0gd2l0aG91dCBuZWVkaW5nIGEKZ3VhcmQgb2YgaXRzIG93bi4AAAAAEHNldF9ldmVudF9zdGF0dXMAAAACAAAAAAAAAAhldmVudF9pZAAAAAQAAAAAAAAABnN0YXR1cwAAAAAH0AAAAAtFdmVudFN0YXR1cwAAAAABAAAD6QAAAAIAAAAD" ]),
      options
    )
  }
  public readonly fromJSON = {
    upgrade: this.txFromJSON<Result<void>>,
        add_addon: this.txFromJSON<Result<u32>>,
        get_addon: this.txFromJSON<Result<AddOnData>>,
        get_admin: this.txFromJSON<Result<string>>,
        get_event: this.txFromJSON<Result<EventData>>,
        is_scanner: this.txFromJSON<boolean>,
        add_scanner: this.txFromJSON<Result<void>>,
        addon_count: this.txFromJSON<u32>,
        event_count: this.txFromJSON<u32>,
        add_category: this.txFromJSON<Result<u32>>,
        create_event: this.txFromJSON<Result<u32>>,
        get_category: this.txFromJSON<Result<CategoryData>>,
        is_organiser: this.txFromJSON<boolean>,
        reserve_slot: this.txFromJSON<Result<u32>>,
        add_organiser: this.txFromJSON<Result<void>>,
        get_organiser: this.txFromJSON<Result<string>>,
        reserve_addon: this.txFromJSON<Result<i128>>,
        category_count: this.txFromJSON<u32>,
        remove_scanner: this.txFromJSON<Result<void>>,
        get_race_record: this.txFromJSON<Result<string>>,
        set_race_record: this.txFromJSON<Result<void>>,
        remove_organiser: this.txFromJSON<Result<void>>,
        set_event_status: this.txFromJSON<Result<void>>
  }
}