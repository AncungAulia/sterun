"use client";

/**
 * STE-13 — one event, read from the chain.
 *
 * The page is built around the categories, because a category is what a runner
 * enters: each has its own price, its own quota and its own remaining places,
 * and there is no such thing as entering "the event". That is why there is no
 * single enter button anywhere on this page.
 *
 * The off-chain document is a separate read with its own failure mode, and it
 * is kept visibly separate. Everything above it comes from the contract and is
 * as true as the ledger; the document is only as true as its hash check, which
 * is why that check is stated rather than assumed.
 *
 * Not here, deliberately: the Overview / Timeline / People tabs from
 * WEB_APP_IA.md §3.1. People needs runner pages to link to (STE-24) and a
 * timeline needs the phase dates that live in the document, which no event on
 * testnet currently serves. Three tabs where two are empty is worse than one
 * page that says what it knows.
 */
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/elements/EmptyState";
import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { EventStatusBadge } from "@/components/elements/EventStatusBadge";
import { ChainSource } from "@/components/layouts/ChainSource";
import { useEvent } from "@/hooks/useEvents";
import { useEventMetadata } from "@/hooks/useEventMetadata";
import { EXPLORER_BASE } from "@/lib/env";
import { formatEventDateTime, shortAddress } from "@/utils/format";

import { CategoryRow } from "./component/CategoryRow";
import { EventDocument } from "./component/EventDocument";

export function EventDetail({ eventId }: { eventId: number }) {
  const { data, isPending, isError, refetch } = useEvent(eventId);
  const metadata = useEventMetadata(data?.event.uri ?? "", data?.event.metadataHash ?? "");

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-12">
        <div role="status" aria-label="Reading this event from the chain">
          <div className="h-9 w-2/3 animate-pulse rounded-sm bg-n-100" />
          <div className="mt-4 h-5 w-1/3 animate-pulse rounded-sm bg-n-100" />
          <div className="mt-10 h-40 w-full animate-pulse rounded-lg bg-n-100" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-12">
        <ErrorNotice
          title="This event could not be read"
          detail="The registry has no event with this id, or the node could not be reached. Check the link, or go back to the directory."
          onRetry={() => void refetch()}
        />
        <Link href="/" className="mt-6 inline-block text-base text-teal-500 underline underline-offset-4">
          Back to all races
        </Link>
      </div>
    );
  }

  const { event, categories } = data;
  const openForEntry = event.status === "Open";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-12">
      <div>
        <Link href="/" className="text-sm text-teal-500 underline underline-offset-4">
          All races
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="heading-hero text-4xl text-ink">{event.name}</h1>
            <p className="numeric mt-2 text-lg text-n-600">{formatEventDateTime(event.startsAt)}</p>
          </div>
          <EventStatusBadge status={event.status} />
        </div>
        <p className="mt-4 text-sm text-n-500">
          Organised by{" "}
          {EXPLORER_BASE ? (
            <a
              href={`${EXPLORER_BASE}/account/${event.organiser}`}
              target="_blank"
              rel="noreferrer"
              className="numeric text-teal-500 underline underline-offset-4"
            >
              {shortAddress(event.organiser, 6, 6)}
            </a>
          ) : (
            <span className="numeric">{shortAddress(event.organiser, 6, 6)}</span>
          )}
        </p>
      </div>

      <Card className="gap-0 px-6 py-2">
        <div className="flex items-baseline justify-between gap-4 border-b border-n-200 py-4">
          <h2 className="heading text-xl text-n-700">Categories</h2>
          {!openForEntry ? (
            <p className="text-sm text-n-500">This event is not open for entries.</p>
          ) : null}
        </div>

        {categories.length === 0 ? (
          <div className="py-6">
            <EmptyState title="No categories yet">
              The organiser has created this event but has not added a distance to it. Categories are
              added one at a time, so this may be a race still being set up.
            </EmptyState>
          </div>
        ) : (
          <ul>
            {categories.map((category) => (
              <CategoryRow
                key={category.categoryId}
                category={category}
                openForEntry={openForEntry}
              />
            ))}
          </ul>
        )}
      </Card>

      <EventDocument
        result={metadata.data}
        isPending={metadata.isPending && metadata.fetchStatus !== "idle"}
        startsAt={event.startsAt}
      />

      <ChainSource />
    </div>
  );
}
