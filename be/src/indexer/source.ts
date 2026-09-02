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
