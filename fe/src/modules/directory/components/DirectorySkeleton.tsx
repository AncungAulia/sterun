/**
 * What the directory shows while the races are being read.
 *
 * A public testnet node takes a second or two to answer, and every id is a
 * separate simulation, so this is not a rare frame. Shaped like the cards it
 * stands in for, poster frame included, and laid out on the same grid, so
 * nothing jumps when they arrive. Eight cards fill two rows at the widest grid.
 * `role="status"` because the difference between "loading" and "there are no
 * races" has to be available to somebody who cannot see the shimmer.
 *
 * **The featured row is part of it** (Ancung, 2026-09-17). It was not, so the
 * page waited as a grid of small cards and then grew a block the height of
 * three of them on top, pushing everything already being read down the screen.
 * The row's real shape depends on how many races have a poster, which is not
 * known until the documents answer; the three-race grid is drawn because it is
 * both the commonest and the tallest, so the arrival can only ever settle
 * upward, never jump down.
 */
const CARDS = [0, 1, 2, 3, 4, 5, 6, 7];

export function DirectorySkeleton() {
  return (
    <div role="status" aria-label="Loading races" className="flex flex-col gap-8">
      <div className="grid gap-4 lg:grid-cols-3 lg:grid-rows-2">
        <div className="skeleton aspect-[4/3] rounded-lg sm:aspect-video lg:col-span-2 lg:row-span-2 lg:h-full" />
        <div className="skeleton aspect-[4/3] rounded-lg sm:aspect-video lg:aspect-auto lg:h-full" />
        <div className="skeleton aspect-[4/3] rounded-lg sm:aspect-video lg:aspect-auto lg:h-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {CARDS.map((card) => (
          <div key={card} className="overflow-hidden rounded-lg border border-n-200 bg-paper shadow-card">
            <div className="skeleton aspect-video w-full" />
            <div className="flex flex-col gap-3 p-4">
              <div className="skeleton h-5 w-2/3 rounded-sm" />
              <div className="skeleton h-4 w-1/2 rounded-sm" />
              <div className="skeleton h-4 w-1/3 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
