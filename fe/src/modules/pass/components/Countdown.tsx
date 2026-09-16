/**
 * How much of this 30-second step is left.
 *
 * A value read off the clock, not an animation, which is why reduced motion
 * does not empty it: turning motion down must never turn information off
 * (docs/design/race-day/README.md section 6.4).
 *
 * It glides rather than stepping. The clock is read once a second, so a bar
 * driven straight from that number jumps six pixels at a time and reads as a
 * stutter (Ancung, 2026-09-16). The glide is a one second linear transition on
 * a transform, which is the length of a tick rather than a chosen duration, and
 * scaling beats animating width because the compositor can do it without
 * laying the page out again.
 *
 * The bar is keyed by the step so a rollover starts a fresh element: without
 * that, the jump from nearly empty back to full would glide backwards for a
 * second, which looks like the code has been put back rather than replaced.
 */
const STEP_SECONDS = 30;

export function Countdown({ secondsLeft, step }: { secondsLeft: number; step: number }) {
  return (
    <div className="flex items-center gap-3">
      <div aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-n-200">
        <div
          key={step}
          data-testid="countdown-fill"
          className="pass-countdown h-full rounded-full bg-teal"
          style={{ transform: `scaleX(${secondsLeft / STEP_SECONDS})` }}
        />
      </div>
      <span className="numeric text-sm text-n-600">New code in {secondsLeft}s</span>
    </div>
  );
}
