"use client";

/**
 * STE-13 — the public event directory, read from the chain on every visit.
 *
 * Four states, and the distinction between three of them is the whole point of
 * the page: loading, empty, failed, and a list. An empty registry and an
 * unreachable RPC must never look alike, because "no races exist" is a claim
 * about the protocol and "we could not ask" is a claim about the network.
 *
 * The refresh control is here for the acceptance scenario in the ticket:
 * create an event with the CLI or the organiser console, press refresh, and it
 * appears without this app being rebuilt or redeployed. Nothing about this page
 * is baked in at build time.
 */
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/elements/Button";
import { EmptyState } from "@/components/elements/EmptyState";
import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { ChainSource } from "@/components/layouts/ChainSource";
import { eventKeys, useEvents } from "@/hooks/useEvents";

import { DirectorySkeleton } from "./component/DirectorySkeleton";
import { EventCard } from "./component/EventCard";

export function Directory() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, isFetching, refetch } = useEvents();

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: eventKeys.all });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="heading-hero text-4xl text-ink sm:text-5xl">Races</h1>
          <p className="mt-3 text-lg text-n-600">
            Every race here is read live from the Stellar testnet. Nothing on this page comes from a
            database of ours.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={isFetching}>
          {isFetching ? "Refreshing" : "Refresh"}
        </Button>
      </header>

      {isPending ? <DirectorySkeleton /> : null}

      {isError ? (
        <ErrorNotice
          title="The event registry could not be read"
          detail="This is a network or node problem, not an empty directory. The races are still on chain."
          onRetry={() => void refetch()}
        />
      ) : null}

      {data && data.events.length === 0 ? (
        <EmptyState title="No events yet">
          The registry on this network holds no events. One created with the organiser console shows
          up here on the next refresh.
        </EmptyState>
      ) : null}

      {data && data.events.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.events.map((summary) => (
            <EventCard key={summary.event.eventId} summary={summary} />
          ))}
        </div>
      ) : null}

      {data && data.unreadable.length > 0 ? (
        <p className="text-sm text-n-500">
          {data.unreadable.length} events could not be read from the registry. Ledger entries expire
          on Soroban, so an old event may need its state restored before it can be shown again.
        </p>
      ) : null}

      <ChainSource />
    </div>
  );
}
