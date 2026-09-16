"use client";

/**
 * S8: this phone's clock is too far off for any code to match.
 *
 * Beyond the tolerance every scan is refused for a reason the volunteer cannot
 * see, so the banner names the size and direction in plain words and gives the
 * fix. Ink on amber, never paper: paper on `warning-strong` is 2.76:1 and fails
 * (docs/design/race-day/README.md §3).
 *
 * It never blocks a scan. A phone with a wrong clock can still take a typed
 * code that happens to fall inside the window, and taking the desk away would
 * be worse than a warning.
 *
 * "Check again" can only prove a fix when there is a true time to compare with:
 * signal, or one learned earlier in this visit. After a reload with neither,
 * the check has nothing new to go on, so the volunteer's word is taken and the
 * banner steps aside rather than staying up over a clock that may well be fixed.
 */
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";

import { describeDrift } from "../lib/roster-facts";

export interface ClockBannerProps {
  driftSeconds: number;
  checking: boolean;
  onCheckAgain: () => void;
}

export function ClockBanner({ driftSeconds, checking, onCheckAgain }: ClockBannerProps) {
  return (
    <div role="alert" className="flex flex-col gap-3 bg-warning-strong px-5 py-4 text-ink">
      <div className="flex gap-3">
        <Clock aria-hidden className="mt-1 size-6 shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="heading-strong text-lg">This phone&apos;s clock is {describeDrift(driftSeconds)}</p>
          <p className="text-base">
            Scans will fail until it is fixed. Open Settings, set the date and time to automatic, then
            come back.
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        className="h-12 border-ink bg-transparent text-base text-ink hover:bg-ink/10"
        onClick={onCheckAgain}
        disabled={checking}
      >
        {checking ? "Checking" : "I fixed it, check again"}
      </Button>
    </div>
  );
}
