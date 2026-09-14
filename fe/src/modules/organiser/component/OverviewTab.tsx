"use client";

/**
 * A race at a glance: how full, how much taken, how many packs out, and what
 * is moving.
 *
 * Money and places come from the chain; the race's activity comes from the
 * index. When the index does not answer, the cards that depend on it say "Not
 * loaded" rather than 0, because zero race packs collected on race morning is
 * a finding and a timeout is not.
 */
import { useEventAddOns } from "@/hooks/useEvents";
import { useNowSeconds } from "@/hooks/useNowSeconds";
import { useRaceRecords, useRaceRecordsFailed } from "@/hooks/useRaceRecords";
import type { EventSummary } from "@/lib/events";
import { entriesPerDay } from "@/lib/records";
import { formatAmount } from "@/utils/format";

import { packsCollected, raceTotals, recentActivity } from "../race";
import { ActivityFeed } from "./ActivityFeed";
import { AddOnsPanel } from "./AddOnsPanel";
import { DistanceRings } from "./DistanceRings";
import { EntriesPerDay } from "./EntriesPerDay";
import { StatCard } from "./StatCard";

const DAYS = 14;
const ACTIVITY_ROWS = 5;

function share(part: number, whole: number): number | undefined {
  return whole > 0 ? part / whole : undefined;
}

export function OverviewTab({ summary }: { summary: EventSummary }) {
  const { eventId } = summary.event;
  const nowS = useNowSeconds();
  const addOns = useEventAddOns(eventId);
  const records = useRaceRecords([eventId]).get(eventId);
  const recordsFailed = useRaceRecordsFailed(eventId);
  const recordsLoading = records === undefined && !recordsFailed;

  const totals = raceTotals(summary.categories, addOns.data ?? []);
  const collected = records === undefined ? null : packsCollected(records);
  const collectedValue =
    collected !== null ? collected.toLocaleString("en-US") : recordsFailed ? "Not loaded" : "...";

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Entries"
          value={totals.entered.toLocaleString("en-US")}
          unit={`of ${totals.quota.toLocaleString("en-US")}`}
          filled={share(totals.entered, totals.quota)}
        />
        <StatCard
          label="Payments received"
          value={formatAmount(totals.received)}
          unit={`of ${formatAmount(totals.potential)} sUSD`}
          filled={share(Number(totals.received), Number(totals.potential))}
        />
        <StatCard
          label="Race packs collected"
          value={collectedValue}
          unit={collected === null ? undefined : `of ${totals.entered.toLocaleString("en-US")}`}
          filled={collected === null ? undefined : share(collected, totals.entered)}
          tone="success"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        {nowS === undefined ? (
          <div className="h-60 animate-pulse rounded-lg bg-n-100" />
        ) : (
          <EntriesPerDay values={entriesPerDay(records ?? [], nowS, DAYS)} nowS={nowS} />
        )}
        <DistanceRings categories={summary.categories} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <ActivityFeed
          items={recentActivity(records ?? [], summary.categories, ACTIVITY_ROWS)}
          nowS={nowS}
          loading={recordsLoading}
          failed={recordsFailed}
        />
        <AddOnsPanel addOns={addOns.data} failed={addOns.isError} />
      </div>
    </>
  );
}
