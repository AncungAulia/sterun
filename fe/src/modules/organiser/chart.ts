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
