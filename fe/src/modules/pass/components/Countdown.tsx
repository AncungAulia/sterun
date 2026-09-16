/**
 * How much of this 30-second step is left.
 *
 * A value read off the clock, not an animation, which is why reduced motion
 * does not empty it: turning motion down must never turn information off
 * (docs/design/race-day/README.md section 6.4).
 */
const STEP_SECONDS = 30;

export function Countdown({ secondsLeft }: { secondsLeft: number }) {
  return (
    <div className="flex items-center gap-3">
      <div aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-n-200">
        {/* The width is the one legitimate inline style: a percentage worked
            out at runtime has no class to come from. */}
        <div
          data-testid="countdown-fill"
          className="h-full rounded-full bg-teal"
          style={{ width: `${(secondsLeft / STEP_SECONDS) * 100}%` }}
        />
      </div>
      <span className="numeric text-sm text-n-600">New code in {secondsLeft}s</span>
    </div>
  );
}
