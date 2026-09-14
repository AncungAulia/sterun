"use client";

/**
 * STE-17 - `/org/events/[id]`, one race.
 *
 * Read fresh from the chain with `useEvent`, not picked out of the dashboard's
 * list: this is the page an organiser changes the race from, and what it shows
 * after a signature has to be the race as it now is.
 *
 * A race another wallet created is readable by anyone and manageable by nobody
 * but its organiser, so it gets one sentence and a way back, not three tabs of
 * buttons that would each fail at the wallet prompt.
 */
import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { EventStatusBadge } from "@/components/elements/EventStatusBadge";
import { useEvent } from "@/hooks/useEvents";
import { useWallet } from "@/hooks/useWallet";

import { ConsoleHeader } from "./component/ConsoleHeader";
import { EntriesTab } from "./component/EntriesTab";
import { useNeedsContext } from "./component/NeedsContext";
import { NotYourRace } from "./component/NotYourRace";
import { OverviewTab } from "./component/OverviewTab";
import { RaceTabs } from "./component/RaceTabs";
import { ScannersTab } from "./component/ScannersTab";
import { StatusAction } from "./component/StatusAction";
import { UrgentBanner } from "./component/UrgentBanner";
import type { RaceTab } from "./race-tab";

export function RaceConsole({ eventId, tab }: { eventId: number; tab: RaceTab }) {
  const { address } = useWallet();
  const { data, isPending, isError, refetch } = useEvent(eventId);
  const needs = useNeedsContext();

  // The console layout's gate has already established there is one.
  if (!address) return null;

  if (isPending) {
    return (
      <>
        <ConsoleHeader title="Race" />
        <div
          role="status"
          aria-label="Loading this race"
          className="flex flex-col gap-3 px-4 py-6 md:px-6"
        >
          <div className="h-24 animate-pulse rounded-lg bg-n-100" />
          <div className="h-64 animate-pulse rounded-lg bg-n-100" />
        </div>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <ConsoleHeader title="Race" />
        <div className="px-4 py-6 md:px-6">
          <ErrorNotice
            title="We could not load this race"
            detail="This is a connection problem, or the link points at a race that does not exist. Please try again."
            onRetry={() => void refetch()}
          />
        </div>
      </>
    );
  }

  if (data.event.organiser !== address) {
    return <NotYourRace />;
  }

  // The same rule as the dashboard: one interruption at most, and only this
  // race's. The bell still carries every race's needs.
  const urgent = needs.find((need) => need.urgent && need.eventId === eventId);

  return (
    <>
      {/* Pinned, so a long entries table scrolls under the race's name, its
          status, its one action and the way to the other tabs rather than
          taking them off screen. */}
      <div className="sticky top-0 z-20">
        <ConsoleHeader
          title={data.event.name}
          badge={<EventStatusBadge status={data.event.status} />}
          action={<StatusAction summary={data} />}
        />
        <RaceTabs eventId={eventId} current={tab} />
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-6 md:px-6">
        {urgent ? <UrgentBanner need={urgent} /> : null}
        {tab === "overview" ? <OverviewTab summary={data} /> : null}
        {tab === "entries" ? <EntriesTab summary={data} /> : null}
        {tab === "scanners" ? <ScannersTab summary={data} /> : null}
      </div>
    </>
  );
}
