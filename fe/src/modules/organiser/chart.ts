/**
 * The arithmetic behind the console's charts, kept away from the components.
 *
 * Divisions by zero in an SVG path do not throw: they produce `NaN`, the
 * browser drops the path, and the panel renders empty with nothing in the
 * console. Every one of them is guarded here, where a test can see it.
 */

/**
 * One coordinate, rounded and with no trailing zeros.
 *
 * `toFixed` would write `0.0`, which is the same picture and a longer path, and
 * it also makes every assertion about a path read past a decimal point that
 * carries no information. Rounded rather than printed whole because these are
 * pixels inside a box a hundred wide: a tenth is already below what a screen
 * can draw.
 */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * A polyline through a series, scaled to fill the box.
 *
 * `null` when there is nothing to draw. A race nobody has entered would
 * otherwise get a flat line along the bottom, which reads as a measurement
 * rather than as an absence; the caller draws a plain rule instead.
 */
export function sparklinePath(
  values: readonly number[],
  width: number,
  height: number,
): string | null {
  if (values.length === 0) return null;
  const top = Math.max(...values);
  if (top <= 0) return null;

  const step = values.length === 1 ? 0 : width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : index * step;
    const y = height - (value / top) * height;
    return `${n(x)},${n(y)}`;
  });

  return `M ${points[0]}${points
    .slice(1)
    .map((point) => ` L ${point}`)
    .join("")}`;
}

const DAY = 86_400n;

/** Just enough of a record for this maths; the full shape is in `lib/records.ts`. */
export interface EnteredAt {
  enteredAt: bigint;
}

export interface FillPoint {
  /** Days before race day the entry was made. Counts down along the x-axis. */
  daysOut: number;
  /** 0 to 1 of the race's total places. */
  filled: number;
}

/**
 * A race's fill against how long there was left before it ran.
 *
 * The x-axis is the whole idea. Two races months apart cannot be compared on
 * calendar dates, but "how full was it three weeks out" is the same question
 * for both. The y-axis is a fraction rather than a count for the same reason:
 * 240 places and 500 places are not the same race.
 *
 * Empty rather than flat when there is nothing to say. A quota of zero would
 * otherwise divide, and a race with no entries would draw a line along the
 * bottom that claims a measurement.
 */
export function fillByDaysOut(
  records: readonly EnteredAt[],
  quota: number,
  startsAt: bigint,
  nowS: bigint,
): FillPoint[] {
  if (quota <= 0 || records.length === 0) return [];

  const sorted = [...records].sort((a, b) => (a.enteredAt < b.enteredAt ? -1 : 1));
  const points: FillPoint[] = [];

  sorted.forEach((entry, index) => {
    const remaining = startsAt > entry.enteredAt ? (startsAt - entry.enteredAt) / DAY : 0n;
    points.push({
      daysOut: Number(remaining),
      filled: Math.min(1, (index + 1) / quota),
    });
  });

  // The line stops where the race is today, not at its last entry: a race that
  // sold nothing for a fortnight should show that fortnight.
  const last = points[points.length - 1];
  const today = startsAt > nowS ? Number((startsAt - nowS) / DAY) : 0;
  if (today < last.daysOut) points.push({ daysOut: today, filled: last.filled });

  return points;
}

/**
 * The part of a series that fits inside the chart's window, without losing
 * where the line had got to when it entered.
 *
 * Dropping everything older would restart the line at zero part way up the
 * chart, which is a lie about a race that was already a third full. Clamping
 * every old point to the edge instead draws a vertical wall there. So the
 * points outside the window collapse into exactly one, carrying the fill they
 * had reached, placed on the edge.
 */
export function windowed(points: readonly FillPoint[], days: number): FillPoint[] {
  const inside = points.filter((point) => point.daysOut <= days);
  const before = points.filter((point) => point.daysOut > days);
  if (before.length === 0) return [...inside];

  const carried = before.reduce((most, point) => (point.filled > most.filled ? point : most));
  return [{ daysOut: days, filled: carried.filled }, ...inside];
}

/**
 * A Catmull-Rom curve through the points, as a cubic Bezier path.
 *
 * Smoothed because these are cumulative counts sampled irregularly, and the
 * comparison being made is of shape. It never overshoots into impossible
 * territory at this scale, but note that it is a drawing convenience: the
 * numbers people act on are in the key, not read off the curve.
 */
export function smoothPath(points: readonly (readonly [number, number])[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${n(points[0][0])},${n(points[0][1])}`;

  let d = `M ${n(points[0][0])},${n(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i - 1] ?? points[0];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[i + 2] ?? points[points.length - 1];
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    d += ` C ${n(c1x)},${n(c1y)} ${n(c2x)},${n(c2y)} ${n(x2)},${n(y2)}`;
  }
  return d;
}
