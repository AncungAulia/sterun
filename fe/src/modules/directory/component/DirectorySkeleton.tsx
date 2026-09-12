/**
 * What the directory shows while the races are being read.
 *
 * A public testnet node takes a second or two to answer, and every id is a
 * separate simulation, so this is not a rare frame. Shaped like the cards it
 * stands in for, poster frame included, and laid out on the same grid, so
 * nothing jumps when they arrive. Eight cards fill two rows at the widest grid.
 * `role="status"` because the difference between "loading" and "there are no
 * races" has to be available to somebody who cannot see the shimmer.
 */
const PULSE = "animate-pulse bg-n-100 motion-reduce:animate-none";

const CARDS = [0, 1, 2, 3, 4, 5, 6, 7];

export function DirectorySkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading races"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {CARDS.map((card) => (
        <div key={card} className="overflow-hidden rounded-lg border border-n-200 bg-paper shadow-card">
          <div className={`aspect-video w-full ${PULSE}`} />
          <div className="flex flex-col gap-3 p-4">
            <div className={`h-5 w-2/3 rounded-sm ${PULSE}`} />
            <div className={`h-4 w-1/2 rounded-sm ${PULSE}`} />
            <div className={`h-4 w-1/3 rounded-sm ${PULSE}`} />
          </div>
        </div>
      ))}
    </div>
  );
}
