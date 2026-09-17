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
import { ErrorNotice } from "@/components/feedback/ErrorNotice";
import { EventStatusBadge } from "@/components/feedback/EventStatusBadge";
import { useEvent } from "@/hooks/useEvents";
import { useWallet } from "@/hooks/useWallet";

import { AddPlaces } from "./components/AddPlaces";
import { ConsoleHeader } from "@/modules/organiser/shared/components/ConsoleHeader";
import { EntriesTab } from "./components/EntriesTab";
import { useNeedsContext } from "@/modules/organiser/shared/components/NeedsContext";
import { NotYourRace } from "./components/NotYourRace";
import { OverviewTab } from "./components/OverviewTab";
import { RaceTabs } from "./components/RaceTabs";
import { ScannersTab } from "./components/ScannersTab";
import { StatusAction } from "./components/StatusAction";
import { UrgentBanner } from "@/modules/organiser/shared/components/UrgentBanner";
import type { RaceTab } from "./lib/race-tab";

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
          <div className="h-24 skeleton rounded-lg" />
          <div className="h-64 skeleton rounded-lg" />
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
          action={
            // Two buttons on a race that can still take entries (STE-57):
            // closing stays, because until entries close on their own at the
            // registration end date (STE-46) it is the only thing that stops
            // them, and adding places is the main one.
            <>
              <StatusAction summary={data} />
              <AddPlaces summary={data} />
            </>
          }
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
