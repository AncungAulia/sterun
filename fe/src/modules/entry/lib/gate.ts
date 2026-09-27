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
  | { kind: "registration-over"; closesAt: bigint }
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
  /**
   * When entries stop by themselves, from the chain (STE-69), and the clock to
   * measure it against. Both optional: a race published before the contract
   * could hold a date has none, and the first render has no clock.
   */
  closes?: { closesAt: bigint | null; nowS: bigint | undefined },
): Gate {
  const { event, categories } = summary;

  const existing = records.find((record) => record.eventId === event.eventId);
  if (existing) {
    const distanceCode = categories.find((c) => c.categoryId === existing.categoryId)?.code ?? "";
    return { kind: "already-entered", record: existing, distanceCode };
  }

  if (event.status !== "Open") return { kind: "closed" };

  /*
    After the status, exactly as the contract checks it, and told apart from it
    on purpose: a race an organiser closed may open again, and a date that
    passed will not undo itself. `enter` refuses this one with
    `RegistrationClosed(20)` while the status still says Open.
  */
  if (closes?.closesAt != null && closes.nowS !== undefined && closes.closesAt <= closes.nowS) {
    return { kind: "registration-over", closesAt: closes.closesAt };
  }

  const chosen = categories.find((c) => c.categoryId === requested);
  if (chosen) {
    return chosen.slotsLeft > 0
      ? { kind: "open", categoryId: chosen.categoryId }
      : { kind: "sold-out", categoryId: chosen.categoryId };
  }

  const first = categories.find((c) => c.slotsLeft > 0);
  return first ? { kind: "open", categoryId: first.categoryId } : { kind: "no-distance" };
}
