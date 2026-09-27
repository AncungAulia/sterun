/**
 * The one line that may stand above the pass.
 *
 * Offline is reassurance, not an error: at a venue, no signal is the expected
 * state and the pass genuinely does not need one, so it says so where a runner
 * would otherwise assume the screen had stopped working.
 *
 * The mockup has a second note, saying a code caught mid-change is still
 * accepted. It is gone (Ancung, 2026-09-16): the scanner takes the step either
 * side whatever the pass says, and a box appearing under the code every half
 * minute is movement on a screen somebody is holding up at a desk.
 */
export function OfflineNotice() {
  return (
    <div role="status" className="rounded-lg bg-warning-strong px-4 py-3 text-ink">
      <p className="heading-strong text-base">Offline. Your pass still works</p>
      <p className="mt-1 text-sm">Codes are made on this phone. Nothing is downloaded at the desk.</p>
    </div>
  );
}
