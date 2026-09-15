/**
 * STE-50 — deleting entries that never happened, on a schedule.
 *
 * Runs inside the API process, next to the vault it cleans. Not the keeper: that
 * runs weekly by design, and a 24-hour rule checked weekly keeps a row for up to
 * eight days. Not a separate container either: this is one DELETE an hour.
 *
 * Safe with more than one API instance, because the statement is idempotent: two
 * instances sweeping at once delete each row once, and the second finds nothing.
 */
import type { Vault } from "./vault.js";

export interface RetentionLog {
  info(detail: Record<string, unknown>, message: string): void;
  error(detail: Record<string, unknown>, message: string): void;
}

export interface RetentionOptions {
  olderThanHours: number;
  intervalMs: number;
}

/**
 * Sweep now, then every `intervalMs`. Returns a function that stops it.
 *
 * Now as well as later so a deploy shows the sweep working in its first log
 * lines, instead of an hour after anyone is watching. A failed sweep is logged
 * and retried on the next tick: a database blip must not take the API down over
 * a cleanup job.
 */
export function startUnconfirmedSweep(
  vault: Pick<Vault, "sweepUnconfirmed">,
  log: RetentionLog,
  { olderThanHours, intervalMs }: RetentionOptions,
): () => void {
  let running = false;

  const tick = async (): Promise<void> => {
    // One at a time. A sweep that outlasts the interval must not queue another.
    if (running) return;
    running = true;
    try {
      const removed = await vault.sweepUnconfirmed(olderThanHours);
      // Counts only. Nothing about which rows, whose, or for which race.
      log.info({ removed, olderThanHours }, "swept unconfirmed entries");
    } catch (error) {
      log.error({ err: error, olderThanHours }, "sweeping unconfirmed entries failed");
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  // Never the reason the process stays alive.
  timer.unref();
  return () => clearInterval(timer);
}
