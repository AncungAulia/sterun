/**
 * STE-16 (C8) — the `getEvents` side of the indexer, behind one interface.
 *
 * Split from `indexer.ts` so the whole apply/rebuild/doctor machine can be
 * driven from fixtures in tests: everything that touches the network is here,
 * and it is about forty lines.
 */
import { rpc } from "@stellar/stellar-sdk";
import { fromRpcEvent, type RawChainEvent } from "../chain/events.js";

/**
 * Ledger-range mode and cursor mode are mutually exclusive in the RPC API — a
 * request carrying both is rejected — so they are separate shapes here too
 * rather than one object with optional fields.
 */
export type EventPageRequest =
  | { cursor: string; limit: number }
  | { startLedger: number; limit: number };

export interface EventPage {
  events: RawChainEvent[];
  /** Pagination token to send next. Always present, even for an empty page. */
  cursor: string;
  latestLedger: number;
  /** The retention floor: RPC cannot serve events older than this. */
  oldestLedger: number;
}

export interface RpcHealth {
  latestLedger: number;
  oldestLedger: number;
}

export interface EventSource {
  health(): Promise<RpcHealth>;
  getEvents(request: EventPageRequest): Promise<EventPage>;
}

/**
 * The ledger a `getEvents` cursor points at, or `null` if it is not the shape
 * we know.
 *
 * This matters more than it looks. RPC scans a bounded window per request
 * (10,000 ledgers on testnet today) and answers with an **empty page plus a
 * cursor** when nothing in that window matched. An empty page therefore does
 * NOT mean "caught up" — it means "nothing here, ask again from the cursor".
 * Reading the ledger back out of the cursor is what lets the poller tell those
 * two apart, and it is the difference between `/indexer/status` reporting real
 * progress and reporting the network's latest ledger while still twelve
 * requests behind it.
 *
 * The cursor is `<toid>-<index>`, where the Total Order ID packs the ledger
 * sequence into its high 32 bits. Parsed defensively: an unrecognised shape
 * returns null and the caller falls back to what the events themselves say,
 * which is conservative rather than wrong.
 */
export function ledgerFromCursor(cursor: string): number | null {
  const toid = cursor.split("-")[0];
  if (!toid || !/^\d+$/.test(toid)) return null;
  const ledger = Number(BigInt(toid) >> 32n);
  return Number.isSafeInteger(ledger) && ledger > 0 ? ledger : null;
}

export class RpcEventSource implements EventSource {
  private readonly server: rpc.Server;

  constructor(
    rpcUrl: string,
    /**
     * The only contracts we ask for. This is the filter that makes
     * "filter by contract id, not by topic name" true at the wire level as well
     * as in the decoder — see chain/events.ts.
     */
    private readonly contractIds: string[],
  ) {
    this.server = new rpc.Server(rpcUrl);
  }

  async health(): Promise<RpcHealth> {
    const h = await this.server.getHealth();
    return { latestLedger: h.latestLedger, oldestLedger: h.oldestLedger };
  }

  async getEvents(request: EventPageRequest): Promise<EventPage> {
    const filters = [{ type: "contract" as const, contractIds: this.contractIds }];
    const response = await this.server.getEvents(
      "cursor" in request
        ? { filters, cursor: request.cursor, limit: request.limit }
        : { filters, startLedger: request.startLedger, limit: request.limit },
    );
    return {
      events: response.events.map(fromRpcEvent),
      cursor: response.cursor,
      latestLedger: response.latestLedger,
      oldestLedger: response.oldestLedger,
    };
  }
}
