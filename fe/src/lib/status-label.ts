/**
 * The lifecycle, in words rather than in the contract's vocabulary.
 *
 * `EventStatus` is frozen in `docs/specs/INTERFACE.md` and does not change.
 * What a person reads is ours, and one of the five needed changing: "Draft" is
 * a word about documents, and by the time an event holds that status it is
 * already on chain with a permanent name and date. Nothing about it is a draft.
 * What is true is narrower and is what the label says — its entries are not
 * open.
 *
 * The other four are spelled out for the same reason, not renamed: "Open" alone
 * does not say open for what, and "Completed" is a status word rather than the
 * thing a runner would say.
 */
import type { EventStatus } from "@sterunxyz/sdk";

const LABELS = {
  Draft: "Not open yet",
  Open: "Open for entry",
  Closed: "Entries closed",
  Completed: "Finished",
  Cancelled: "Cancelled",
} as const satisfies Record<EventStatus, string>;

export function statusLabel(status: EventStatus): string {
  return LABELS[status];
}
