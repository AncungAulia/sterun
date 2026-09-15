"use client";

/**
 * Entries per day for the last fortnight: a smooth area, gridlines, and a
 * marker that follows the pointer.
 *
 * With no entries at all the panel keeps its height and says so, and draws no
 * shape: the same rule as the dashboard's panels (fe/CLAUDE.md, "A chart with
 * no data").
 */
import { useState } from "react";

import { areaPaths, niceCeiling } from "../chart";

const BOX = { x0: 44, x1: 606, yTop: 16, yBase: 148 };
const DAY = 86_400n;

function dayOf(nowS: bigint, index: number, days: number): Date {
  return new Date(Number(nowS - BigInt(days - 1 - index) * DAY) * 1000);
}

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function EntriesPerDay({ values, nowS }: { values: readonly number[]; nowS: bigint }) {
  const [hover, setHover] = useState<number | null>(null);
  const ceiling = niceCeiling(Math.max(0, ...values));
  const drawn = areaPaths(values, BOX, ceiling);
  const total = values.reduce((sum, value) => sum + value, 0);
  const busiest = Math.max(0, ...values);
  const days = values.length;
  const step = days > 1 ? (BOX.x1 - BOX.x0) / (days - 1) : BOX.x1 - BOX.x0;

  const tipX = drawn && hover !== null ? drawn.points[hover][0] : 0;
  const tipCentre = Math.min(Math.max(tipX, BOX.x0 + 40), BOX.x1 - 40);

  return (
    <section className="flex flex-col rounded-lg border border-n-200 bg-paper p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="heading-strong text-sm text-ink">Entries per day</h2>
        <p className="text-xs whitespace-nowrap text-n-500">Last {days} days</p>
      </div>

      <div className="relative">
        <svg
          viewBox="0 0 620 176"
          role="img"
          aria-label={
            drawn
              ? `Entries per day over the last ${days} days, ${total} in total, ${busiest} on the busiest day`
              : `Entries per day over the last ${days} days. No entries.`
          }
          className="h-auto w-full"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="entries-per-day-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-teal)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-teal)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {drawn
            ? [0, 1, 2, 3, 4, 5].map((mark) => {
                const y = BOX.yBase - (mark / 5) * (BOX.yBase - BOX.yTop);
                return (
                  <g key={mark}>
                    <line
                      x1={BOX.x0}
                      y1={y}
                      x2={BOX.x1}
                      y2={y}
                      stroke="var(--color-n-100)"
                      strokeWidth="1"
                    />
                    <text
                      x={BOX.x0 - 9}
                      y={y + 3.5}
                      textAnchor="end"
                      fontSize="9.5"
                      fill="var(--color-n-400)"
                    >
                      {(ceiling / 5) * mark}
                    </text>
                  </g>
                );
              })
            : null}

          {drawn ? (
            <>
              <path d={drawn.area} fill="url(#entries-per-day-fill)" />
              <path
                d={drawn.line}
                fill="none"
                stroke="var(--color-teal)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {[...new Set([0, Math.round((days - 1) / 3), Math.round(((days - 1) * 2) / 3), days - 1])].map(
                (index) => (
                  <text
                    key={index}
                    x={drawn.points[index][0]}
                    y={166}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill="var(--color-n-400)"
                  >
                    {dayOf(nowS, index, days).getDate()}
                  </text>
                ),
              )}
            </>
          ) : null}

          {drawn && hover !== null ? (
            <g aria-hidden>
              <line
                x1={tipX}
                y1={drawn.points[hover][1]}
                x2={tipX}
                y2={BOX.yBase}
                stroke="var(--color-teal-300)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle
                cx={tipX}
                cy={drawn.points[hover][1]}
                r="4.5"
                fill="var(--color-paper)"
                stroke="var(--color-teal)"
                strokeWidth="2.5"
              />
              <rect
                x={tipCentre - 40}
                y={BOX.yTop}
                width="80"
                height="30"
                rx="6"
                fill="var(--color-ink)"
              />
              <text
                x={tipCentre}
                y={BOX.yTop + 13}
                textAnchor="middle"
                fontSize="8.5"
                fill="var(--color-n-400)"
              >
                {SHORT.format(dayOf(nowS, hover, days))}
              </text>
              <text
                x={tipCentre}
                y={BOX.yTop + 24}
                textAnchor="middle"
                fontSize="11"
                fontWeight="500"
                fill="var(--color-paper)"
              >
                {values[hover] === 1 ? "1 entry" : `${values[hover]} entries`}
              </text>
            </g>
          ) : null}

          {drawn
            ? values.map((_, index) => (
                <rect
                  key={index}
                  data-testid="day-hit"
                  x={drawn.points[index][0] - step / 2}
                  y={BOX.yTop}
                  width={step}
                  height={BOX.yBase - BOX.yTop}
                  fill="transparent"
                  onMouseEnter={() => setHover(index)}
                />
              ))
            : null}
        </svg>

        {drawn ? null : (
          <p className="absolute inset-0 grid place-items-center text-sm text-n-500">
            No entries in the last {days} days
          </p>
        )}
      </div>
    </section>
  );
}
