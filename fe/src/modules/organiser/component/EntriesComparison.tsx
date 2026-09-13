/**
 * How full each race was at the same point in its own run-up.
 *
 * Titled **Entries comparison**, never "Pace". In a running product pace means
 * minutes per kilometre, and a runner glancing at an organiser's screen would
 * read this as a chart about how fast people run.
 *
 * The x-axis is what makes the comparison possible and it is labelled, because
 * nothing else on the page explains it: two races months apart cannot be
 * compared on calendar dates, but "how full were you three weeks out" is the
 * same question for both. The y-axis is a percentage for the same reason, since
 * 240 places and 500 places are not the same race.
 *
 * A race that has already run is the benchmark, drawn dashed and grey: it is
 * finished, so its line is a fact rather than a position. The live races stop
 * where they are today, with a dot, because a line that ran to the right-hand
 * edge would claim entries that have not happened yet.
 *
 * Nothing at all is drawn when there is nothing to draw. Axes over an empty
 * plot are a chart claiming to have measured something.
 */
import { type FillPoint, smoothPath, windowed } from "../chart";

export interface ComparisonSeries {
  name: string;
  /** The race has already run, so its line is a benchmark rather than a position. */
  finished: boolean;
  points: FillPoint[];
}

/** How far back the comparison looks. Fixed, so every race is read on one scale. */
const WINDOW_DAYS = 60;

/* The plot, in the viewBox's own units. Left of X0 is the percentage scale,
   below Y0 is the day scale and the axis label. */
const X0 = 46;
const X1 = 706;
const Y_TOP = 16;
const Y_BASE = 168;

/**
 * Two live races get two colours, and a third would need a third. The cycle
 * repeats rather than running out, because a silent `undefined` in a stroke is
 * an invisible line, and an organiser would read that as a race with no entries.
 */
const LIVE = ["var(--color-teal)", "var(--color-warning-strong)", "var(--color-teal-300)"];

function x(daysOut: number): number {
  return X0 + ((WINDOW_DAYS - daysOut) / WINDOW_DAYS) * (X1 - X0);
}

function y(filled: number): number {
  return Y_BASE - filled * (Y_BASE - Y_TOP);
}

function percent(points: readonly FillPoint[]): number {
  const last = points.at(-1);
  return last === undefined ? 0 : Math.round(last.filled * 100);
}

export function EntriesComparison({ series }: { series: readonly ComparisonSeries[] }) {
  const drawn = series
    .map((race) => ({ ...race, points: windowed(race.points, WINDOW_DAYS) }))
    .filter((race) => race.points.length > 0);

  let live = 0;
  const coloured = drawn.map((race) => ({
    ...race,
    colour: race.finished ? "var(--color-n-400)" : LIVE[live++ % LIVE.length],
  }));

  return (
    <section className="flex flex-col rounded-lg border border-n-200 bg-paper p-4">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="heading-strong text-sm text-ink">Entries comparison</h2>
        <p className="text-xs whitespace-nowrap text-n-500">Percent of quota</p>
      </div>

      {/* With nothing to draw, the panel keeps the height it will have once
          there is something in it and says so, and that is all. The grid, the
          scales and the key are hints about data, so with no data they are
          furniture: Ancung's call on 2026-09-14, having seen both. What the
          height buys is that the first entry a race takes fills the panel in
          rather than pushing the page around. */}
      <div className="relative">
        <svg
          viewBox="0 0 720 210"
          role="img"
          aria-label={
            coloured.length === 0
              ? "How full each race is against the days left before it runs. No entries yet."
              : `How full each race was against the days left before it ran. ${coloured
                  .map((race) => `${race.name} reached ${percent(race.points)} percent`)
                  .join(". ")}.`
          }
          className="h-auto w-full"
        >
            {coloured.length === 0
            ? null
            : [0, 25, 50, 75, 100].map((mark) => (
              <g key={mark}>
                <line
                  x1={X0}
                  y1={y(mark / 100)}
                  x2={X1}
                  y2={y(mark / 100)}
                  stroke="var(--color-n-100)"
                  strokeWidth="1"
                />
                <text
                  x={X0 - 9}
                  y={y(mark / 100) + 3.5}
                  textAnchor="end"
                  fontSize="9.5"
                  fill="var(--color-n-400)"
                >
                  {mark}%
                </text>
              </g>
            ))}

            {coloured.map((race) => (
              <path
                key={race.name}
                d={smoothPath(race.points.map((point) => [x(point.daysOut), y(point.filled)]))}
                fill="none"
                stroke={race.colour}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={race.finished ? "5 5" : undefined}
              />
            ))}

            {/* Only a race still to run gets a head on its line. A finished
                race has no "where it is now" to mark. */}
            {coloured
              .filter((race) => !race.finished)
              .map((race) => {
                const last = race.points[race.points.length - 1];
                return (
                  <circle
                    key={race.name}
                    cx={x(last.daysOut)}
                    cy={y(last.filled)}
                    r="4.5"
                    fill="var(--color-paper)"
                    stroke={race.colour}
                    strokeWidth="2.5"
                  />
                );
              })}

          {coloured.length === 0
            ? null
            : [60, 45, 30, 15, 0].map((day) => (
                <text
                  key={day}
                  x={x(day)}
                  y={Y_BASE + 18}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="var(--color-n-400)"
                >
                  {day}
                </text>
              ))}

          {coloured.length === 0 ? null : (
            <text
              x={X0}
              y={Y_BASE + 34}
              textAnchor="start"
              fontSize="9.5"
              fill="var(--color-n-400)"
            >
              days to race day
            </text>
          )}
        </svg>

        {/* Over the grid rather than under it, so the empty chart keeps the
            height it will have once there is something in it and the page does
            not jump the first time a race takes an entry. */}
        {coloured.length === 0 ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-n-500">
            No entries yet
          </p>
        ) : null}
      </div>

      {coloured.length > 0 ? (
        <ul className="mt-4 flex flex-row flex-wrap gap-x-6 gap-y-2 text-sm text-n-600">
          {coloured.map((race) => (
            <li key={race.name} className="flex items-center gap-2">
              <span
                aria-hidden
                /* The one inline style: the colour is chosen per series at
                   runtime, so there is no class it could come from. */
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: race.colour }}
              />
              {race.name} <b className="numeric font-medium text-ink">{percent(race.points)}%</b>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
