/**
 * Contract events as `getEvents` delivers them, plus a fake `EventSource`.
 *
 * The builders below produce the exact topic/data split from
 * `docs/specs/INTERFACE.md` §1.3 and §2.3 — the same layout the snapshot tests
 * in `sc/contracts/<name>/src/test.rs` assert on. Getting one wrong here would make
 * the indexer tests agree with a shape the chain never emits, so they are
 * written from the document rather than from the decoder.
 */
import type { RawChainEvent } from "../../src/chain/events.js";
import type { EventPage, EventPageRequest, EventSource, RpcHealth } from "../../src/indexer/source.js";

let sequence = 0;

export interface EventContext {
  contractId: string;
  ledger?: number;
  txHash?: string;
  id?: string;
  inSuccessfulContractCall?: boolean;
  type?: string;
}

/** A 64-hex transaction hash derived from a counter, so fixtures stay readable. */
export const fakeTxHash = (n: number): string => n.toString(16).padStart(64, "0");

function envelope(ctx: EventContext, topics: unknown[], data: unknown): RawChainEvent {
  sequence += 1;
  const ledger = ctx.ledger ?? 100;
  return {
    id: ctx.id ?? `${ledger}-${sequence}`,
    contractId: ctx.contractId,
    type: ctx.type ?? "contract",
    ledger,
    // Ledger close time in ISO form; the indexer converts it back to the unix
    // seconds the contract's own clock would have written.
    ledgerClosedAt: new Date(1_800_000_000_000 + ledger * 5_000).toISOString(),
    txHash: ctx.txHash ?? fakeTxHash(sequence),
    inSuccessfulContractCall: ctx.inSuccessfulContractCall ?? true,
    topics,
    data,
  };
}

export const eventCreated = (ctx: EventContext, eventId: number, organiser: string): RawChainEvent =>
  envelope(ctx, ["event_created", eventId, organiser], {});

export const categoryAdded = (
  ctx: EventContext,
  eventId: number,
  categoryId: number,
  quota: number,
  priceStroops: bigint,
): RawChainEvent =>
  envelope(ctx, ["category_added", eventId], {
    category_id: categoryId,
    price: priceStroops,
    quota,
  });

export const eventStatusChanged = (
  ctx: EventContext,
  eventId: number,
  status: string,
): RawChainEvent => envelope(ctx, ["event_status_changed", eventId], { status: [status] });

export const scannerAdded = (ctx: EventContext, eventId: number, scanner: string): RawChainEvent =>
  envelope(ctx, ["scanner_added", eventId, scanner], {});

export const scannerRemoved = (ctx: EventContext, eventId: number, scanner: string): RawChainEvent =>
  envelope(ctx, ["scanner_removed", eventId, scanner], {});

export const slotReserved = (
  ctx: EventContext,
  eventId: number,
  categoryId: number,
  seq: number,
): RawChainEvent => envelope(ctx, ["slot_reserved", eventId, categoryId], { seq });

export const mint = (ctx: EventContext, to: string, tokenId: number): RawChainEvent =>
  envelope(ctx, ["mint", to], { token_id: tokenId });

export const recordEntered = (
  ctx: EventContext,
  runner: string,
  eventId: number,
  tokenId: number,
  bibNo: number,
): RawChainEvent =>
  envelope(ctx, ["record_entered", runner, eventId], { bib_no: bibNo, token_id: tokenId });

export const racepackClaimed = (
  ctx: EventContext,
  tokenId: number,
  eventId: number,
  operator: string,
): RawChainEvent => envelope(ctx, ["racepack_claimed", tokenId, eventId], { operator });

export const recordFinished = (
  ctx: EventContext,
  tokenId: number,
  eventId: number,
  finishTimeS: number,
): RawChainEvent =>
  envelope(ctx, ["record_finished", tokenId, eventId], { finish_time_s: finishTimeS });

export const recordDnf = (ctx: EventContext, tokenId: number, eventId: number): RawChainEvent =>
  envelope(ctx, ["record_dnf", tokenId, eventId], {});

/**
 * A `getEvents` pagination cursor for "the end of ledger N", in the shape RPC
 * actually returns: `<toid>-<index>`, where the Total Order ID packs the ledger
 * sequence into its high 32 bits.
 *
 * Built properly rather than as an opaque string, because the poller reads the
 * ledger back out of it to tell "nothing in this window" apart from "caught up"
 * — see `ledgerFromCursor`. A fake cursor of "cursor-1" would make that code
 * path untestable.
 */
export const toidCursor = (ledger: number): string =>
  `${(BigInt(ledger) << 32n) + 0xffff_ffffn}-4294967295`;

/**
 * An `EventSource` that serves a scripted list of pages.
 *
 * It records every request, so a test can assert that the second poll used the
 * cursor from the first rather than starting over — which is the difference
 * between a poller and a re-reader.
 */
export class FakeEventSource implements EventSource {
  readonly requests: EventPageRequest[] = [];
  latestLedger = 1_000;
  oldestLedger = 1;
  /**
   * The ledger the returned cursor points at. Defaults to caught up; set it
   * lower to model RPC's bounded scan window, which is the case that made the
   * poller report false progress against live testnet.
   */
  cursorLedger: number | undefined;
  private readonly pages: RawChainEvent[][];
  private next = 0;

  constructor(pages: RawChainEvent[][]) {
    this.pages = pages;
  }

  async health(): Promise<RpcHealth> {
    return { latestLedger: this.latestLedger, oldestLedger: this.oldestLedger };
  }

  get cursor(): string {
    return toidCursor(this.cursorLedger ?? this.latestLedger);
  }

  async getEvents(request: EventPageRequest): Promise<EventPage> {
    this.requests.push(request);
    const events = this.pages[this.next] ?? [];
    this.next += 1;
    return {
      events,
      cursor: this.cursor,
      latestLedger: this.latestLedger,
      oldestLedger: this.oldestLedger,
    };
  }

  /** Queue another page for a later poll. */
  push(page: RawChainEvent[]): void {
    this.pages.push(page);
  }

  /** Serve the same page again — what a crash between apply and commit causes. */
  replayLast(): void {
    const last = this.pages[this.next - 1];
    if (last) this.pages.push(last);
  }
}
