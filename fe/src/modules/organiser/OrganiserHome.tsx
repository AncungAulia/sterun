"use client";

/**
 * STE-17 - `/org`, the dashboard for the races this wallet organises.
 *
 * Built on the directory's own read rather than a second one. EventRegistry has
 * no "events by organiser" view, for the same reason it has no "list events"
 * (`lib/events.ts`), so the page reads every event and keeps the ones this
 * wallet created. Sharing the directory's query also means `/` and `/org` in
 * one visit ask the chain once.
 *
 * The allowlist decides one button, not the page. It gates `create_event` and
 * nothing else (STE-36): a wallet taken off it still runs the races it already
 * has, so those stay listed and only the way to publish a new one goes away.
 *
 * The cards used to be a grid, one per race. They are a table now, because the
 * question an organiser opens this page with is comparative: which of my races
 * is behind. A grid of cards answers "tell me about this one" and makes the
 * comparison a scroll.
 *
 * Every panel below is drawn only once there is a race to draw it about. Stat
 * cards reading zero over an empty state are three ways of saying the same
 * thing, and the empty state says it better.
 */
import Link from "next/link";

import { EmptyState } from "@/components/elements/EmptyState";
import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { Button } from "@/components/ui/button";
import { useEvents } from "@/hooks/useEvents";
import { useNowSeconds } from "@/hooks/useNowSeconds";
import { useCanCreateEvents } from "@/hooks/useOrganiser";
import { useRaceRecords } from "@/hooks/useRaceRecords";
import { useWallet } from "@/hooks/useWallet";
import type { EventSummary } from "@/lib/events";
import { entriesPerDay, trending } from "@/lib/records";
import { formatAmount } from "@/utils/format";

import { fillByDaysOut } from "./chart";
import { ConsoleHeader } from "./component/ConsoleHeader";
import { EntriesComparison, type ComparisonSeries } from "./component/EntriesComparison";
import { useNeedsContext } from "./component/NeedsContext";
import { NotAllowedNotice } from "./component/NotAllowedNotice";
import { RacesTable, type RaceRow } from "./component/RacesTable";
import { StatCard } from "./component/StatCard";
import { TrendingEntries } from "./component/TrendingEntries";
import { UrgentBanner } from "./component/UrgentBanner";

/** How far back the sparkline in each row looks. */
const SPARK_DAYS = 14;

/** How many live races the comparison chart carries beside the benchmark. */
const LIVE_COMPARED = 2;

/** The window the ranking reports on, and how many rows it keeps. */
const TRENDING_DAYS = 7;
const TRENDING_ROWS = 4;

interface Totals {
  published: number;
  entries: number;
  quota: number;
  received: bigint;
  potential: bigint;
}

/**
 * The three figures at the top, in one pass over the categories.
 *
 * `potential` is what a sell-out at today's prices would pay, and it is the
 * only honest denominator for `received`: money has no quota of its own, so
 * without it the figure is a number with nothing to compare it to.
 */
function totalsOf(events: readonly EventSummary[]): Totals {
  let entries = 0;
  let quota = 0;
  let received = 0n;
  let potential = 0n;

  for (const { categories } of events) {
    for (const category of categories) {
      entries += category.enteredCount;
      quota += category.quota;
      received += BigInt(category.enteredCount) * category.priceStroops;
      potential += BigInt(category.quota) * category.priceStroops;
    }
  }

  return {
    published: events.filter(({ event }) => event.status !== "Draft").length,
    entries,
    quota,
    received,
    potential,
  };
}

/**
 * The races worth putting on one chart, and which of them is the benchmark.
 *
 * Three lines, not thirty. The comparison only means anything against a race
 * that has already finished, so the most recent one that ran carries the
 * benchmark, and the races still to run are taken soonest first, because those
 * are the ones an organiser can still do something about.
 *
 * A race with no entries contributes no series at all. `fillByDaysOut` returns
 * an empty list for it rather than a line along the bottom, which would read as
 * a measurement of a race that has not been measured.
 */
function comparisonOf(
  events: readonly EventSummary[],
  records: ReadonlyMap<number, readonly { enteredAt: bigint }[]>,
  nowS: bigint,
): ComparisonSeries[] {
  const build = (summary: EventSummary): ComparisonSeries => ({
    name: summary.event.name,
    finished: summary.event.startsAt <= nowS,
    points: fillByDaysOut(
      records.get(summary.event.eventId) ?? [],
      summary.categories.reduce((sum, category) => sum + category.quota, 0),
      summary.event.startsAt,
      nowS,
    ),
  });

  const run = events.filter(({ event }) => event.startsAt <= nowS);
  const benchmark = run.sort((a, b) => (a.event.startsAt > b.event.startsAt ? -1 : 1)).at(0);

  const live = events
    .filter(({ event }) => event.startsAt > nowS)
    .sort((a, b) => (a.event.startsAt < b.event.startsAt ? -1 : 1))
    .slice(0, LIVE_COMPARED);

  return [...(benchmark ? [benchmark] : []), ...live].map(build);
}

export function OrganiserHome() {
  const { address } = useWallet();
  const { allowed, isChecking } = useCanCreateEvents(address);
  const { data, isPending, isError, refetch } = useEvents();
  const nowS = useNowSeconds();
  const needs = useNeedsContext();

  const mine = data?.events.filter(({ event }) => event.organiser === address) ?? [];
  const records = useRaceRecords(mine.map(({ event }) => event.eventId));

  // WalletGate has already established there is one; this is for the types.
  if (!address) return null;

  /*
    Hidden while the allowlist is being asked, so the button is never drawn and
    then taken away. Shown when the answer is anything but an explicit `false`:
    a node that failed to answer is not a refusal, and the wizard lets the
    wallet through on the same terms.
  */
  const canCreate = !isChecking && allowed !== false;

  /*
    Exactly one thing may interrupt, and `needs.ts` decides which. Everything
    else waits in the bell. If a second kind of need ever reaches this line the
    rule is already broken, so the banner takes the first urgent one rather than
    listing them: two banners is a policy, and a policy is not an interruption.
  */
  const urgent = needs.find((need) => need.urgent);

  const totals = totalsOf(mine);
  const comparison = nowS === undefined ? [] : comparisonOf(mine, records, nowS);
  const moving =
    nowS === undefined
      ? []
      : trending(
          mine.map(({ event, categories }) => ({
            eventId: event.eventId,
            eventName: event.name,
            categories,
            records: records.get(event.eventId) ?? [],
          })),
          nowS,
          TRENDING_DAYS,
          TRENDING_ROWS,
        );
  const rows: RaceRow[] =
    nowS === undefined
      ? []
      : mine.map(({ event, categories }) => ({
          eventId: event.eventId,
          name: event.name,
          startsAt: event.startsAt,
          status: event.status,
          entered: categories.reduce((sum, category) => sum + category.enteredCount, 0),
          quota: categories.reduce((sum, category) => sum + category.quota, 0),
          entriesPerDay: entriesPerDay(records.get(event.eventId) ?? [], nowS, SPARK_DAYS),
        }));

  return (
    <>
      <ConsoleHeader
        title="Dashboard"
        action={
          canCreate ? (
            <Button asChild>
              <Link href="/org/new">Create event</Link>
            </Button>
          ) : null
        }
      />

      {/* 16px at the sides on a phone, 24px from md: the same as the header
          above it, so the menu button and the first card share an edge. */}
      <div className="flex flex-1 flex-col gap-3 px-4 py-6 md:px-6">
        {urgent ? <UrgentBanner need={urgent} /> : null}

        {allowed === false ? <NotAllowedNotice address={address} /> : null}

        {isPending ? <ConsoleSkeleton /> : null}

        {isError ? (
          <ErrorNotice
            title="We could not load your races"
            detail="This is a connection problem, not an empty list. Your races are safe. Please try again."
            onRetry={() => void refetch()}
          />
        ) : null}

        {data && mine.length === 0 ? (
          <EmptyState title="You have not created a race yet">
            {allowed === false
              ? "Races show up here once this wallet is allowed to publish them."
              : "Races you publish with this wallet show up here."}
          </EmptyState>
        ) : null}

        {mine.length > 0 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Races published"
                value={String(totals.published)}
                unit={`of ${mine.length}`}
              />
              <StatCard
                label="Entries, all races"
                value={totals.entries.toLocaleString("en-US")}
                unit={`of ${totals.quota.toLocaleString("en-US")}`}
              />
              <StatCard
                label="Received, all races"
                value={formatAmount(totals.received)}
                unit={`of ${formatAmount(totals.potential)} sUSD`}
              />
            </div>

            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
              <EntriesComparison series={comparison} />
              <TrendingEntries rows={moving} days={TRENDING_DAYS} />
            </div>

            <section className="overflow-hidden rounded-lg border border-n-200 bg-paper">
              <h2 className="heading-strong px-4 pt-4 pb-3 text-sm text-ink">All races</h2>
              {/* The table is the one thing on this page allowed to scroll
                  sideways, and only inside its own card. */}
              <div className="overflow-x-auto">
                <RacesTable rows={rows} nowS={nowS ?? 0n} />
              </div>
            </section>
          </>
        ) : null}

        {data && data.unreadable.length > 0 ? (
          <p className="text-sm text-n-500">
            {/* Whose they were is exactly what could not be read, so the page
              cannot promise none of them belonged to this wallet. */}
            Some races could not be loaded, so one of yours may be missing from this list.
          </p>
        ) : null}
      </div>
    </>
  );
}

/** A public testnet node takes a second or two, and every event is its own read. */
function ConsoleSkeleton() {
  return (
    <div role="status" aria-label="Loading your races" className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((card) => (
          <div key={card} className="rounded-lg border border-n-200 bg-paper p-4">
            <div className="h-3 w-1/2 animate-pulse rounded-sm bg-n-100" />
            <div className="mt-3 h-7 w-2/3 animate-pulse rounded-sm bg-n-100" />
            <div className="mt-3 h-1.5 w-full animate-pulse rounded-full bg-n-100" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-n-200 bg-paper p-4">
        {[0, 1, 2].map((line) => (
          <div key={line} className="mt-3 h-5 w-full animate-pulse rounded-sm bg-n-100 first:mt-0" />
        ))}
      </div>
    </div>
  );
}
