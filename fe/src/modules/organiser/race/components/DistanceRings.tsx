/**
 * One half ring per distance, longest outermost, with the numbers in a key.
 *
 * Ancung chose rings over bars knowing the cost, which the spec records: the
 * shortest arc has the least distance to travel and looks fuller than it is,
 * so the key carries the real numbers. A full distance is the one amber arc,
 * the same amber a sold-out add-on uses.
 *
 * Below `sm` the key goes under the rings rather than beside them.
 */
import type { SterunCategory } from "@sterunxyz/sdk";

import { Badge } from "@/components/ui/badge";

import { halfRingPath } from "@/modules/organiser/shared/lib/chart";

const LIVE = [
  "var(--color-teal)",
  "var(--color-teal-300)",
  "var(--color-teal-600)",
  "var(--color-teal-200)",
];
const FULL = "var(--color-warning)";

const CX = 150;
const CY = 160;
const OUTER = 132;
const INNER = 46;
const STROKE = 20;

function share(category: SterunCategory): number {
  return category.quota > 0 ? Math.min(1, category.enteredCount / category.quota) : 0;
}

function isFull(category: SterunCategory): boolean {
  return category.quota > 0 && category.enteredCount >= category.quota;
}

export function DistanceRings({ categories }: { categories: readonly SterunCategory[] }) {
  const ordered = [...categories].sort((a, b) => b.distanceM - a.distanceM);
  const gap = ordered.length > 1 ? Math.min(29, (OUTER - INNER) / (ordered.length - 1)) : 0;

  let live = 0;
  const rings = ordered.map((category, index) => ({
    category,
    r: OUTER - index * gap,
    percent: Math.round(share(category) * 100),
    colour: isFull(category) ? FULL : LIVE[live++ % LIVE.length],
  }));

  return (
    <section className="flex flex-col rounded-lg border border-n-200 bg-paper p-4">
      <h2 className="heading-strong mb-3 text-sm text-ink">Distances</h2>

      {rings.length === 0 ? (
        <p className="grid min-h-32 place-items-center text-sm text-n-500">No distances</p>
      ) : (
        /* Rings over their key, centred, at every width. The key used to sit
           beside the rings with a count per row, and a long code such as
           3K_FUN_WALK pushed the count out of the card. The counts live on the
           Entries tab; this panel is the shape. */
        <div className="flex flex-col items-center gap-4">
          <svg
            viewBox="0 0 300 176"
            role="img"
            aria-label={rings
              .map(({ category, percent }) =>
                isFull(category) ? `${category.code} full` : `${category.code} ${percent} percent`,
              )
              .join(", ")}
            className="h-auto w-full max-w-60 shrink-0"
          >
            <g fill="none" strokeWidth={STROKE} strokeLinecap="round">
              {rings.map(({ category, r, percent, colour }) => (
                <g key={category.categoryId}>
                  <path
                    data-part="track"
                    d={halfRingPath(CX, CY, r)}
                    stroke="var(--color-n-100)"
                    pathLength={100}
                  />
                  {/* A round cap on a zero-length dash still paints a dot,
                      which reads as an entry that does not exist. */}
                  {percent > 0 ? (
                    <path
                      data-part="fill"
                      d={halfRingPath(CX, CY, r)}
                      stroke={colour}
                      pathLength={100}
                      strokeDasharray={`${percent} ${100 - percent}`}
                    />
                  ) : null}
                </g>
              ))}
            </g>
          </svg>

          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
            {rings.map(({ category, colour }) => (
              <li key={category.categoryId} className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-sm"
                  /* The one inline style: the colour is picked per ring at runtime. */
                  style={{ background: colour }}
                />
                <span className="font-medium break-all text-ink">{category.code}</span>
                {isFull(category) ? <Badge variant="warning">Full</Badge> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
