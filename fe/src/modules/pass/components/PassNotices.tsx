/**
 * The two lines that appear above or below the code, never over it.
 *
 * Offline is reassurance, not an error: at a venue, no signal is the expected
 * state and the pass genuinely does not need one. The rollover note exists
 * because a runner who sees the digits change mid-scan starts reading the new
 * ones aloud over the volunteer.
 */
export function OfflineNotice() {
  return (
    <div role="status" className="rounded-lg bg-warning-strong px-4 py-3 text-ink">
      <p className="heading-strong text-base">Offline. Your pass still works</p>
      <p className="mt-1 text-sm">Codes are made on this phone. Nothing is downloaded at the desk.</p>
    </div>
  );
}

export function RolloverNotice() {
  return (
    <div className="rounded-lg bg-teal-50 px-4 py-3">
      <p className="heading-strong text-base text-ink">A code that just changed still works</p>
      <p className="mt-1 text-sm text-n-600">
        The scanner accepts the step before and after, so being scanned mid-change is fine.
      </p>
    </div>
  );
}
