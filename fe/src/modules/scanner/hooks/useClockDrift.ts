"use client";

/**
 * S8's measurement, kept as state for the desk.
 *
 * Starts from the drift stored with the roster, so a wrong clock is flagged on
 * the very first frame even with no signal, then measures properly on mount
 * and on "check again". See `lib/clock.ts` for the three ways it can measure.
 */
import { useCallback, useEffect, useState } from "react";

import { measureDrift, type DriftReading } from "../lib/clock";
import { driftLimitSeconds } from "../lib/roster-facts";
import type { StoredRoster } from "../lib/scanner-store";

export function useClockDrift(roster: StoredRoster | null) {
  const stored = roster?.driftSeconds ?? 0;
  const [reading, setReading] = useState<DriftReading | null>(null);
  const [checking, setChecking] = useState(false);
  /** Set when the volunteer said it is fixed and nothing could prove otherwise. */
  const [takenAtWord, setTakenAtWord] = useState(false);

  // The silent check on opening. State is set from the promise, never in the
  // effect body, which is the one place a measurement from outside React may
  // land without a cascading render.
  useEffect(() => {
    if (!roster) return;
    let current = true;
    void measureDrift(stored).then((next) => {
      if (current) setReading(next);
    });
    return () => {
      current = false;
    };
  }, [roster, stored]);

  const checkAgain = useCallback(async () => {
    setChecking(true);
    try {
      const next = await measureDrift(stored);
      setReading(next);
      // Nothing new to measure against: take the volunteer's word (ClockBanner).
      if (next.source === "stored") setTakenAtWord(true);
    } finally {
      setChecking(false);
    }
  }, [stored]);

  const driftSeconds = reading?.driftSeconds ?? stored;
  const limit = roster ? driftLimitSeconds(roster.totp) : Number.POSITIVE_INFINITY;
  const tooFar = Math.abs(driftSeconds) > limit && !takenAtWord;

  return { driftSeconds, tooFar, checking, checkAgain: () => void checkAgain() };
}
