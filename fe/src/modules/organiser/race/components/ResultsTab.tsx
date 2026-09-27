"use client";

/**
 * The Results tab: upload a finish list, read what the review made of it,
 * record the rest (STE-58).
 *
 * The tab has three faces and they are decided in this order:
 *
 * 1. **A file is loaded** — the review, whatever else is true. It is the thing
 *    the organiser is in the middle of.
 * 2. **Results are already on chain** — what was published, because that is
 *    what this tab is opened for from then on. Another file can still be
 *    uploaded for the runners who have none: nothing already recorded is
 *    touched, and the contract refuses a second result anyway.
 * 3. **Neither** — the drop card, and nothing else.
 *
 * The signing button is not here. It lives in the console header with every
 * other tab's one action, and reads the same file through `ResultsContext`.
 */
import { useQueryClient } from "@tanstack/react-query";

import { ErrorNotice } from "@/components/feedback/ErrorNotice";
import { Badge } from "@/components/ui/badge";
import type { EventSummary } from "@/lib/event/events";
import { StatCard } from "@/modules/organiser/shared/components/StatCard";
import {
  useRaceRecords,
  useRaceRecordsFailed,
} from "@/modules/organiser/shared/hooks/useRaceRecords";
import type { IndexedRecord } from "@/modules/organiser/shared/lib/records";
import { formatFinishTime } from "@/utils/format";

import { ResultsDrop } from "./ResultsDrop";
import { ResultsReviewPanel } from "./ResultsReviewPanel";
import { useResultsContext } from "./ResultsContext";

const HEAD = "bg-n-100 px-4 py-2.5 text-left font-medium whitespace-nowrap text-n-600";
const CELL = "border-b border-n-200 px-4 py-3 align-middle whitespace-nowrap";

/** A record carries a result once it is out of the two states before one. */
function hasResult(record: IndexedRecord): boolean {
  return record.state === "Finished" || record.state === "Dnf";
}

export function ResultsTab({ summary }: { summary: EventSummary }) {
  const { eventId } = summary.event;
  const { loaded } = useResultsContext();
  const queryClient = useQueryClient();
  const records = useRaceRecords([eventId]).get(eventId);
  const failed = useRaceRecordsFailed(eventId);

  if (loaded) return <ResultsReviewPanel summary={summary} />;

  if (failed) {
    return (
      <ErrorNotice
        title="We could not load this race's results"
        detail="This is a connection problem, not an empty race. You can still upload a file once it clears."
        onRetry={() => void queryClient.invalidateQueries({ queryKey: ["race-records", eventId] })}
      />
    );
  }

  if (records === undefined) {
    return <div role="status" aria-label="Loading results" className="h-64 skeleton rounded-lg" />;
  }

  const recorded = records.filter(hasResult);
  if (recorded.length === 0) return <ResultsDrop eventId={eventId} />;

  const codes = new Map(summary.categories.map((category) => [category.categoryId, category.code]));
  const timed = recorded.filter((record) => record.finishTimeS !== null).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Results recorded" value={recorded.length.toLocaleString("en-US")} />
        <StatCard label="With a time" value={timed.toLocaleString("en-US")} />
        <StatCard
          label="Untimed or did not finish"
          value={(recorded.length - timed).toLocaleString("en-US")}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-n-200 bg-paper">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className={HEAD}>Bib</th>
              <th className={HEAD}>Distance</th>
              <th className={HEAD}>Result</th>
            </tr>
          </thead>
          <tbody>
            {recorded.map((record) => (
              <tr key={record.tokenId}>
                <td className={`${CELL} numeric`}>{record.bibNo}</td>
                <td className={CELL}>{codes.get(record.categoryId) ?? "Unknown"}</td>
                <td className={CELL}>
                  {record.state === "Dnf" ? (
                    <Badge variant="warning">Did not finish</Badge>
                  ) : record.finishTimeS === null ? (
                    <Badge variant="muted">No official time</Badge>
                  ) : (
                    <span className="numeric">{formatFinishTime(record.finishTimeS)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-n-600">
          Runners with no result yet can be added by uploading another file. Nothing already recorded
          is touched.
        </p>
        <ResultsDrop eventId={eventId} />
      </div>
    </div>
  );
}
