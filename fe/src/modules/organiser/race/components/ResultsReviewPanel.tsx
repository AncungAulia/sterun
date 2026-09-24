"use client";

/**
 * A reviewed file, shaped like the Entries tab: a strip for what is being left
 * out, three counts, a search, the table.
 *
 * ## The held strip
 *
 * Only drawn when the file has rows that cannot be published, so a clean file
 * never sees it. It lists them in file order with the backend's own sentence,
 * never the anomaly's code: an organiser can act on "bib 88 exists in both 10K
 * and 5K", and can do nothing with `ambiguous_bib`.
 *
 * **There is no way to force a held row through from here.** The way forward is
 * a corrected file, which costs nothing, against a published result, which
 * cannot be corrected by anyone.
 *
 * ## The table shows every row, not only the good ones
 *
 * A row that is being left out is the one an organiser most needs to find, and
 * hiding it would make the file look shorter than it is. Held rows carry the
 * word Held rather than a colour alone.
 */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/modules/organiser/shared/components/StatCard";
import type { EventSummary } from "@/lib/event/events";
import { formatFinishTime } from "@/utils/format";

import {
  heldRows,
  publishableByKind,
  worstSeverity,
  type ReviewedRow,
} from "../lib/results-preview";
import { useResultsContext } from "./ResultsContext";

const HEAD = "bg-n-100 px-4 py-2.5 text-left font-medium whitespace-nowrap text-n-600";
const CELL = "border-b border-n-200 px-4 py-3 align-middle whitespace-nowrap";

function matches(row: ReviewedRow, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  return String(row.bibNo ?? "").includes(trimmed);
}

function resultText(row: ReviewedRow): string {
  if (row.kind === "timed" && row.finishTimeS !== null) return formatFinishTime(row.finishTimeS);
  if (row.kind === "untimed") return "No official time";
  if (row.kind === "dnf") return "Did not finish";
  return "Could not be read";
}

export function ResultsReviewPanel({ summary }: { summary: EventSummary }) {
  const { loaded, setLoaded } = useResultsContext();
  const [query, setQuery] = useState("");
  if (!loaded) return null;

  const { review, fileName } = loaded;
  const held = heldRows(review);
  const kinds = publishableByKind(review);
  const codes = new Map(summary.categories.map((category) => [category.categoryId, category.code]));
  const shown = review.rows.filter((row) => matches(row, query));

  return (
    <div className="flex flex-col gap-4">
      {held.length > 0 ? (
        <section
          aria-label="Rows being left out"
          className="flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger-surface px-5 py-4"
        >
          <p className="heading-strong text-base text-ink">
            {held.length === 1 ? "1 row is being left out." : `${held.length} rows are being left out.`}
          </p>
          <p className="text-sm text-n-700">
            Fix them in the file and upload it again. Nothing on this list can be recorded.
          </p>
          <ul className="flex flex-col gap-1 text-sm text-n-700">
            {held.map((row) => (
              <li key={row.line} className="numeric">
                Line {row.line}
                {row.bibNo === null ? "" : `, bib ${row.bibNo}`}:{" "}
                <span className="font-sans">{row.anomalies[0]?.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Finished with a time" value={kinds.timed.toLocaleString("en-US")} />
        <StatCard label="Finished, no time" value={kinds.untimed.toLocaleString("en-US")} />
        <StatCard label="Did not finish" value={kinds.dnf.toLocaleString("en-US")} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          aria-label="Search a bib number"
          placeholder="Search a bib number"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 max-w-64"
        />
        <Button variant="outline" size="sm" onClick={() => setLoaded(null)}>
          Choose another file
        </Button>
        <p className="numeric ml-auto text-sm text-n-500">
          {fileName} &middot; {review.counts.total.toLocaleString("en-US")} rows
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-n-200 bg-paper">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className={HEAD}>Bib</th>
              <th className={HEAD}>Distance</th>
              <th className={HEAD}>Result</th>
              <th className={HEAD}>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const severity = worstSeverity(row);
              return (
                <tr key={row.line} className={severity ? "bg-danger-surface/40" : undefined}>
                  <td className={`${CELL} numeric`}>{row.bibNo ?? "Not read"}</td>
                  <td className={CELL}>
                    {row.categoryId === null ? "Unknown" : (codes.get(row.categoryId) ?? "Unknown")}
                  </td>
                  <td className={`${CELL} numeric`}>{resultText(row)}</td>
                  <td className={CELL}>
                    {severity ? (
                      <Badge variant="destructive">Held</Badge>
                    ) : row.kind === "dnf" ? (
                      <Badge variant="warning">Did not finish</Badge>
                    ) : (
                      <Badge variant="success">Finished</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-n-600">No row in this file has that bib.</p>
        ) : null}
      </div>
    </div>
  );
}
