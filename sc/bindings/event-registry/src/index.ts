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
  13: {message:"ScannerNotFound"}
}

/**
 * Storage schema. `Admin` / `RaceRecordAddr` / `EventCount` live in instance
 * storage (tiny, global, read on most calls); everything else is persistent
 * so it survives archival cycles.
 */
export type DataKey = {tag: "Admin", values: void} | {tag: "RaceRecordAddr", values: void} | {tag: "EventCount", values: void} | {tag: "Event", values: readonly [u32]} | {tag: "Category", values: readonly [u32, u32]} | {tag: "CategoryCount", values: readonly [u32]} | {tag: "Scanner", values: readonly [u32, string]};


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
 */
export type EventStatus = {tag: "Draft", values: void} | {tag: "Open", values: void} | {tag: "Closed", values: void} | {tag: "Completed", values: void};


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
   */
  create_event: ({organiser, name, metadata_hash, uri, starts_at}: {organiser: string, name: string, metadata_hash: Buffer, uri: string, starts_at: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a get_category transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_category: ({event_id, category_id}: {event_id: u32, category_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<CategoryData>>>

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
   * Construct and simulate a get_organiser transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_organiser: ({event_id}: {event_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

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
   * Construct and simulate a set_event_status transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Moves the event through its lifecycle. Only forward moves are legal,
   * plus the `Open` <-> `Closed` toggle; `Completed` is terminal and a
   * no-op transition is rejected so no misleading event is emitted.
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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADQAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAADUV2ZW50Tm90Rm91bmQAAAAAAAACAAAAAAAAABBDYXRlZ29yeU5vdEZvdW5kAAAAAwAAAAAAAAAMRXZlbnROb3RPcGVuAAAABAAAAAAAAAAJUXVvdGFGdWxsAAAAAAAABQAAAAAAAAAQUmFjZVJlY29yZE5vdFNldAAAAAYAAAAAAAAAFFJhY2VSZWNvcmRBbHJlYWR5U2V0AAAABwAAAAxgcXVvdGEgPT0gMGAAAAAMSW52YWxpZFF1b3RhAAAACAAAABBgcHJpY2VfdXNkYyA8IDBgAAAADEludmFsaWRQcmljZQAAAAkAAAARYGRpc3RhbmNlX20gPT0gMGAAAAAAAAAPSW52YWxpZERpc3RhbmNlAAAAAAoAAAAjSWxsZWdhbCBbYEV2ZW50U3RhdHVzYF0gdHJhbnNpdGlvbi4AAAAADUludmFsaWRTdGF0dXMAAAAAAAALAAAAAAAAABNTY2FubmVyQWxyZWFkeUFkZGVkAAAAAAwAAAAAAAAAD1NjYW5uZXJOb3RGb3VuZAAAAAAN",
        "AAAAAgAAALRTdG9yYWdlIHNjaGVtYS4gYEFkbWluYCAvIGBSYWNlUmVjb3JkQWRkcmAgLyBgRXZlbnRDb3VudGAgbGl2ZSBpbiBpbnN0YW5jZQpzdG9yYWdlICh0aW55LCBnbG9iYWwsIHJlYWQgb24gbW9zdCBjYWxscyk7IGV2ZXJ5dGhpbmcgZWxzZSBpcyBwZXJzaXN0ZW50CnNvIGl0IHN1cnZpdmVzIGFyY2hpdmFsIGN5Y2xlcy4AAAAAAAAAB0RhdGFLZXkAAAAABwAAAAAAAAAVaW5zdGFuY2UgLT4gYEFkZHJlc3NgAAAAAAAABUFkbWluAAAAAAAAAAAAABVpbnN0YW5jZSAtPiBgQWRkcmVzc2AAAAAAAAAOUmFjZVJlY29yZEFkZHIAAAAAAAAAAAARaW5zdGFuY2UgLT4gYHUzMmAAAAAAAAAKRXZlbnRDb3VudAAAAAAAAQAAADBwZXJzaXN0ZW50IC0+IFtgRXZlbnREYXRhYF0sIGtleWVkIGJ5IGBldmVudF9pZGAAAAAFRXZlbnQAAAAAAAABAAAABAAAAAEAAABCcGVyc2lzdGVudCAtPiBbYENhdGVnb3J5RGF0YWBdLCBrZXllZCBieSBgKGV2ZW50X2lkLCBjYXRlZ29yeV9pZClgAAAAAAAIQ2F0ZWdvcnkAAAACAAAABAAAAAQAAAABAAAAKHBlcnNpc3RlbnQgLT4gYHUzMmAsIGtleWVkIGJ5IGBldmVudF9pZGAAAAANQ2F0ZWdvcnlDb3VudAAAAAAAAAEAAAAEAAAAAQAAADRwZXJzaXN0ZW50IC0+IGBib29sYCwga2V5ZWQgYnkgYChldmVudF9pZCwgc2Nhbm5lcilgAAAAB1NjYW5uZXIAAAAAAgAAAAQAAAAT",
        "AAAAAQAAAHVPbmUgcmFjZSBldmVudC4gYG1ldGFkYXRhX2hhc2hgIGNvbW1pdHMgdG8gdGhlIG9mZi1jaGFpbiBkZXRhaWwgZG9jdW1lbnQKcG9pbnRlZCBhdCBieSBgdXJpYDsgbm8gUElJIGV2ZXIgbGFuZHMgaGVyZS4AAAAAAAAAAAAACUV2ZW50RGF0YQAAAAAAAAYAAAAAAAAADW1ldGFkYXRhX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAEbmFtZQAAABAAAAAAAAAACW9yZ2FuaXNlcgAAAAAAABMAAAAAAAAACXN0YXJ0c19hdAAAAAAAAAYAAAAAAAAABnN0YXR1cwAAAAAH0AAAAAtFdmVudFN0YXR1cwAAAAAAAAAAA3VyaQAAAAAQ",
        "AAAAAgAAAKhMaWZlY3ljbGUgb2YgYW4gZXZlbnQuIGBEcmFmdGAgLT4gYE9wZW5gIC0+IGBDbG9zZWRgIC0+IGBDb21wbGV0ZWRgLCB3aXRoCmBDbG9zZWRgIDwtPiBgT3BlbmAgYWxsb3dlZCBzbyBhbiBvcmdhbmlzZXIgY2FuIHJlLW9wZW4gcmVnaXN0cmF0aW9uLgpgQ29tcGxldGVkYCBpcyB0ZXJtaW5hbC4AAAAAAAAAC0V2ZW50U3RhdHVzAAAAAAQAAAAAAAAAAAAAAAVEcmFmdAAAAAAAAAAAAAAAAAAABE9wZW4AAAAAAAAAAAAAAAZDbG9zZWQAAAAAAAAAAAAAAAAACUNvbXBsZXRlZAAAAA==",
        "AAAAAQAAAH1PbmUgZGlzdGFuY2UgY2F0ZWdvcnkgb2YgYW4gZXZlbnQuIGBlbnRlcmVkX2NvdW50YCBkb3VibGVzIGFzIHRoZSBiaWIKc2VxdWVuY2UgaGFuZGVkIG91dCBieSBbYEV2ZW50UmVnaXN0cnk6OnJlc2VydmVfc2xvdGBdLgAAAAAAAAAAAAAMQ2F0ZWdvcnlEYXRhAAAABQAAAAAAAAAEY29kZQAAABEAAAAAAAAACmRpc3RhbmNlX20AAAAAAAQAAAAAAAAADWVudGVyZWRfY291bnQAAAAAAAAEAAAAQjctZGVjaW1hbCB0b2tlbiByZXByZXNlbnRhdGlvbiAoc1VTRCBvbiB0ZXN0bmV0LCBVU0RDIG9uIG1haW5uZXQpLgAAAAAACnByaWNlX3VzZGMAAAAAAAsAAAAAAAAABXF1b3RhAAAAAAAABA==",
        "AAAABQAAAAAAAAAAAAAADEV2ZW50Q3JlYXRlZAAAAAEAAAANZXZlbnRfY3JlYXRlZAAAAAAAAAIAAAAAAAAACGV2ZW50X2lkAAAABAAAAAEAAAAAAAAACW9yZ2FuaXNlcgAAAAAAABMAAAABAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADFNjYW5uZXJBZGRlZAAAAAEAAAANc2Nhbm5lcl9hZGRlZAAAAAAAAAIAAAAAAAAACGV2ZW50X2lkAAAABAAAAAEAAAAAAAAAB3NjYW5uZXIAAAAAEwAAAAEAAAAC",
        "AAAABQAAAAAAAAAAAAAADFNsb3RSZXNlcnZlZAAAAAEAAAANc2xvdF9yZXNlcnZlZAAAAAAAAAMAAAAAAAAACGV2ZW50X2lkAAAABAAAAAEAAAAAAAAAC2NhdGVnb3J5X2lkAAAAAAQAAAABAAAAAAAAAANzZXEAAAAABAAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADUNhdGVnb3J5QWRkZWQAAAAAAAABAAAADmNhdGVnb3J5X2FkZGVkAAAAAAAEAAAAAAAAAAhldmVudF9pZAAAAAQAAAABAAAAAAAAAAtjYXRlZ29yeV9pZAAAAAAEAAAAAAAAAAAAAAAFcXVvdGEAAAAAAAAEAAAAAAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADlNjYW5uZXJSZW1vdmVkAAAAAAABAAAAD3NjYW5uZXJfcmVtb3ZlZAAAAAACAAAAAAAAAAhldmVudF9pZAAAAAQAAAABAAAAAAAAAAdzY2FubmVyAAAAABMAAAABAAAAAg==",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAAAAAAAJZ2V0X2V2ZW50AAAAAAAAAQAAAAAAAAAIZXZlbnRfaWQAAAAEAAAAAQAAA+kAAAfQAAAACUV2ZW50RGF0YQAAAAAAAAM=",
        "AAAAAAAAADlgZmFsc2VgIHdoZW4gdGhlIGFkZHJlc3Mgd2FzIG5ldmVyIGFkZGVkLCBvciB3YXMgcmVtb3ZlZC4AAAAAAAAKaXNfc2Nhbm5lcgAAAAAAAgAAAAAAAAAIZXZlbnRfaWQAAAAEAAAAAAAAAARhZGRyAAAAEwAAAAEAAAAB",
        "AAAAAAAAAEJBbGxvd2xpc3RzIGEgdm9sdW50ZWVyIGRldmljZSBmb3IgcmFjZS1kYXkgY2hlY2staW4gb24gdGhpcyBldmVudC4AAAAAAAthZGRfc2Nhbm5lcgAAAAACAAAAAAAAAAhldmVudF9pZAAAAAQAAAAAAAAAB3NjYW5uZXIAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAALZXZlbnRfY291bnQAAAAAAAAAAAEAAAAE",
        "AAAAAAAAAFBBZGRzIGEgZGlzdGFuY2UgY2F0ZWdvcnkgdG8gYW4gZXZlbnQuIENhdGVnb3J5IGlkcyByZXN0YXJ0IGF0IDAgZm9yCmV2ZXJ5IGV2ZW50LgAAAAxhZGRfY2F0ZWdvcnkAAAAFAAAAAAAAAAhldmVudF9pZAAAAAQAAAAAAAAABGNvZGUAAAARAAAAAAAAAApkaXN0YW5jZV9tAAAAAAAEAAAAAAAAAAVxdW90YQAAAAAAAAQAAAAAAAAACnByaWNlX3VzZGMAAAAAAAsAAAABAAAD6QAAAAQAAAAD",
        "AAAAAAAAAMNDcmVhdGVzIGFuIGV2ZW50IG93bmVkIGJ5IGBvcmdhbmlzZXJgLiBJZHMgYXJlIGFzc2lnbmVkIGZyb20gYQptb25vdG9uaWMgY291bnRlciBhbmQgbmV2ZXIgcmV1c2VkLiBUaGUgZXZlbnQgc3RhcnRzIGluCltgRXZlbnRTdGF0dXM6OkRyYWZ0YF0gc28gY2F0ZWdvcmllcyBjYW4gYmUgYWRkZWQgYmVmb3JlIHJlZ2lzdHJhdGlvbgpvcGVucy4AAAAADGNyZWF0ZV9ldmVudAAAAAUAAAAAAAAACW9yZ2FuaXNlcgAAAAAAABMAAAAAAAAABG5hbWUAAAAQAAAAAAAAAA1tZXRhZGF0YV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAA3VyaQAAAAAQAAAAAAAAAAlzdGFydHNfYXQAAAAAAAAGAAAAAQAAA+kAAAAEAAAAAw==",
        "AAAAAAAAAAAAAAAMZ2V0X2NhdGVnb3J5AAAAAgAAAAAAAAAIZXZlbnRfaWQAAAAEAAAAAAAAAAtjYXRlZ29yeV9pZAAAAAAEAAAAAQAAA+kAAAfQAAAADENhdGVnb3J5RGF0YQAAAAM=",
        "AAAAAAAAAvVSZXNlcnZlcyBvbmUgc2xvdCBpbiBhIGNhdGVnb3J5IGFuZCByZXR1cm5zIGl0cyBiaWIgc2VxdWVuY2UgbnVtYmVyLgoKKipPbmx5IHRoZSB3aXJlZCBSYWNlUmVjb3JkIGNvbnRyYWN0IG1heSBjYWxsIHRoaXMuKiogVGhlIGdhdGUgaXMKaW52b2tlci1jb250cmFjdCBhdXRob3JpemF0aW9uOiB0aGUgc3RvcmVkIGBSYWNlUmVjb3JkQWRkcmAgbXVzdAphdXRob3JpemUsIGFuZCBhIGNvbnRyYWN0IGFkZHJlc3MgYXV0aG9yaXplcyBpbXBsaWNpdGx5ICpvbmx5KiB3aGVuIGl0CmlzIHRoZSBkaXJlY3QgY3Jvc3MtY29udHJhY3QgY2FsbGVyLiBSYWNlUmVjb3JkIGRvZXMgbm90IGltcGxlbWVudApgQ3VzdG9tQWNjb3VudEludGVyZmFjZWAgKGBfX2NoZWNrX2F1dGhgKSwgc28gdGhlcmUgaXMgbm8gc2lnbmF0dXJlIGFuCkVPQSBjb3VsZCBwcmVzZW50IGZvciB0aGF0IGFkZHJlc3MgZWl0aGVyIOKAlCBubyBvbmUgY2FuIG1pbnQgYSBzbG90CndpdGhvdXQgZ29pbmcgdGhyb3VnaCBgUmFjZVJlY29yZC5lbnRlcmAuCgpUaGUgcXVvdGEgY2hlY2sgYW5kIHRoZSBpbmNyZW1lbnQgaGFwcGVuIGluIHRoaXMgb25lIGludm9jYXRpb24sIHNvIHR3bwpzaW11bHRhbmVvdXMgZW50cmllcyBjYW4gbmV2ZXIgYm90aCB0YWtlIHRoZSBsYXN0IHNsb3Q6IHRoZSBzZWNvbmQKdHJhbnNhY3Rpb24gcmVhZHMgdGhlIGFscmVhZHktaW5jcmVtZW50ZWQgYGVudGVyZWRfY291bnRgIGFuZCByZXZlcnRzCndpdGggW2BFcnJvcjo6UXVvdGFGdWxsYF0uAAAAAAAADHJlc2VydmVfc2xvdAAAAAIAAAAAAAAACGV2ZW50X2lkAAAABAAAAAAAAAALY2F0ZWdvcnlfaWQAAAAABAAAAAEAAAPpAAAABAAAAAM=",
        "AAAABQAAAAAAAAAAAAAAEkV2ZW50U3RhdHVzQ2hhbmdlZAAAAAAAAQAAABRldmVudF9zdGF0dXNfY2hhbmdlZAAAAAIAAAAAAAAACGV2ZW50X2lkAAAABAAAAAEAAAAAAAAABnN0YXR1cwAAAAAH0AAAAAtFdmVudFN0YXR1cwAAAAAAAAAAAg==",
        "AAAAAAAAAEdSdW5zIG9uY2UgYXQgZGVwbG95IHRpbWUuIFN0b3JlcyB0aGUgYWRtaW4gYW5kIHNlZWRzIHRoZSBldmVudCBjb3VudGVyLgAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAANZ2V0X29yZ2FuaXNlcgAAAAAAAAEAAAAAAAAACGV2ZW50X2lkAAAABAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAAAAAAAOY2F0ZWdvcnlfY291bnQAAAAAAAEAAAAAAAAACGV2ZW50X2lkAAAABAAAAAEAAAAE",
        "AAAAAAAAAHZSZXZva2VzIGEgdm9sdW50ZWVyIGRldmljZS4gVGhlIGVudHJ5IGlzIHJlbW92ZWQgcmF0aGVyIHRoYW4gc2V0IHRvCmBmYWxzZWAgc28gdGhlIG9yZ2FuaXNlciBzdG9wcyBwYXlpbmcgcmVudCBmb3IgaXQuAAAAAAAOcmVtb3ZlX3NjYW5uZXIAAAAAAAIAAAAAAAAACGV2ZW50X2lkAAAABAAAAAAAAAAHc2Nhbm5lcgAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAPZ2V0X3JhY2VfcmVjb3JkAAAAAAAAAAABAAAD6QAAABMAAAAD",
        "AAAAAAAAAMtPbmUtc2hvdCB3aXJpbmcgb2YgdGhlIFJhY2VSZWNvcmQgY29udHJhY3QgYWRkcmVzcywgZG9uZSBieSB0aGUgYWRtaW4Kb25jZSBib3RoIGNvbnRyYWN0cyBhcmUgZGVwbG95ZWQuIEEgc2Vjb25kIGNhbGwgaXMgcmVqZWN0ZWQgc28gdGhlCnRydXN0ZWQgY2FsbGVyIG9mIFtgU2VsZjo6cmVzZXJ2ZV9zbG90YF0gY2FuIG5ldmVyIGJlIHN3YXBwZWQgb3V0LgAAAAAPc2V0X3JhY2VfcmVjb3JkAAAAAAEAAAAAAAAAC3JhY2VfcmVjb3JkAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAMdNb3ZlcyB0aGUgZXZlbnQgdGhyb3VnaCBpdHMgbGlmZWN5Y2xlLiBPbmx5IGZvcndhcmQgbW92ZXMgYXJlIGxlZ2FsLApwbHVzIHRoZSBgT3BlbmAgPC0+IGBDbG9zZWRgIHRvZ2dsZTsgYENvbXBsZXRlZGAgaXMgdGVybWluYWwgYW5kIGEKbm8tb3AgdHJhbnNpdGlvbiBpcyByZWplY3RlZCBzbyBubyBtaXNsZWFkaW5nIGV2ZW50IGlzIGVtaXR0ZWQuAAAAABBzZXRfZXZlbnRfc3RhdHVzAAAAAgAAAAAAAAAIZXZlbnRfaWQAAAAEAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAALRXZlbnRTdGF0dXMAAAAAAQAAA+kAAAACAAAAAw==" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_admin: this.txFromJSON<Result<string>>,
        get_event: this.txFromJSON<Result<EventData>>,
        is_scanner: this.txFromJSON<boolean>,
        add_scanner: this.txFromJSON<Result<void>>,
        event_count: this.txFromJSON<u32>,
        add_category: this.txFromJSON<Result<u32>>,
        create_event: this.txFromJSON<Result<u32>>,
        get_category: this.txFromJSON<Result<CategoryData>>,
        reserve_slot: this.txFromJSON<Result<u32>>,
        get_organiser: this.txFromJSON<Result<string>>,
        category_count: this.txFromJSON<u32>,
        remove_scanner: this.txFromJSON<Result<void>>,
        get_race_record: this.txFromJSON<Result<string>>,
        set_race_record: this.txFromJSON<Result<void>>,
        set_event_status: this.txFromJSON<Result<void>>
  }
}