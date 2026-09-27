/**
 * STE-57 - when each distance's places were raised, from the index.
 *
 * The chain holds only today's quota. When it grew, and from what, is the
 * `QuotaIncreased` events the backend has indexed (STE-56), served on
 * `GET /events/:eventId` as `categories[].quota_history`. That makes this an
 * addition to the page, never a condition for it: with the index down a
 * distance card simply has no "raised" line, and the places it shows still
 * come from the chain.
 */
import { apiFetch } from "@/lib/api/client";

export interface QuotaRaise {
  previous: number;
  current: number;
  /** Unix seconds of the ledger that raised it. */
  at: bigint;
}

interface EventJson {
  categories: {
    category_id: number;
    quota_history?: { previous: number; current: number; at: string }[];
  }[];
}

/** Raises per category id, oldest first, as the index sends them. Categories never raised are absent. */
export async function fetchQuotaHistory(eventId: number): Promise<Map<number, QuotaRaise[]>> {
  const event = await apiFetch<EventJson>(`/events/${eventId}`);
  const raises = new Map<number, QuotaRaise[]>();
  for (const category of event.categories) {
    const rows = (category.quota_history ?? [])
      // A row that does not say it went up is not a raise this page can describe.
      .filter((row) => /^\d+$/.test(row.at) && row.current > row.previous)
      .map((row) => ({ previous: row.previous, current: row.current, at: BigInt(row.at) }));
    if (rows.length > 0) raises.set(category.category_id, rows);
  }
  return raises;
}
