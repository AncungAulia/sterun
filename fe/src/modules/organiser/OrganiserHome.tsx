"use client";

/**
 * STE-17 — `/org`, the races this wallet organises.
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
 */
import Link from "next/link";

import { EmptyState } from "@/components/elements/EmptyState";
import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { WalletGate } from "@/components/layouts/WalletGate";
import { Button } from "@/components/ui/button";
import { useEvents } from "@/hooks/useEvents";
import { useCanCreateEvents } from "@/hooks/useOrganiser";
import { useWallet } from "@/hooks/useWallet";

import { NotAllowedNotice } from "./component/NotAllowedNotice";
import { OrganiserEventCard } from "./component/OrganiserEventCard";

export function OrganiserHome() {
  return (
    <WalletGate>
      <Console />
    </WalletGate>
  );
}

function Console() {
  const { address } = useWallet();
  const { allowed, isChecking } = useCanCreateEvents(address);
  const { data, isPending, isError, refetch } = useEvents();

  // WalletGate has already established there is one; this is for the types.
  if (!address) return null;

  const mine = data?.events.filter(({ event }) => event.organiser === address) ?? [];
  /*
    Hidden while the allowlist is being asked, so the button is never drawn and
    then taken away. Shown when the answer is anything but an explicit `false`:
    a node that failed to answer is not a refusal, and the wizard lets the
    wallet through on the same terms.
  */
  const canCreate = !isChecking && allowed !== false;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="heading-hero text-4xl text-ink sm:text-5xl">Organiser console</h1>
          <p className="mt-3 text-lg text-n-600">
            Every race you have created with this wallet, drafts included.
          </p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/org/new">Create event</Link>
          </Button>
        ) : null}
      </header>

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
        <div className="grid gap-4 sm:grid-cols-2">
          {mine.map((summary) => (
            <OrganiserEventCard key={summary.event.eventId} summary={summary} />
          ))}
        </div>
      ) : null}

      {data && data.unreadable.length > 0 ? (
        <p className="text-sm text-n-500">
          {/* Whose they were is exactly what could not be read, so the page
              cannot promise none of them belonged to this wallet. */}
          Some races could not be loaded, so one of yours may be missing from this list.
        </p>
      ) : null}
    </div>
  );
}

/** A public testnet node takes a second or two, and every event is its own read. */
function ConsoleSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading your races"
      className="grid gap-4 sm:grid-cols-2"
    >
      {[0, 1].map((row) => (
        <div key={row} className="rounded-lg border border-n-200 bg-paper p-6 shadow-card">
          <div className="h-6 w-2/3 animate-pulse rounded-sm bg-n-100" />
          <div className="mt-3 h-4 w-1/3 animate-pulse rounded-sm bg-n-100" />
          <div className="mt-6 h-4 w-full animate-pulse rounded-sm bg-n-100" />
          <div className="mt-2 h-4 w-full animate-pulse rounded-sm bg-n-100" />
        </div>
      ))}
    </div>
  );
}
