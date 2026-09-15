/**
 * Where a half-finished publish lives between page loads.
 *
 * Publishing a race is several transactions — create, one per distance, one per
 * add-on, open — and until now the record of which had landed lived only in
 * React state. A refresh emptied it. That is worse than losing a form, because
 * the first transaction has already put the event on chain with a permanent
 * name and date: starting again publishes a second one and leaves the first
 * stranded with no entries.
 *
 * Keyed by wallet, because the run belongs to the organiser rather than to the
 * tab, and one person may hold two.
 *
 * This is not a "saved draft" and must never be presented as one. There is
 * nothing here to edit: by the time it exists the details are already on chain.
 * It is the difference between the wizard losing somebody's work and not.
 *
 * Every access is wrapped. `localStorage` throws rather than returning nothing
 * in a private window or with site data blocked, and a wizard that cannot start
 * because of that would be a worse bug than the one this fixes.
 */
export interface RunProgress {
  /** The event this run created, once `create_event` has landed. */
  eventId: number | null;
  /** Step ids that have landed, in the wizard's own vocabulary. */
  done: string[];
}

const PREFIX = "sterun.run.";

function isProgress(value: unknown): value is RunProgress {
  if (typeof value !== "object" || value === null) return false;
  const { eventId, done } = value as Record<string, unknown>;
  const idOk = eventId === null || (typeof eventId === "number" && Number.isInteger(eventId));
  const doneOk = Array.isArray(done) && done.every((step) => typeof step === "string");
  return idOk && doneOk;
}

export function loadRunProgress(address: string): RunProgress | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + address);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isProgress(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRunProgress(address: string, progress: RunProgress): void {
  try {
    window.localStorage.setItem(PREFIX + address, JSON.stringify(progress));
  } catch {
    // Nothing to do and nothing to say: the run carries on in memory exactly
    // as it did before this file existed.
  }
}

export function clearRunProgress(address: string): void {
  try {
    window.localStorage.removeItem(PREFIX + address);
  } catch {
    // As above.
  }
}
