/**
 * How far this phone's clock is from true time, measured whichever way is
 * available at the moment of asking (S8).
 *
 * A scanner whose clock is off by more than the tolerance refuses every code,
 * and nothing on the refusal says why. So the desk measures, and it has three
 * ways, best first:
 *
 *   1. **With signal**, a HEAD request to this app's own origin and its `Date`
 *      header. Same origin, so the header is readable, and a HEAD is never
 *      cached by the service worker, which only keeps GETs.
 *   2. **Without signal, but since a measurement in this visit**, the last known
 *      true time moved forward by `performance.now()`. That clock is monotonic:
 *      it does not jump when the volunteer changes the phone's time in
 *      Settings, which is exactly the change being checked.
 *   3. **Neither**, the drift stored with the roster when it was downloaded.
 *
 * Only the third one cannot see a fix. The desk says so rather than pretending
 * (see `ClockBanner`).
 */

export type DriftSource = "server" | "anchor" | "stored";

export interface DriftReading {
  driftSeconds: number;
  source: DriftSource;
}

interface Anchor {
  serverMs: number;
  perfMs: number;
}

/** The last true time this visit learned. Module state: it lives as long as the page does. */
let anchor: Anchor | null = null;

export interface ClockDeps {
  now: () => number;
  perfNow: () => number;
  online: () => boolean;
  headDate: () => Promise<string | null>;
}

const defaultDeps: ClockDeps = {
  now: () => Date.now(),
  perfNow: () => performance.now(),
  online: () => navigator.onLine,
  headDate: async () => {
    const response = await fetch("/manifest.webmanifest", { method: "HEAD", cache: "no-store" });
    return response.headers.get("date");
  },
};

/** Remember a true time learned elsewhere, such as a roster's `generated_at` as it arrives. */
export function rememberServerTime(serverMs: number, perfNow: () => number = defaultDeps.perfNow): void {
  anchor = { serverMs, perfMs: perfNow() };
}

/** For tests: forget what this visit learned. */
export function forgetServerTime(): void {
  anchor = null;
}

export async function measureDrift(
  storedDriftSeconds: number,
  deps: Partial<ClockDeps> = {},
): Promise<DriftReading> {
  const { now, perfNow, online, headDate } = { ...defaultDeps, ...deps };

  if (online()) {
    try {
      const header = await headDate();
      const serverMs = header ? Date.parse(header) : Number.NaN;
      if (Number.isFinite(serverMs)) {
        anchor = { serverMs, perfMs: perfNow() };
        return { driftSeconds: Math.round((now() - serverMs) / 1000), source: "server" };
      }
    } catch {
      // The signal bar lied, which it often does at a venue. Fall through.
    }
  }

  if (anchor) {
    const serverNow = anchor.serverMs + (perfNow() - anchor.perfMs);
    return { driftSeconds: Math.round((now() - serverNow) / 1000), source: "anchor" };
  }

  return { driftSeconds: storedDriftSeconds, source: "stored" };
}
