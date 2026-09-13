/**
 * Entries as the indexer hands them over, and the sums drawn from them.
 *
 * The chain knows how many people have entered a race. It does not usefully
 * know *when* each of them did: Soroban keeps its events for days, so anything
 * about a trend has to come from the index, which keeps them (`be/CLAUDE.md`).
 * That is the whole reason this file exists and the reason the sums here are
 * pure — a chart nobody can test is a chart nobody can trust.
 *
 * Numbers on the wire are strings where they are u64 or i128, because a JSON
 * number is a double and these are timestamps and money.
 */
import { apiFetch } from "@/lib/api";

export type RecordState = "Entered" | "RacepackClaimed" | "Finished" | "Dnf";

export interface IndexedRecord {
  tokenId: number;
  eventId: number;
  categoryId: number;
  bibNo: number;
  runnerAddress: string;
  state: RecordState;
  enteredAt: bigint;
  claimedAt: bigint | null;
  /** `null` is "finished, no official time" (STE-41). Never render it as 0. */
  finishTimeS: number | null;
}

interface RecordJson {
  token_id: number;
  event_id: number;
  category_id: number;
  bib_no: number;
  runner_address: string;
  state: RecordState;
  entered_at: string;
  claimed_at: string | null;
  finish_time_s: number | null;
}

const PAGE = 200;

function toRecord(row: RecordJson): IndexedRecord {
  return {
    tokenId: row.token_id,
    eventId: row.event_id,
    categoryId: row.category_id,
    bibNo: row.bib_no,
    runnerAddress: row.runner_address,
    state: row.state,
    enteredAt: BigInt(row.entered_at),
    claimedAt: row.claimed_at === null ? null : BigInt(row.claimed_at),
    finishTimeS: row.finish_time_s,
  };
}

/**
 * Every entry in a race, paged out.
 *
 * The endpoint caps a page at 200 and a race can hold more, so this asks until
 * a short page comes back. The loop is bounded by the offset growing, so a
 * server that kept answering with a full page would stop at the cap rather than
 * run forever.
 */
export async function fetchEventRecords(eventId: number): Promise<IndexedRecord[]> {
  const all: IndexedRecord[] = [];
  for (let offset = 0; offset < 10_000; offset += PAGE) {
    const body = await apiFetch<{ records: RecordJson[]; count: number }>(
      `/events/${eventId}/records?limit=${PAGE}&offset=${offset}`,
    );
    all.push(...body.records.map(toRecord));
    if (body.records.length < PAGE) break;
  }
  return all;
}

const DAY = 86_400n;

/**
 * Entries bucketed by day, oldest first, ending with today.
 *
 * Records outside the window are dropped rather than clamped into the end
 * buckets, which would draw a spike that never happened. A record dated in the
 * future is dropped for the same reason.
 */
export function entriesPerDay(
  records: readonly IndexedRecord[],
  nowS: bigint,
  days: number,
): number[] {
  const buckets = Array(Math.max(0, days)).fill(0) as number[];
  if (buckets.length === 0) return buckets;

  for (const entry of records) {
    if (entry.enteredAt > nowS) continue;
    const back = Number((nowS - entry.enteredAt) / DAY);
    const index = buckets.length - 1 - back;
    if (index >= 0) buckets[index] += 1;
  }
  return buckets;
}

/** How many entries carry a recorded result. A DNF is a result. */
export function finishedCount(records: readonly IndexedRecord[]): number {
  return records.filter((entry) => entry.state === "Finished" || entry.state === "Dnf").length;
}
