/**
 * What the enter page shows before any form (STE-21).
 *
 * ## Already entered comes first
 *
 * `enter` does not stop one wallet entering the same race twice, and each entry
 * charges again. So this wallet's records are checked before anything else, and
 * checked from chain rather than the index, because this answer decides whether
 * somebody pays twice. It also wins over "closed": a runner who returns after
 * entries close should see their entry, not a closed door.
 *
 * The wallet itself is not a case here: `EntryFlow` wraps the whole page in
 * `WalletGate`.
 */
import type { EventSummary } from "@/lib/event/events";
import type { SterunRecord } from "@sterunxyz/sdk";

export type Gate =
  | { kind: "closed" }
  | { kind: "already-entered"; record: SterunRecord; distanceCode: string }
  | { kind: "sold-out"; categoryId: number }
  | { kind: "no-distance" }
  | { kind: "open"; categoryId: number };

/**
 * `requested` is `?category=` from the link, or null. A distance the race does
 * not have is treated as no request, because a stale link should still reach a
 * form rather than an error.
 */
export function entryGate(
  summary: EventSummary,
  records: SterunRecord[],
  requested: number | null,
): Gate {
  const { event, categories } = summary;

  const existing = records.find((record) => record.eventId === event.eventId);
  if (existing) {
    const distanceCode = categories.find((c) => c.categoryId === existing.categoryId)?.code ?? "";
    return { kind: "already-entered", record: existing, distanceCode };
  }

  if (event.status !== "Open") return { kind: "closed" };

  const chosen = categories.find((c) => c.categoryId === requested);
  if (chosen) {
    return chosen.slotsLeft > 0
      ? { kind: "open", categoryId: chosen.categoryId }
      : { kind: "sold-out", categoryId: chosen.categoryId };
  }

  const first = categories.find((c) => c.slotsLeft > 0);
  return first ? { kind: "open", categoryId: first.categoryId } : { kind: "no-distance" };
}
