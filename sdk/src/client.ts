/**
 * STE-15 (C5) — `SterunClient`: the whole Sterun flow, callable from
 * TypeScript, with no Rust and no hand-written contract signatures.
 *
 * This is the D2 promise and the seam every D3 client goes through
 * (docs/SYSTEM_DESIGN.md §2, "clients never talk to contracts raw"): the
 * organiser console, the entry flow, the scanner PWA and the public profile all
 * call these methods, so the contract surface is learned once, here.
 *
 * ## One facade over two contracts
 *
 * Sterun is two contracts — EventRegistry holds events, categories, quotas and
 * the scanner allowlist; RaceRecord holds the records and their lifecycle — but
 * a caller does not think in those terms. They think "create an event", "enter
 * this race", "check this runner in". A single facade over two generated
 * clients keeps the two shapes in one place instead of scattering the question
 * "which contract was that on again?" across four applications.
 *
 * ## Reads need no wallet
 *
 * Every view method here is a simulation, so `verify`, `recordsOf`, `recordOf`
 * and `getEvent` work with nothing connected: no wallet, no funded account, no
 * signature. That is what lets a public profile page be public.
 *
 * ## Signing is injected, not implemented
 *
 * `signTransaction` accepts anything `@stellar/stellar-sdk` accepts: a
 * `Keypair` (Node scripts, tests, the keeper), a `KeypairSigner`, a `Signer`,
 * or a SEP-43 wallet's own `signTransaction` — which is exactly what Stellar
 * Wallets Kit returns in the browser. No adapter interface of our own, because
 * the SDK already standardised the one the wallets implement, and inventing a
 * second one would just be a layer to keep in sync.
 *
 * ## Addresses are arguments, never constants
 *
 * The contract ids come from the caller. `docs/deployments.md` is the record of
 * what is live (and `be/src/deployments.ts` parses it), but a published SDK
 * cannot read a file in this repo, and a redeploy must not require a release.
 * Same rule as the backend's: no hardcoded address, anywhere, ever.
 */
import { Client as EventRegistryClient } from "../vendor-dist/event-registry.js";
import { Client as RaceRecordClient } from "../vendor-dist/race-record.js";
import type { ClientOptions as BindingClientOptions } from "@stellar/stellar-sdk/contract";
import { runRead, runWrite, type SentResult } from "./tx.js";
import { buildRaceRecordDocument, type RecordProvenance } from "./document.js";
import type { RaceRecordDocument } from "./schema.js";
import {
  fromEventStatus,
  fromHex32,
  toSterunCategory,
  toSterunEvent,
  toSterunRecord,
  type EventStatus,
  type SterunCategory,
  type SterunEvent,
  type SterunRecord,
} from "./types.js";

/** Anything the SDK accepts as a signer. A `Keypair` and a wallet both fit. */
export type SterunSigner = NonNullable<BindingClientOptions["signTransaction"]>;

export interface SterunContracts {
  /** EventRegistry (C1) contract id, `C…`. */
  eventRegistry: string;
  /** RaceRecord (C2) contract id, `C…`. */
  raceRecord: string;
}

export interface SterunClientOptions {
  rpcUrl: string;
  networkPassphrase: string;
  contracts: SterunContracts;
  /**
   * The address transactions are built for. Required for anything that writes;
   * omit it for a read-only client, since a simulation needs no real account.
   */
  publicKey?: string;
  /** Default signer. Can also be passed per call, which overrides this one. */
  signTransaction?: SterunSigner;
  /** How long to keep polling for the transaction to land. SDK default is 300. */
  timeoutInSeconds?: number;
  /** Only for a local RPC served over plain HTTP. */
  allowHttp?: boolean;
  /**
   * The two generated clients, supplied instead of constructed.
   *
   * This is the network seam, and it exists for the same reason
   * `ContractCaller` exists in be/src/chain/reader.ts: the interesting
   * behaviour of this class is which contract method it calls and with which
   * arguments, and that is worth asserting without a testnet in the loop. Tests
   * pass fakes here; nothing in production does.
   */
  bindings?: { registry: EventRegistryClient; record: RaceRecordClient };
}

/** Arguments for a new event. `metadataHash` commits to the document at `uri`. */
export interface CreateEventArgs {
  organiser: string;
  name: string;
  /** sha256 of the off-chain metadata document, 64 hex characters. */
  metadataHash: string;
  uri: string;
  /** Unix seconds the race starts. */
  startsAt: bigint | number;
}

export interface AddCategoryArgs {
  eventId: number;
  /** Soroban `Symbol`: letters, digits and `_`, e.g. `10K`. */
  code: string;
  distanceM: number;
  quota: number;
  /** Entry fee in stroops (7 decimals). `0n` makes the category free. */
  priceStroops: bigint;
}

export interface EnterArgs {
  runner: string;
  eventId: number;
  categoryId: number;
  /** `sha256(name || national_id || emergency_contact || salt)`, 64 hex chars. */
  participantHash: string;
}

/**
 * Who a single call acts as.
 *
 * One Sterun flow involves several different signers, often within seconds of
 * each other: the organiser opens the event, the runner pays and enters, an
 * allowlisted scanner device checks them in, the organiser publishes the
 * result. Rebuilding a client per actor would mean four RPC clients and four
 * places to keep the network config in step, so the actor is a per-call
 * argument instead.
 *
 * `publicKey` is not decoration next to `signTransaction`: it is the source
 * account the transaction is built and simulated for, and the simulation is
 * what records the auth entries. Simulate as the wrong address and the auth
 * tree comes back for that address, so the right signature will not satisfy it.
 */
export interface CallOptions {
  /** Source account for this call. Defaults to the client's `publicKey`. */
  publicKey?: string;
  /** Signer for this call. Defaults to the client's `signTransaction`. */
  signTransaction?: SterunSigner;
}

export class SterunClient {
  private readonly registry: EventRegistryClient;
  private readonly record: RaceRecordClient;
  readonly contracts: SterunContracts;

  constructor(private readonly options: SterunClientOptions) {
    this.contracts = options.contracts;
    const shared = {
      rpcUrl: options.rpcUrl,
      networkPassphrase: options.networkPassphrase,
      ...(options.publicKey === undefined ? {} : { publicKey: options.publicKey }),
      ...(options.signTransaction === undefined
        ? {}
        : { signTransaction: options.signTransaction }),
      ...(options.timeoutInSeconds === undefined
        ? {}
        : { timeoutInSeconds: options.timeoutInSeconds }),
      ...(options.allowHttp === undefined ? {} : { allowHttp: options.allowHttp }),
    };

    this.registry =
      options.bindings?.registry ??
      new EventRegistryClient({ ...shared, contractId: options.contracts.eventRegistry });
    this.record =
      options.bindings?.record ??
      new RaceRecordClient({ ...shared, contractId: options.contracts.raceRecord });
  }

  /** A read-only twin of this client — useful to prove a path needs no wallet. */
  readOnly(): SterunClient {
    const { signTransaction: _signTransaction, publicKey: _publicKey, ...rest } = this.options;
    return new SterunClient(rest);
  }

  /**
   * The actor arguments for a local `Keypair`, ready to spread into any call.
   *
   * ```ts
   * await sterun.enter(args, SterunClient.as(runnerKeypair));
   * ```
   *
   * Node-side convenience only. A browser passes the wallet's own address and
   * `signTransaction` instead, which is the same two fields by hand.
   */
  static as(keypair: { publicKey(): string }): CallOptions {
    return {
      publicKey: keypair.publicKey(),
      signTransaction: keypair as unknown as SterunSigner,
    };
  }

  /**
   * Per-call `MethodOptions` for the generated clients.
   *
   * Both fields matter and for different reasons. `signTransaction` is who
   * signs; `publicKey` is the source account the transaction is *built and
   * simulated* for, which decides the auth entries the simulation records. Get
   * the second one wrong and the call is simulated as somebody else — the auth
   * tree comes back for the wrong address and the signature will not satisfy
   * it.
   */
  private callOptions(options: CallOptions = {}): {
    publicKey?: string;
    signTransaction?: SterunSigner;
  } {
    const publicKey = options.publicKey ?? this.options.publicKey;
    const signTransaction = options.signTransaction ?? this.options.signTransaction;
    return {
      ...(publicKey === undefined ? {} : { publicKey }),
      ...(signTransaction === undefined ? {} : { signTransaction }),
    };
  }

  // ---------------------------------------------------------------------------
  // EventRegistry (C1) — organiser side
  // ---------------------------------------------------------------------------

  /**
   * Create an event. The `organiser` address authorizes, and becomes the only
   * address that can change this event or record its results.
   *
   * Events start in `Draft`: nobody can enter until `setEventStatus(…, "Open")`.
   */
  async createEvent(args: CreateEventArgs, options?: CallOptions): Promise<SentResult<number>> {
    return runWrite(
      "createEvent",
      () =>
        this.registry.create_event(
          {
            organiser: args.organiser,
            name: args.name,
            metadata_hash: fromHex32(args.metadataHash, "metadataHash"),
            uri: args.uri,
            starts_at: BigInt(args.startsAt),
          },
          this.callOptions(options),
        ),
    );
  }

  /**
   * Add a distance category. Reverts `InvalidQuota(8)` on a zero quota,
   * `InvalidPrice(9)` on a negative price, `InvalidDistance(10)` on zero metres.
   */
  async addCategory(args: AddCategoryArgs, options?: CallOptions): Promise<SentResult<number>> {
    return runWrite(
      "addCategory",
      () =>
        this.registry.add_category(
          {
            event_id: args.eventId,
            code: args.code,
            distance_m: args.distanceM,
            quota: args.quota,
            price_usdc: args.priceStroops,
          },
          this.callOptions(options),
        ),
    );
  }

  /**
   * Move the event through its lifecycle. Illegal transitions — including one
   * to the status it already has — revert `InvalidStatus(11)`.
   */
  async setEventStatus(
    eventId: number,
    status: EventStatus,
    options?: CallOptions,
  ): Promise<SentResult<void>> {
    return runWrite(
      "setEventStatus",
      () =>
        this.registry.set_event_status(
          { event_id: eventId, status: fromEventStatus(status) },
          this.callOptions(options),
        ),
    );
  }

  /** Allowlist a volunteer device so it may call `claimRacepack` for this event. */
  async addScanner(
    eventId: number,
    scanner: string,
    options?: CallOptions,
  ): Promise<SentResult<void>> {
    return runWrite(
      "addScanner",
      () => this.registry.add_scanner({ event_id: eventId, scanner }, this.callOptions(options)),
    );
  }

  async removeScanner(
    eventId: number,
    scanner: string,
    options?: CallOptions,
  ): Promise<SentResult<void>> {
    return runWrite(
      "removeScanner",
      () => this.registry.remove_scanner({ event_id: eventId, scanner }, this.callOptions(options)),
    );
  }

  // ---------------------------------------------------------------------------
  // EventRegistry (C1) — views
  // ---------------------------------------------------------------------------

  async getEvent(eventId: number): Promise<SterunEvent> {
    const data = await runRead("getEvent", () => this.registry.get_event({ event_id: eventId }));
    return toSterunEvent(eventId, data);
  }

  /**
   * One category.
   *
   * A note that will otherwise cost somebody an afternoon: asking for a
   * category of an event that does not exist reverts `CategoryNotFound(3)`, not
   * `EventNotFound(2)` — the contract reads the composite key directly without
   * checking the event first (INTERFACE.md §1.1). Use {@link getEvent} to tell
   * "no such event" from "no such category".
   */
  async getCategory(eventId: number, categoryId: number): Promise<SterunCategory> {
    const data = await runRead("getCategory", () =>
      this.registry.get_category({ event_id: eventId, category_id: categoryId }),
    );
    return toSterunCategory(eventId, categoryId, data);
  }

  /** Every category of an event, in id order. */
  async listCategories(eventId: number): Promise<SterunCategory[]> {
    const count = await this.categoryCount(eventId);
    const categories: SterunCategory[] = [];
    for (let id = 0; id < count; id += 1) categories.push(await this.getCategory(eventId, id));
    return categories;
  }

  async getOrganiser(eventId: number): Promise<string> {
    return runRead("getOrganiser", () => this.registry.get_organiser({ event_id: eventId }));
  }

  /** Never reverts: `false` for an unknown event or an address never added. */
  async isScanner(eventId: number, address: string): Promise<boolean> {
    return runRead("isScanner", () => this.registry.is_scanner({ event_id: eventId, addr: address }));
  }

  /** Never reverts: `0` before any event exists. */
  async eventCount(): Promise<number> {
    return runRead("eventCount", () => this.registry.event_count());
  }

  /** Never reverts: `0` for an unknown event. */
  async categoryCount(eventId: number): Promise<number> {
    return runRead("categoryCount", () => this.registry.category_count({ event_id: eventId }));
  }

  // ---------------------------------------------------------------------------
  // RaceRecord (C2)
  // ---------------------------------------------------------------------------

  /**
   * Enter a race: reserve a slot, pay the entry fee, mint the record — as **one
   * transaction**.
   *
   * The runner signs a single auth tree that also covers the nested SEP-41
   * `transfer` sub-invocation, so the fee cannot be paid without the entry
   * being created and the entry cannot be created without the fee. A free
   * category (`priceStroops === 0n`) skips the token call entirely, which means
   * the runner needs neither a balance nor a trustline.
   *
   * Returns the new `token_id`.
   *
   * Reverts worth branching on, and note the band tells you which contract
   * produced them: `QuotaFull(5)`, `EventNotOpen(4)`, `CategoryNotFound(3)` all
   * come from EventRegistry propagating through `enter`, not from RaceRecord.
   */
  async enter(args: EnterArgs, options?: CallOptions): Promise<SentResult<number>> {
    return runWrite(
      "enter",
      () =>
        this.record.enter(
          {
            runner: args.runner,
            event_id: args.eventId,
            category_id: args.categoryId,
            participant_hash: fromHex32(args.participantHash, "participantHash"),
          },
          this.callOptions(options),
        ),
    );
  }

  /**
   * Race-day check-in. `operator` must be the event organiser or one of its
   * allowlisted scanners.
   *
   * This is the anti-double-racepack guard: the state must be exactly
   * `Entered`, so a second scan — same desk, or a second offline desk whose
   * queue drains later — reverts `AlreadyClaimed(102)`. The chain is the
   * arbiter; a scanner's local roster check is only a UX shortcut.
   */
  async claimRacepack(
    tokenId: number,
    operator: string,
    options?: CallOptions,
  ): Promise<SentResult<void>> {
    return runWrite(
      "claimRacepack",
      () => this.record.claim_racepack({ token_id: tokenId, operator }, this.callOptions(options)),
    );
  }

  /**
   * Publish a finish time. Organiser only, and only from `RacepackClaimed`: a
   * runner who never collected a race pack cannot receive a result
   * (`InvalidState(103)`). `Finished` is terminal, so a published time can
   * never be rewritten.
   */
  async recordFinish(
    tokenId: number,
    finishTimeS: number,
    options?: CallOptions,
  ): Promise<SentResult<void>> {
    return runWrite(
      "recordFinish",
      () =>
        this.record.record_finish(
          { token_id: tokenId, finish_time_s: finishTimeS },
          this.callOptions(options),
        ),
    );
  }

  /** Mark a no-show or a did-not-finish. Organiser only; terminal. */
  async recordDnf(tokenId: number, options?: CallOptions): Promise<SentResult<void>> {
    return runWrite(
      "recordDnf",
      () => this.record.record_dnf({ token_id: tokenId }, this.callOptions(options)),
    );
  }

  /**
   * Pay rent on one record so it does not archive. Permissionless — anyone may
   * call it for anyone's record, and the caller pays the fee — but it still
   * needs a signer, because somebody has to pay that fee.
   */
  async extendRecordTtl(tokenId: number, options?: CallOptions): Promise<SentResult<void>> {
    return runWrite(
      "extendRecordTtl",
      () => this.record.extend_record_ttl({ token_id: tokenId }, this.callOptions(options)),
    );
  }

  // ---------------------------------------------------------------------------
  // RaceRecord (C2) — views, all wallet-free
  // ---------------------------------------------------------------------------

  async recordOf(tokenId: number): Promise<SterunRecord> {
    const data = await runRead("recordOf", () => this.record.record_of({ token_id: tokenId }));
    return toSterunRecord(tokenId, data);
  }

  /** Every record a runner owns. Never reverts: `[]` for an address with none. */
  async recordsOf(runner: string): Promise<number[]> {
    return runRead("recordsOf", () => this.record.records_of({ runner }));
  }

  /** The records of a runner, fully resolved. */
  async recordsOfDetailed(runner: string): Promise<SterunRecord[]> {
    const ids = await this.recordsOf(runner);
    const records: SterunRecord[] = [];
    for (const id of ids) records.push(await this.recordOf(id));
    return records;
  }

  /**
   * Does this record commit to this person?
   *
   * `true` needs the record to exist, its stored hash to equal the argument,
   * and the token to still have an owner. Never reverts — an unknown token is
   * simply `false` — because verifiers call it speculatively and a public,
   * wallet-free check should not throw at strangers.
   */
  async verify(tokenId: number, participantHash: string): Promise<boolean> {
    return runRead("verify", () =>
      this.record.verify({
        token_id: tokenId,
        participant_hash: fromHex32(participantHash, "participantHash"),
      }),
    );
  }

  /** The runner a record is bound to. No exported path ever changes it. */
  async ownerOf(tokenId: number): Promise<string> {
    return runRead("ownerOf", () => this.record.owner_of({ token_id: tokenId }));
  }

  async balanceOf(owner: string): Promise<number> {
    return runRead("balanceOf", () => this.record.balance({ owner }));
  }

  async totalSupply(): Promise<number> {
    return runRead("totalSupply", () => this.record.total_supply());
  }

  async tokenUri(tokenId: number): Promise<string> {
    return runRead("tokenUri", () => this.record.token_uri({ token_id: tokenId }));
  }

  /** The SEP-41 token `enter` pays the entry fee in. sUSD on testnet. */
  async feeToken(): Promise<string> {
    return runRead("feeToken", () => this.record.get_token());
  }

  /** The EventRegistry this RaceRecord is wired to — check it matches yours. */
  async wiredRegistry(): Promise<string> {
    return runRead("wiredRegistry", () => this.record.get_registry());
  }

  // ---------------------------------------------------------------------------
  // The public verification format (C6)
  // ---------------------------------------------------------------------------

  /**
   * One record in the public JSON form: the record joined to its event and its
   * category, validated against RaceRecord JSON Schema v1.0.
   *
   * This is what a profile page renders and what a third party verifies, and it
   * needs no wallet. `transactions` is optional provenance the caller may have
   * from the indexer — chain state alone cannot say which transaction produced
   * it.
   */
  async raceRecordDocument(
    tokenId: number,
    transactions?: RecordProvenance,
  ): Promise<RaceRecordDocument> {
    const record = await this.recordOf(tokenId);
    const [event, category, owner] = await Promise.all([
      this.getEvent(record.eventId),
      this.getCategory(record.eventId, record.categoryId),
      this.ownerOf(tokenId),
    ]);

    return buildRaceRecordDocument({
      record,
      event,
      category,
      owner,
      network: {
        passphrase: this.options.networkPassphrase,
        eventRegistry: this.contracts.eventRegistry,
        raceRecord: this.contracts.raceRecord,
      },
      ...(transactions === undefined ? {} : { transactions }),
    });
  }

  /** Every record a runner owns, in the public JSON form. */
  async raceRecordDocumentsOf(runner: string): Promise<RaceRecordDocument[]> {
    const ids = await this.recordsOf(runner);
    const documents: RaceRecordDocument[] = [];
    for (const id of ids) documents.push(await this.raceRecordDocument(id));
    return documents;
  }
}
