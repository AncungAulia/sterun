/**
 * What the directory shows while the chain is being read.
 *
 * A public testnet node takes a second or two to answer, and every id is a
 * separate simulation, so this is not a rare frame. `role="status"` because the
 * difference between "loading" and "there are no races" has to be available to
 * somebody who cannot see the shimmer.
 */
export function DirectorySkeleton() {
  return (
    <div role="status" aria-label="Reading events from the chain" className="grid gap-4 sm:grid-cols-2">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="rounded-lg border border-n-200 bg-paper p-6 shadow-card">
          <div className="h-6 w-2/3 animate-pulse rounded-sm bg-n-100" />
          <div className="mt-3 h-4 w-1/3 animate-pulse rounded-sm bg-n-100" />
          <div className="mt-6 flex gap-2">
            <div className="h-6 w-16 animate-pulse rounded-sm bg-n-100" />
            <div className="h-6 w-16 animate-pulse rounded-sm bg-n-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
