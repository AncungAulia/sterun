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
  100: {message:"NotInitialized"},
  101: {message:"RecordNotFound"},
  /**
   * `claim_racepack` when the state is not [`RecordState::Entered`] — the
   * anti-double-racepack guard.
   */
  102: {message:"AlreadyClaimed"},
  /**
   * `record_finish` when the state is not [`RecordState::RacepackClaimed`],
   * or any attempt to move out of a terminal state.
   */
  103: {message:"InvalidState"},
  /**
   * The operator is neither the event organiser nor an allowlisted scanner.
   */
  104: {message:"NotAuthorized"},
  /**
   * `finish_time_s == 0`.
   */
  105: {message:"InvalidFinishTime"}
}



/**
 * The verifiable record itself. `participant_hash` is
 * `sha256(name || national_id || emergency_contact || salt)` — a commitment
 * to off-chain PII, never the PII.
 */
export interface RecordData {
  /**
 * The category sequence handed out by `EventRegistry::reserve_slot`.
 */
bib_no: u32;
  category_id: u32;
  claimed_at: Option<u64>;
  entered_at: u64;
  event_id: u32;
  finish_time_s: Option<u32>;
  participant_hash: Buffer;
  result_at: Option<u64>;
  state: RecordState;
}

/**
 * Lifecycle of one race record. `Finished` and `Dnf` are terminal: there is
 * no exported path out of either.
 */
export type RecordState = {tag: "Entered", values: void} | {tag: "RacepackClaimed", values: void} | {tag: "Finished", values: void} | {tag: "Dnf", values: void};





export const NonFungibleTokenError = {
  /**
   * Indicates a non-existent `token_id`.
   */
  200: {message:"NonExistentToken"},
  /**
   * Indicates an error related to the ownership over a particular token.
   * Used in transfers.
   */
  201: {message:"IncorrectOwner"},
  /**
   * Indicates a failure with the `operator`s approval. Used in transfers.
   */
  202: {message:"InsufficientApproval"},
  /**
   * Indicates a failure with the `approver` of a token to be approved. Used
   * in approvals.
   */
  203: {message:"InvalidApprover"},
  /**
   * Indicates an invalid value for `live_until_ledger` when setting
   * approvals.
   */
  204: {message:"InvalidLiveUntilLedger"},
  /**
   * Indicates overflow when adding two values
   */
  205: {message:"MathOverflow"},
  /**
   * Indicates all possible `token_id`s are already in use.
   */
  206: {message:"TokenIDsAreDepleted"},
  /**
   * Indicates an invalid amount to batch mint in `consecutive` extension.
   */
  207: {message:"InvalidAmount"},
  /**
   * Indicates the token does not exist in owner's list.
   */
  208: {message:"TokenNotFoundInOwnerList"},
  /**
   * Indicates the token does not exist in global list.
   */
  209: {message:"TokenNotFoundInGlobalList"},
  /**
   * Indicates access to unset metadata.
   */
  210: {message:"UnsetMetadata"},
  /**
   * Indicates the length of the base URI exceeds the maximum allowed.
   */
  211: {message:"BaseUriMaxLenExceeded"},
  /**
   * Indicates the royalty amount is higher than 10_000 (100%) basis points.
   */
  212: {message:"InvalidRoyaltyAmount"},
  /**
   * Indicates the length of the name exceeds the maximum allowed.
   */
  213: {message:"NameMaxLenExceeded"},
  /**
   * Indicates the length of the symbol exceeds the maximum allowed.
   */
  214: {message:"SymbolMaxLenExceeded"}
}

export interface Client {
  /**
   * Construct and simulate a name transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Collection name, from the OpenZeppelin metadata written by the
   * constructor.
   */
  name: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a enter transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Registers `runner` for a category and mints their record. **One
   * invocation, one atomicity boundary**: the quota reservation, the entry
   * fee and the mint either all land or all roll back, so a failed payment
   * can never leave a slot consumed or a record without a fee.
   * 
   * Steps, in order:
   * 1. `runner.require_auth()` — the runner signs one auth tree that also
   * covers the nested SEP-41 `transfer` sub-invocation.
   * 2. `reserve_slot` on the registry. RaceRecord is the direct caller, so
   * the registry's stored `RaceRecordAddr` authorizes implicitly. Its
   * reverts (`QuotaFull`, `EventNotOpen`, `CategoryNotFound`, …)
   * propagate out of this call untouched — see the error-code note above.
   * 3. Pay `price_usdc` straight from the runner to the organiser. **A free
   * category (`price_usdc == 0`) skips the transfer entirely**, so a free
   * entry never needs the runner to hold the token — or, for a classic
   * `G...` account, to carry a trustline for it at all.
   * 4. Mint the non-transferable record and store its [`RecordData`].
   */
  enter: ({runner, event_id, category_id, participant_hash}: {runner: string, event_id: u32, category_id: u32, participant_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a symbol transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Collection symbol.
   */
  symbol: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a verify transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Checks a record against a recomputed `participant_hash`. Given the
   * off-chain PII plus the salt, anyone — insurer, medical desk, another
   * organiser — can prove the record belongs to that person.
   * 
   * "Hash **and owner** match", per `docs/SYSTEM_DESIGN.md` 3.2: `true` needs
   * the record to exist, its stored hash to equal the argument, *and* the
   * token to still be owned by somebody. The two halves cannot come apart
   * through the exported surface — `enter` mints and writes the record in one
   * invocation, and nothing burns — but the check is spelled out so the
   * shipped behaviour is literally the documented claim rather than a
   * consequence of it.
   * 
   * Never panics: an unknown `token_id` is simply `false`, because this is a
   * public, wallet-less read that verifiers call speculatively.
   */
  verify: ({token_id, participant_hash}: {token_id: u32, participant_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  balance: ({owner}: {owner: string}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a owner_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The runner this record is bound to. There is no exported path that ever
   * changes it.
   */
  owner_of: ({token_id}: {token_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a get_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_token: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a record_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  record_of: ({token_id}: {token_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<RecordData>>>

  /**
   * Construct and simulate a token_uri transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  token_uri: ({token_id}: {token_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a record_dnf transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Marks a no-show or a did-not-finish. Organiser only.
   * 
   * Legal from [`RecordState::Entered`] (never showed up) and from
   * [`RecordState::RacepackClaimed`] (started, did not finish). Terminal
   * states reject it with [`Error::InvalidState`].
   */
  record_dnf: ({token_id}: {token_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a records_of transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Every record `runner` owns, via the OpenZeppelin `Enumerable` per-owner
   * index. Bounded by the runner's balance, which only `enter` can grow.
   */
  records_of: ({runner}: {runner: string}, options?: MethodOptions) => Promise<AssembledTransaction<Array<u32>>>

  /**
   * Construct and simulate a get_registry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_registry: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a total_supply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_supply: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a record_finish transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Publishes a finish time. Organiser only.
   * 
   * Requires [`RecordState::RacepackClaimed`]: a runner who never collected
   * a race pack cannot receive a result, and [`RecordState::Finished`] is
   * terminal so a published time can never be rewritten.
   */
  record_finish: ({token_id, finish_time_s}: {token_id: u32, finish_time_s: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a claim_racepack transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Race-day check-in. `operator` must be the event organiser or one of its
   * allowlisted scanner devices.
   * 
   * **The anti-double-racepack guard lives here**: the state must be exactly
   * [`RecordState::Entered`]. A second scan — from the same desk or from a
   * second offline desk whose queue drains later — finds
   * [`RecordState::RacepackClaimed`] and reverts with
   * [`Error::AlreadyClaimed`]. The chain, not volunteer discipline, is what
   * makes "one pack per entry" true.
   */
  claim_racepack: ({token_id, operator}: {token_id: u32, operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a extend_record_ttl transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * **Permissionless** rent top-up for one record — no `require_auth` at
   * all. A runner's history has to outlive the event by years, so anyone
   * (the runner, the organiser, a Sterun keeper cron, a stranger) may pay to
   * keep it out of archival. The caller pays the fee; the entry's contents
   * cannot be changed this way.
   */
  extend_record_ttl: ({token_id}: {token_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, registry, token, name, symbol, base_uri}: {admin: string, registry: string, token: string, name: string, symbol: string, base_uri: string},
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
    return ContractClient.deploy({admin, registry, token, name, symbol, base_uri}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABgAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAGQAAAAAAAAADlJlY29yZE5vdEZvdW5kAAAAAABlAAAAY2BjbGFpbV9yYWNlcGFja2Agd2hlbiB0aGUgc3RhdGUgaXMgbm90IFtgUmVjb3JkU3RhdGU6OkVudGVyZWRgXSDigJQgdGhlCmFudGktZG91YmxlLXJhY2VwYWNrIGd1YXJkLgAAAAAOQWxyZWFkeUNsYWltZWQAAAAAAGYAAAB3YHJlY29yZF9maW5pc2hgIHdoZW4gdGhlIHN0YXRlIGlzIG5vdCBbYFJlY29yZFN0YXRlOjpSYWNlcGFja0NsYWltZWRgXSwKb3IgYW55IGF0dGVtcHQgdG8gbW92ZSBvdXQgb2YgYSB0ZXJtaW5hbCBzdGF0ZS4AAAAADEludmFsaWRTdGF0ZQAAAGcAAABHVGhlIG9wZXJhdG9yIGlzIG5laXRoZXIgdGhlIGV2ZW50IG9yZ2FuaXNlciBub3IgYW4gYWxsb3dsaXN0ZWQgc2Nhbm5lci4AAAAADU5vdEF1dGhvcml6ZWQAAAAAAABoAAAAFWBmaW5pc2hfdGltZV9zID09IDBgLgAAAAAAABFJbnZhbGlkRmluaXNoVGltZQAAAAAAAGk=",
        "AAAAAAAAAEtDb2xsZWN0aW9uIG5hbWUsIGZyb20gdGhlIE9wZW5aZXBwZWxpbiBtZXRhZGF0YSB3cml0dGVuIGJ5IHRoZQpjb25zdHJ1Y3Rvci4AAAAABG5hbWUAAAAAAAAAAQAAABA=",
        "AAAAAAAAA+9SZWdpc3RlcnMgYHJ1bm5lcmAgZm9yIGEgY2F0ZWdvcnkgYW5kIG1pbnRzIHRoZWlyIHJlY29yZC4gKipPbmUKaW52b2NhdGlvbiwgb25lIGF0b21pY2l0eSBib3VuZGFyeSoqOiB0aGUgcXVvdGEgcmVzZXJ2YXRpb24sIHRoZSBlbnRyeQpmZWUgYW5kIHRoZSBtaW50IGVpdGhlciBhbGwgbGFuZCBvciBhbGwgcm9sbCBiYWNrLCBzbyBhIGZhaWxlZCBwYXltZW50CmNhbiBuZXZlciBsZWF2ZSBhIHNsb3QgY29uc3VtZWQgb3IgYSByZWNvcmQgd2l0aG91dCBhIGZlZS4KClN0ZXBzLCBpbiBvcmRlcjoKMS4gYHJ1bm5lci5yZXF1aXJlX2F1dGgoKWAg4oCUIHRoZSBydW5uZXIgc2lnbnMgb25lIGF1dGggdHJlZSB0aGF0IGFsc28KY292ZXJzIHRoZSBuZXN0ZWQgU0VQLTQxIGB0cmFuc2ZlcmAgc3ViLWludm9jYXRpb24uCjIuIGByZXNlcnZlX3Nsb3RgIG9uIHRoZSByZWdpc3RyeS4gUmFjZVJlY29yZCBpcyB0aGUgZGlyZWN0IGNhbGxlciwgc28KdGhlIHJlZ2lzdHJ5J3Mgc3RvcmVkIGBSYWNlUmVjb3JkQWRkcmAgYXV0aG9yaXplcyBpbXBsaWNpdGx5LiBJdHMKcmV2ZXJ0cyAoYFF1b3RhRnVsbGAsIGBFdmVudE5vdE9wZW5gLCBgQ2F0ZWdvcnlOb3RGb3VuZGAsIOKApikKcHJvcGFnYXRlIG91dCBvZiB0aGlzIGNhbGwgdW50b3VjaGVkIOKAlCBzZWUgdGhlIGVycm9yLWNvZGUgbm90ZSBhYm92ZS4KMy4gUGF5IGBwcmljZV91c2RjYCBzdHJhaWdodCBmcm9tIHRoZSBydW5uZXIgdG8gdGhlIG9yZ2FuaXNlci4gKipBIGZyZWUKY2F0ZWdvcnkgKGBwcmljZV91c2RjID09IDBgKSBza2lwcyB0aGUgdHJhbnNmZXIgZW50aXJlbHkqKiwgc28gYSBmcmVlCmVudHJ5IG5ldmVyIG5lZWRzIHRoZSBydW5uZXIgdG8gaG9sZCB0aGUgdG9rZW4g4oCUIG9yLCBmb3IgYSBjbGFzc2ljCmBHLi4uYCBhY2NvdW50LCB0byBjYXJyeSBhIHRydXN0bGluZSBmb3IgaXQgYXQgYWxsLgo0LiBNaW50IHRoZSBub24tdHJhbnNmZXJhYmxlIHJlY29yZCBhbmQgc3RvcmUgaXRzIFtgUmVjb3JkRGF0YWBdLgAAAAAFZW50ZXIAAAAAAAAEAAAAAAAAAAZydW5uZXIAAAAAABMAAAAAAAAACGV2ZW50X2lkAAAABAAAAAAAAAALY2F0ZWdvcnlfaWQAAAAABAAAAAAAAAAQcGFydGljaXBhbnRfaGFzaAAAA+4AAAAgAAAAAQAAA+kAAAAEAAAAAw==",
        "AAAAAAAAABJDb2xsZWN0aW9uIHN5bWJvbC4AAAAAAAZzeW1ib2wAAAAAAAAAAAABAAAAEA==",
        "AAAAAAAAAwhDaGVja3MgYSByZWNvcmQgYWdhaW5zdCBhIHJlY29tcHV0ZWQgYHBhcnRpY2lwYW50X2hhc2hgLiBHaXZlbiB0aGUKb2ZmLWNoYWluIFBJSSBwbHVzIHRoZSBzYWx0LCBhbnlvbmUg4oCUIGluc3VyZXIsIG1lZGljYWwgZGVzaywgYW5vdGhlcgpvcmdhbmlzZXIg4oCUIGNhbiBwcm92ZSB0aGUgcmVjb3JkIGJlbG9uZ3MgdG8gdGhhdCBwZXJzb24uCgoiSGFzaCAqKmFuZCBvd25lcioqIG1hdGNoIiwgcGVyIGBkb2NzL1NZU1RFTV9ERVNJR04ubWRgIDMuMjogYHRydWVgIG5lZWRzCnRoZSByZWNvcmQgdG8gZXhpc3QsIGl0cyBzdG9yZWQgaGFzaCB0byBlcXVhbCB0aGUgYXJndW1lbnQsICphbmQqIHRoZQp0b2tlbiB0byBzdGlsbCBiZSBvd25lZCBieSBzb21lYm9keS4gVGhlIHR3byBoYWx2ZXMgY2Fubm90IGNvbWUgYXBhcnQKdGhyb3VnaCB0aGUgZXhwb3J0ZWQgc3VyZmFjZSDigJQgYGVudGVyYCBtaW50cyBhbmQgd3JpdGVzIHRoZSByZWNvcmQgaW4gb25lCmludm9jYXRpb24sIGFuZCBub3RoaW5nIGJ1cm5zIOKAlCBidXQgdGhlIGNoZWNrIGlzIHNwZWxsZWQgb3V0IHNvIHRoZQpzaGlwcGVkIGJlaGF2aW91ciBpcyBsaXRlcmFsbHkgdGhlIGRvY3VtZW50ZWQgY2xhaW0gcmF0aGVyIHRoYW4gYQpjb25zZXF1ZW5jZSBvZiBpdC4KCk5ldmVyIHBhbmljczogYW4gdW5rbm93biBgdG9rZW5faWRgIGlzIHNpbXBseSBgZmFsc2VgLCBiZWNhdXNlIHRoaXMgaXMgYQpwdWJsaWMsIHdhbGxldC1sZXNzIHJlYWQgdGhhdCB2ZXJpZmllcnMgY2FsbCBzcGVjdWxhdGl2ZWx5LgAAAAZ2ZXJpZnkAAAAAAAIAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAQcGFydGljaXBhbnRfaGFzaAAAA+4AAAAgAAAAAQAAAAE=",
        "AAAABQAAAAAAAAAAAAAACVJlY29yZERuZgAAAAAAAAEAAAAKcmVjb3JkX2RuZgAAAAAAAgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAAAAAAAAIZXZlbnRfaWQAAAAEAAAAAQAAAAI=",
        "AAAAAQAAAKBUaGUgdmVyaWZpYWJsZSByZWNvcmQgaXRzZWxmLiBgcGFydGljaXBhbnRfaGFzaGAgaXMKYHNoYTI1NihuYW1lIHx8IG5hdGlvbmFsX2lkIHx8IGVtZXJnZW5jeV9jb250YWN0IHx8IHNhbHQpYCDigJQgYSBjb21taXRtZW50CnRvIG9mZi1jaGFpbiBQSUksIG5ldmVyIHRoZSBQSUkuAAAAAAAAAApSZWNvcmREYXRhAAAAAAAJAAAAQlRoZSBjYXRlZ29yeSBzZXF1ZW5jZSBoYW5kZWQgb3V0IGJ5IGBFdmVudFJlZ2lzdHJ5OjpyZXNlcnZlX3Nsb3RgLgAAAAAABmJpYl9ubwAAAAAABAAAAAAAAAALY2F0ZWdvcnlfaWQAAAAABAAAAAAAAAAKY2xhaW1lZF9hdAAAAAAD6AAAAAYAAAAAAAAACmVudGVyZWRfYXQAAAAAAAYAAAAAAAAACGV2ZW50X2lkAAAABAAAAAAAAAANZmluaXNoX3RpbWVfcwAAAAAAA+gAAAAEAAAAAAAAABBwYXJ0aWNpcGFudF9oYXNoAAAD7gAAACAAAAAAAAAACXJlc3VsdF9hdAAAAAAAA+gAAAAGAAAAAAAAAAVzdGF0ZQAAAAAAB9AAAAALUmVjb3JkU3RhdGUA",
        "AAAAAAAAAAAAAAAHYmFsYW5jZQAAAAABAAAAAAAAAAVvd25lcgAAAAAAABMAAAABAAAABA==",
        "AAAAAgAAAGlMaWZlY3ljbGUgb2Ygb25lIHJhY2UgcmVjb3JkLiBgRmluaXNoZWRgIGFuZCBgRG5mYCBhcmUgdGVybWluYWw6IHRoZXJlIGlzCm5vIGV4cG9ydGVkIHBhdGggb3V0IG9mIGVpdGhlci4AAAAAAAAAAAAAC1JlY29yZFN0YXRlAAAAAAQAAAAAAAAAAAAAAAdFbnRlcmVkAAAAAAAAAAAAAAAAD1JhY2VwYWNrQ2xhaW1lZAAAAAAAAAAAAAAAAAhGaW5pc2hlZAAAAAAAAAAAAAAAA0RuZgA=",
        "AAAAAAAAAFNUaGUgcnVubmVyIHRoaXMgcmVjb3JkIGlzIGJvdW5kIHRvLiBUaGVyZSBpcyBubyBleHBvcnRlZCBwYXRoIHRoYXQgZXZlcgpjaGFuZ2VzIGl0LgAAAAAIb3duZXJfb2YAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAEw==",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAAAAAAAJZ2V0X3Rva2VuAAAAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAAAAAAAJcmVjb3JkX29mAAAAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAA+kAAAfQAAAAClJlY29yZERhdGEAAAAAAAM=",
        "AAAAAAAAAAAAAAAJdG9rZW5fdXJpAAAAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAABA=",
        "AAAAAAAAAOhNYXJrcyBhIG5vLXNob3cgb3IgYSBkaWQtbm90LWZpbmlzaC4gT3JnYW5pc2VyIG9ubHkuCgpMZWdhbCBmcm9tIFtgUmVjb3JkU3RhdGU6OkVudGVyZWRgXSAobmV2ZXIgc2hvd2VkIHVwKSBhbmQgZnJvbQpbYFJlY29yZFN0YXRlOjpSYWNlcGFja0NsYWltZWRgXSAoc3RhcnRlZCwgZGlkIG5vdCBmaW5pc2gpLiBUZXJtaW5hbApzdGF0ZXMgcmVqZWN0IGl0IHdpdGggW2BFcnJvcjo6SW52YWxpZFN0YXRlYF0uAAAACnJlY29yZF9kbmYAAAAAAAEAAAAAAAAACHRva2VuX2lkAAAABAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAIxFdmVyeSByZWNvcmQgYHJ1bm5lcmAgb3ducywgdmlhIHRoZSBPcGVuWmVwcGVsaW4gYEVudW1lcmFibGVgIHBlci1vd25lcgppbmRleC4gQm91bmRlZCBieSB0aGUgcnVubmVyJ3MgYmFsYW5jZSwgd2hpY2ggb25seSBgZW50ZXJgIGNhbiBncm93LgAAAApyZWNvcmRzX29mAAAAAAABAAAAAAAAAAZydW5uZXIAAAAAABMAAAABAAAD6gAAAAQ=",
        "AAAABQAAAAAAAAAAAAAADVJlY29yZEVudGVyZWQAAAAAAAABAAAADnJlY29yZF9lbnRlcmVkAAAAAAAEAAAAAAAAAAZydW5uZXIAAAAAABMAAAABAAAAAAAAAAhldmVudF9pZAAAAAQAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAAAAAAAZiaWJfbm8AAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADlJlY29yZEZpbmlzaGVkAAAAAAABAAAAD3JlY29yZF9maW5pc2hlZAAAAAADAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAAAAAAAhldmVudF9pZAAAAAQAAAABAAAAAAAAAA1maW5pc2hfdGltZV9zAAAAAAAABAAAAAAAAAAC",
        "AAAAAAAAAAAAAAAMZ2V0X3JlZ2lzdHJ5AAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAAAAAAAMdG90YWxfc3VwcGx5AAAAAAAAAAEAAAAE",
        "AAAABQAAAAAAAAAAAAAAD1JhY2VwYWNrQ2xhaW1lZAAAAAABAAAAEHJhY2VwYWNrX2NsYWltZWQAAAADAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAAAAAAAAhldmVudF9pZAAAAAQAAAABAAAAAAAAAAhvcGVyYXRvcgAAABMAAAAAAAAAAg==",
        "AAAAAAAAARJSdW5zIG9uY2UgYXQgZGVwbG95IHRpbWUuIFN0b3JlcyB0aGUgd2lyaW5nIChhZG1pbiwgRXZlbnRSZWdpc3RyeSwgdGhlClNFUC00MSBlbnRyeS1mZWUgdG9rZW4pIGFuZCB0aGUgT3BlblplcHBlbGluIGNvbGxlY3Rpb24gbWV0YWRhdGEuCgpgdG9rZW5gIGlzIGEgcGFyYW1ldGVyLCBub3QgYSBjb25zdGFudDogdGVzdG5ldCBkZXBsb3lzIHBvaW50IGF0IHRoZQpTdGVydW4gc1VTRCBTQUMsIG1haW5uZXQgYXQgQ2lyY2xlJ3MgVVNEQyBTQUMsIHdpdGggbm8gY29kZSBjaGFuZ2UuAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAYAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAIcmVnaXN0cnkAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAZzeW1ib2wAAAAAABAAAAAAAAAACGJhc2VfdXJpAAAAEAAAAAA=",
        "AAAAAAAAAOxQdWJsaXNoZXMgYSBmaW5pc2ggdGltZS4gT3JnYW5pc2VyIG9ubHkuCgpSZXF1aXJlcyBbYFJlY29yZFN0YXRlOjpSYWNlcGFja0NsYWltZWRgXTogYSBydW5uZXIgd2hvIG5ldmVyIGNvbGxlY3RlZAphIHJhY2UgcGFjayBjYW5ub3QgcmVjZWl2ZSBhIHJlc3VsdCwgYW5kIFtgUmVjb3JkU3RhdGU6OkZpbmlzaGVkYF0gaXMKdGVybWluYWwgc28gYSBwdWJsaXNoZWQgdGltZSBjYW4gbmV2ZXIgYmUgcmV3cml0dGVuLgAAAA1yZWNvcmRfZmluaXNoAAAAAAAAAgAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAAAAAA1maW5pc2hfdGltZV9zAAAAAAAABAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAclSYWNlLWRheSBjaGVjay1pbi4gYG9wZXJhdG9yYCBtdXN0IGJlIHRoZSBldmVudCBvcmdhbmlzZXIgb3Igb25lIG9mIGl0cwphbGxvd2xpc3RlZCBzY2FubmVyIGRldmljZXMuCgoqKlRoZSBhbnRpLWRvdWJsZS1yYWNlcGFjayBndWFyZCBsaXZlcyBoZXJlKio6IHRoZSBzdGF0ZSBtdXN0IGJlIGV4YWN0bHkKW2BSZWNvcmRTdGF0ZTo6RW50ZXJlZGBdLiBBIHNlY29uZCBzY2FuIOKAlCBmcm9tIHRoZSBzYW1lIGRlc2sgb3IgZnJvbSBhCnNlY29uZCBvZmZsaW5lIGRlc2sgd2hvc2UgcXVldWUgZHJhaW5zIGxhdGVyIOKAlCBmaW5kcwpbYFJlY29yZFN0YXRlOjpSYWNlcGFja0NsYWltZWRgXSBhbmQgcmV2ZXJ0cyB3aXRoCltgRXJyb3I6OkFscmVhZHlDbGFpbWVkYF0uIFRoZSBjaGFpbiwgbm90IHZvbHVudGVlciBkaXNjaXBsaW5lLCBpcyB3aGF0Cm1ha2VzICJvbmUgcGFjayBwZXIgZW50cnkiIHRydWUuAAAAAAAADmNsYWltX3JhY2VwYWNrAAAAAAACAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAACG9wZXJhdG9yAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAATcqKlBlcm1pc3Npb25sZXNzKiogcmVudCB0b3AtdXAgZm9yIG9uZSByZWNvcmQg4oCUIG5vIGByZXF1aXJlX2F1dGhgIGF0CmFsbC4gQSBydW5uZXIncyBoaXN0b3J5IGhhcyB0byBvdXRsaXZlIHRoZSBldmVudCBieSB5ZWFycywgc28gYW55b25lCih0aGUgcnVubmVyLCB0aGUgb3JnYW5pc2VyLCBhIFN0ZXJ1biBrZWVwZXIgY3JvbiwgYSBzdHJhbmdlcikgbWF5IHBheSB0bwprZWVwIGl0IG91dCBvZiBhcmNoaXZhbC4gVGhlIGNhbGxlciBwYXlzIHRoZSBmZWU7IHRoZSBlbnRyeSdzIGNvbnRlbnRzCmNhbm5vdCBiZSBjaGFuZ2VkIHRoaXMgd2F5LgAAAAARZXh0ZW5kX3JlY29yZF90dGwAAAAAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAABAAAD6QAAAAIAAAAD",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSB0b2tlbiBpcyBtaW50ZWQuAAAAAAAAAAAAAARNaW50AAAAAQAAAARtaW50AAAAAgAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAAAg==",
        "AAAABAAAAAAAAAAAAAAAFU5vbkZ1bmdpYmxlVG9rZW5FcnJvcgAAAAAAAA8AAAAkSW5kaWNhdGVzIGEgbm9uLWV4aXN0ZW50IGB0b2tlbl9pZGAuAAAAEE5vbkV4aXN0ZW50VG9rZW4AAADIAAAAV0luZGljYXRlcyBhbiBlcnJvciByZWxhdGVkIHRvIHRoZSBvd25lcnNoaXAgb3ZlciBhIHBhcnRpY3VsYXIgdG9rZW4uClVzZWQgaW4gdHJhbnNmZXJzLgAAAAAOSW5jb3JyZWN0T3duZXIAAAAAAMkAAABFSW5kaWNhdGVzIGEgZmFpbHVyZSB3aXRoIHRoZSBgb3BlcmF0b3JgcyBhcHByb3ZhbC4gVXNlZCBpbiB0cmFuc2ZlcnMuAAAAAAAAFEluc3VmZmljaWVudEFwcHJvdmFsAAAAygAAAFVJbmRpY2F0ZXMgYSBmYWlsdXJlIHdpdGggdGhlIGBhcHByb3ZlcmAgb2YgYSB0b2tlbiB0byBiZSBhcHByb3ZlZC4gVXNlZAppbiBhcHByb3ZhbHMuAAAAAAAAD0ludmFsaWRBcHByb3ZlcgAAAADLAAAASkluZGljYXRlcyBhbiBpbnZhbGlkIHZhbHVlIGZvciBgbGl2ZV91bnRpbF9sZWRnZXJgIHdoZW4gc2V0dGluZwphcHByb3ZhbHMuAAAAAAAWSW52YWxpZExpdmVVbnRpbExlZGdlcgAAAAAAzAAAAClJbmRpY2F0ZXMgb3ZlcmZsb3cgd2hlbiBhZGRpbmcgdHdvIHZhbHVlcwAAAAAAAAxNYXRoT3ZlcmZsb3cAAADNAAAANkluZGljYXRlcyBhbGwgcG9zc2libGUgYHRva2VuX2lkYHMgYXJlIGFscmVhZHkgaW4gdXNlLgAAAAAAE1Rva2VuSURzQXJlRGVwbGV0ZWQAAAAAzgAAAEVJbmRpY2F0ZXMgYW4gaW52YWxpZCBhbW91bnQgdG8gYmF0Y2ggbWludCBpbiBgY29uc2VjdXRpdmVgIGV4dGVuc2lvbi4AAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAM8AAAAzSW5kaWNhdGVzIHRoZSB0b2tlbiBkb2VzIG5vdCBleGlzdCBpbiBvd25lcidzIGxpc3QuAAAAABhUb2tlbk5vdEZvdW5kSW5Pd25lckxpc3QAAADQAAAAMkluZGljYXRlcyB0aGUgdG9rZW4gZG9lcyBub3QgZXhpc3QgaW4gZ2xvYmFsIGxpc3QuAAAAAAAZVG9rZW5Ob3RGb3VuZEluR2xvYmFsTGlzdAAAAAAAANEAAAAjSW5kaWNhdGVzIGFjY2VzcyB0byB1bnNldCBtZXRhZGF0YS4AAAAADVVuc2V0TWV0YWRhdGEAAAAAAADSAAAAQUluZGljYXRlcyB0aGUgbGVuZ3RoIG9mIHRoZSBiYXNlIFVSSSBleGNlZWRzIHRoZSBtYXhpbXVtIGFsbG93ZWQuAAAAAAAAFUJhc2VVcmlNYXhMZW5FeGNlZWRlZAAAAAAAANMAAABHSW5kaWNhdGVzIHRoZSByb3lhbHR5IGFtb3VudCBpcyBoaWdoZXIgdGhhbiAxMF8wMDAgKDEwMCUpIGJhc2lzIHBvaW50cy4AAAAAFEludmFsaWRSb3lhbHR5QW1vdW50AAAA1AAAAD1JbmRpY2F0ZXMgdGhlIGxlbmd0aCBvZiB0aGUgbmFtZSBleGNlZWRzIHRoZSBtYXhpbXVtIGFsbG93ZWQuAAAAAAAAEk5hbWVNYXhMZW5FeGNlZWRlZAAAAAAA1QAAAD9JbmRpY2F0ZXMgdGhlIGxlbmd0aCBvZiB0aGUgc3ltYm9sIGV4Y2VlZHMgdGhlIG1heGltdW0gYWxsb3dlZC4AAAAAFFN5bWJvbE1heExlbkV4Y2VlZGVkAAAA1g==" ]),
      options
    )
  }
  public readonly fromJSON = {
    name: this.txFromJSON<string>,
        enter: this.txFromJSON<Result<u32>>,
        symbol: this.txFromJSON<string>,
        verify: this.txFromJSON<boolean>,
        balance: this.txFromJSON<u32>,
        owner_of: this.txFromJSON<string>,
        get_admin: this.txFromJSON<Result<string>>,
        get_token: this.txFromJSON<Result<string>>,
        record_of: this.txFromJSON<Result<RecordData>>,
        token_uri: this.txFromJSON<string>,
        record_dnf: this.txFromJSON<Result<void>>,
        records_of: this.txFromJSON<Array<u32>>,
        get_registry: this.txFromJSON<Result<string>>,
        total_supply: this.txFromJSON<u32>,
        record_finish: this.txFromJSON<Result<void>>,
        claim_racepack: this.txFromJSON<Result<void>>,
        extend_record_ttl: this.txFromJSON<Result<void>>
  }
}