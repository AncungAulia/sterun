"use client";

/**
 * One race record (P1, P2, P3). A card, not a table row: a table at 390px either
 * scrolls sideways or crushes the finish time.
 *
 * Every fact on it is the chain's, read over RPC, including the footer's
 * "Last updated", the latest of the record's own timestamps. That replaced a
 * ledger number (Ancung, 2026-09-16): it proves the same thing to a person who
 * cannot read a ledger. The one addition allowed to be missing is the link to
 * the latest transaction, from the index (`useRecordTrail`); with the index
 * down the footer links the RaceRecord contract instead, which is always true.
 *
 * The facts row follows the handoff's alignment rule: columns share the width,
 * each at least as wide as its own value, the last one against the right edge,
 * so "No official time" never breaks across two lines in a narrow third. The
 * two dates join the row from `md`, where there is room for five columns.
 */
import type { SterunRecord } from "@sterunxyz/sdk";

import { EXPLORER_BASE } from "@/lib/chain/env";
import type { EventSummary } from "@/lib/event/events";
import { cn } from "@/utils/cn";

import { useRecordTrail } from "../hooks/useRecordTrail";
import { formatFactDay, formatRaceDay, lastChangedAt } from "../lib/profile-summary";
import { recordDocument } from "../lib/record-document";
import { finishSlot, meaningOf } from "../lib/record-meaning";
import { ProveRecord } from "./ProveRecord";
import { RecordChip } from "./RecordChip";

export interface RecordCardProps {
  record: SterunRecord;
  summary: EventSummary | null;
  city: string | null;
  owner: string;
}

function Fact({
  label,
  value,
  absent = false,
  wide = false,
  align = "left",
}: {
  label: string;
  value: string;
  absent?: boolean;
  /** Shown from `md` only. */
  wide?: boolean;
  /**
   * Which column is last, per breakpoint, is written out rather than left to
   * `:last-child`: the last element is a date hidden on a phone, so the
   * selector would right-align nothing there.
   */
  align?: "left" | "right-on-phone" | "right-from-md";
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-rows-subgrid gap-1 [grid-row:span_2]",
        wide && "hidden md:grid",
        align === "right-on-phone" && "text-right md:text-left",
        align === "right-from-md" && "md:text-right",
      )}
    >
      <dt className="self-end text-xs text-n-600">{label}</dt>
      <dd className={cn("whitespace-nowrap", absent ? "text-sm text-n-600" : "text-base text-ink tabular-nums")}>
        {value}
      </dd>
    </div>
  );
}

export function RecordCard({ record, summary, city, owner }: RecordCardProps) {
  const meaning = meaningOf(record, summary?.event.status ?? null);
  const slot = finishSlot(meaning);
  const trail = useRecordTrail(record.tokenId);
  const document = recordDocument(record, summary, owner);

  const raceName = summary?.event.name ?? `Race ${record.eventId}`;
  const when = summary ? formatRaceDay(summary.event.startsAt) : null;
  const place = [city, when].filter(Boolean).join(", ");
  const category = summary?.categories.find((candidate) => candidate.categoryId === record.categoryId);

  const txHash = trail.data?.txHash ?? null;

  return (
    <article
      aria-label={raceName}
      className="flex flex-col gap-5 rounded-lg border border-n-200 bg-paper p-5 shadow-card md:p-6"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="heading-strong text-lg text-ink">{raceName}</h2>
          {place ? <p className="text-base text-n-600">{place}</p> : null}
        </div>
        <RecordChip kind={meaning.kind} />
      </header>

      <dl className="grid grid-flow-col grid-rows-[auto_auto] gap-x-4 [grid-auto-columns:minmax(max-content,1fr)]">
        <Fact label="Category" value={category?.code ?? "Unknown"} absent={!category} />
        <Fact label="Bib" value={String(record.bibNo)} />
        <Fact label="Finish time" value={slot.value} absent={slot.absent} align="right-on-phone" />
        <Fact label="Entered" value={formatFactDay(record.enteredAt)} wide />
        <Fact
          label="Race pack collected"
          value={record.claimedAt === null ? "Not yet" : formatFactDay(record.claimedAt)}
          absent={record.claimedAt === null}
          wide
          align="right-from-md"
        />
      </dl>

      <footer className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t border-n-200 pt-4 text-sm text-n-600 tabular-nums">
        <ProveRecord tokenId={record.tokenId} />
        <span className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
          <span>Last updated {formatFactDay(lastChangedAt(record))}</span>
        {txHash && EXPLORER_BASE ? (
          <a
            href={`${EXPLORER_BASE}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-teal-700 underline-offset-4 hover:underline"
          >
            Check on Stellar Expert
          </a>
        ) : document ? (
          <a
            href={document.links.record_contract}
            target="_blank"
            rel="noreferrer"
            className="text-teal-700 underline-offset-4 hover:underline"
          >
            Check on Stellar Expert
          </a>
        ) : null}
        </span>
      </footer>
    </article>
  );
}
