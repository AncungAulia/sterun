import { sparklinePath } from "../chart";

/**
 * Fourteen days of entries, small enough to sit in a table row.
 *
 * A race with no entries gets a rule rather than a line, because a flat line
 * along the bottom reads as a measurement and this is an absence. The rule is
 * neutral grey for the same reason: it is the shape of "nothing to show", not
 * the shape of a number.
 *
 * The `viewBox` is inset by a pixel on each side so a round cap on a point
 * sitting at the very top or the very edge is not sliced off by the box.
 */
export function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
  const path = sparklinePath(values, 84, 22);

  return (
    <svg width="86" height="26" viewBox="-1 -2 88 26" role="img" aria-label={label}>
      {path === null ? (
        <line
          x1="0"
          y1="22"
          x2="84"
          y2="22"
          stroke="var(--color-n-200)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <path
          d={path}
          fill="none"
          stroke="var(--color-teal)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
