/**
 * Where a record last changed, from the index (`GET /records/:tokenId`).
 *
 * Only ever an addition to a card. The chain already answered every fact on it;
 * this adds the ledger of the latest change and, when the indexer saw the event
 * that caused it, the transaction to link. RPC keeps events for about a week
 * (docs/design/profile/README.md §10), so the index is the only place a
 * transaction from last month can still be found.
 *
 * A failure is `null` and the card simply has no link. The page must render
 * whole with the index down.
 */
import { apiFetch } from "@/lib/api/client";

interface RecordDetailJson {
  record: { last_ledger: number };
  transitions: {
    to_state: string;
    occurred_at: string;
    ledger?: number | null;
    tx_hash?: string | null;
  }[];
}

export interface RecordTrail {
  ledger: number;
  /** The transaction of the latest change, when the index has one. */
  txHash: string | null;
}

export async function fetchRecordTrail(tokenId: number): Promise<RecordTrail | null> {
  try {
    const body = await apiFetch<RecordDetailJson>(`/records/${tokenId}`);
    // Latest by when it happened, then by ledger. The route's order is not
    // part of its contract, so it is not relied on.
    const latest = [...body.transitions].sort((a, b) => {
      const at = BigInt(b.occurred_at) - BigInt(a.occurred_at);
      if (at !== 0n) return at > 0n ? 1 : -1;
      return (b.ledger ?? 0) - (a.ledger ?? 0);
    })[0];
    return {
      ledger: latest?.ledger ?? body.record.last_ledger,
      txHash: latest?.tx_hash ?? null,
    };
  } catch {
    return null;
  }
}
