"use client";

/**
 * Every entry in the race, searchable by bib or wallet.
 *
 * Never by name. Runner names are encrypted in the vault and this page never
 * holds them; the placeholder says what can be searched so nobody types a name
 * into a box that quietly finds nothing.
 *
 * The toolbar sits outside the card and the card holds only the table
 * (spec, "Decisions taken"). Filters are plain selects with no active colour.
 *
 * The Add-ons column waits for STE-42: until every record carries its
 * add-ons, the column is not drawn and the third card reads "Add-ons sold"
 * from the chain instead. Neither shows a guess.
 */
import { useQueryClient } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { useState } from "react";

import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEventAddOns } from "@/hooks/useEvents";
import { useRaceRecords, useRaceRecordsFailed } from "@/hooks/useRaceRecords";
import type { EventSummary } from "@/lib/events";
import type { IndexedRecord } from "@/lib/records";
import { formatEventDate, shortAddress } from "@/utils/format";

import {
  addOnsToHandOut,
  entryStatus,
  filterEntries,
  packsCollected,
  type EntryStatus,
  type StatusFilter,
} from "../race";
import { StatCard } from "./StatCard";

const STATUS: Record<EntryStatus, { label: string; variant: "success" | "warning" | "muted" }> = {
  "not-collected": { label: "Not collected", variant: "warning" },
  collected: { label: "Pack collected", variant: "success" },
  finished: { label: "Finished", variant: "success" },
  dnf: { label: "Did not finish", variant: "muted" },
};

/** Neutral, like every filter here: no colour for a chosen value. */
const TRIGGER = "h-9 border-n-200 bg-paper text-ink";

/** Radix Select refuses an empty value, so "no filter" has a word of its own. */
const ALL = "all";
const HEAD = "bg-n-100 px-4 py-2.5 text-left font-medium whitespace-nowrap text-n-600";
const CELL = "border-b border-n-200 px-4 py-3 align-middle whitespace-nowrap";

export function EntriesTab({ summary }: { summary: EventSummary }) {
  const { eventId } = summary.event;
  const queryClient = useQueryClient();
  const addOns = useEventAddOns(eventId);
  const records = useRaceRecords([eventId]).get(eventId);
  const failed = useRaceRecordsFailed(eventId);

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");

  if (failed) {
    return (
      <ErrorNotice
        title="We could not load the entries"
        detail="This is a connection problem, not an empty race. Please try again."
        onRetry={() => void queryClient.invalidateQueries({ queryKey: ["race-records", eventId] })}
      />
    );
  }

  if (records === undefined) {
    return (
      <div
        role="status"
        aria-label="Loading entries"
        className="h-80 animate-pulse rounded-lg bg-n-100"
      />
    );
  }

  const quota = summary.categories.reduce((sum, category) => sum + category.quota, 0);
  const codes = new Map(summary.categories.map((category) => [category.categoryId, category.code]));
  const addOnCodes = new Map((addOns.data ?? []).map((addOn) => [addOn.addonId, addOn.code]));

  const collected = packsCollected(records);
  const owed = addOnsToHandOut(records);
  const showAddOns = owed !== null && records.length > 0;
  const sold = (addOns.data ?? []).reduce((sum, addOn) => sum + addOn.reservedCount, 0);
  const stock = (addOns.data ?? []).reduce((sum, addOn) => sum + addOn.quota, 0);
  const shown = filterEntries(records, { query, categoryId, status });

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Entries"
          value={records.length.toLocaleString("en-US")}
          unit={`of ${quota.toLocaleString("en-US")}`}
        />
        <StatCard
          label="Race packs still to hand out"
          value={(records.length - collected).toLocaleString("en-US")}
        />
        {showAddOns ? (
          <StatCard label="Add-ons to hand out" value={(owed ?? 0).toLocaleString("en-US")} />
        ) : (
          <StatCard
            label="Add-ons sold"
            value={sold.toLocaleString("en-US")}
            unit={stock > 0 ? `of ${stock.toLocaleString("en-US")}` : undefined}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-n-400"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a bib number or a wallet"
            aria-label="Search a bib number or a wallet"
            className="pl-9"
          />
        </div>
        <Select
          value={categoryId === null ? ALL : String(categoryId)}
          onValueChange={(value) => setCategoryId(value === ALL ? null : Number(value))}
        >
          <SelectTrigger aria-label="Distance" className={TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={ALL}>All distances</SelectItem>
            {summary.categories.map((category) => (
              <SelectItem key={category.categoryId} value={String(category.categoryId)}>
                {category.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
          <SelectTrigger aria-label="Status" className={TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={ALL}>All statuses</SelectItem>
            {(Object.keys(STATUS) as EntryStatus[]).map((key) => (
              <SelectItem key={key} value={key}>
                {STATUS[key].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-n-500">
          {shown.length === 1 ? "1 entry" : `${shown.length.toLocaleString("en-US")} entries`}
        </span>
      </div>

      {/* With nothing in the table, the card takes the rest of the screen
          (Ancung, 2026-09-14): a short empty box under three cards left most
          of the page blank. */}
      <section
        className={`overflow-hidden rounded-lg border border-n-200 bg-paper ${
          shown.length === 0 ? "grid flex-1 place-items-center" : ""
        }`}
      >
        {records.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-n-500">Nobody has entered yet</p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-n-500">No entries match</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th scope="col" className={HEAD}>
                    Wallet
                  </th>
                  <th scope="col" className={HEAD}>
                    Bib
                  </th>
                  <th scope="col" className={HEAD}>
                    Distance
                  </th>
                  <th scope="col" className={HEAD}>
                    Entered
                  </th>
                  <th scope="col" className={HEAD}>
                    Status
                  </th>
                  {showAddOns ? (
                    <th scope="col" className={HEAD}>
                      Add-ons
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {shown.map((record) => (
                  <EntryRow
                    key={record.tokenId}
                    record={record}
                    code={codes.get(record.categoryId) ?? `Distance ${record.categoryId}`}
                    addOns={
                      showAddOns
                        ? (record.addonIds ?? []).map((id) => addOnCodes.get(id) ?? `Add-on ${id}`)
                        : null
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function EntryRow({
  record,
  code,
  addOns,
}: {
  record: IndexedRecord;
  code: string;
  addOns: string[] | null;
}) {
  const status = STATUS[entryStatus(record)];
  return (
    <tr>
      <td className={`numeric text-ink ${CELL}`} title={record.runnerAddress}>
        {shortAddress(record.runnerAddress, 8, 7)}
      </td>
      <td className={`numeric ${CELL}`}>{record.bibNo}</td>
      <td className={`text-ink ${CELL}`}>{code}</td>
      <td className={`text-n-600 ${CELL}`}>{formatEventDate(record.enteredAt)}</td>
      <td className={CELL}>
        <Badge variant={status.variant}>{status.label}</Badge>
      </td>
      {addOns === null ? null : (
        <td className={`text-ink ${CELL}`}>{addOns.length === 0 ? "None" : addOns.join(", ")}</td>
      )}
    </tr>
  );
}
