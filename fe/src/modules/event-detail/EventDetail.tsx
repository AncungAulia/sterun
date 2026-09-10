"use client";

/**
 * One race, read from the chain and from its own frozen document.
 *
 * ## Two sources, kept apart on purpose
 *
 * The distances, their prices, their remaining places and the add-on stock all
 * come from the contract, and are as true as the ledger. Everything a person
 * reads — the poster, the description, the timeline, the rules — comes from a
 * file the organiser published, and is only as true as its hash check. So the
 * check is a tab of its own rather than a line somebody scrolls past, and a
 * document that fails it is withheld everywhere rather than shown under a
 * caution: a file that breaks its own commitment is exactly what this product
 * exists to catch.
 *
 * The page itself is drawn by `EventView`, which the organiser's review draws
 * too. This file is the half the review has no use for: fetching, waiting, and
 * proving what was fetched.
 */
import Link from "next/link";

import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { ChainSource } from "@/components/layouts/ChainSource";
import { useEvent, useEventAddOns } from "@/hooks/useEvents";
import { useEventMetadata } from "@/hooks/useEventMetadata";

import { EventView } from "./EventView";
import { TabProofs } from "./component/TabProofs";

export function EventDetail({ eventId }: { eventId: number }) {
  const { data, isPending, isError, refetch } = useEvent(eventId);
  const metadata = useEventMetadata(data?.event.uri ?? "", data?.event.metadataHash ?? "");
  const addOns = useEventAddOns(eventId);

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-12">
        <div role="status" aria-label="Reading this race from the chain">
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <div className="h-64 animate-pulse rounded-lg bg-n-100" />
            <div className="h-64 animate-pulse rounded-lg bg-n-100" />
          </div>
          <div className="mt-8 h-40 w-full animate-pulse rounded-lg bg-n-100" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-12">
        <ErrorNotice
          title="This race could not be read"
          detail="The registry has no event with this id, or the node could not be reached. Check the link, or go back to the directory."
          onRetry={() => void refetch()}
        />
        <Link
          href="/"
          className="mt-6 inline-block text-base text-teal-500 underline underline-offset-4"
        >
          Back to all races
        </Link>
      </div>
    );
  }

  const { event, categories } = data;
  /*
    Only a verified document is ever read from. `modified` and `unavailable`
    both mean there is nothing here that can be trusted, and the difference
    between them belongs in Proofs, not scattered through every tab.
  */
  const document = metadata.data?.status === "verified" ? metadata.data.document : undefined;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-12">
      <Link href="/" className="text-sm text-teal-500 underline underline-offset-4">
        All races
      </Link>

      <EventView
        event={event}
        categories={categories}
        document={document}
        addOns={addOns.data ?? []}
        proofs={
          <TabProofs
            result={metadata.data}
            uri={event.uri}
            metadataHash={event.metadataHash}
            startsAt={event.startsAt}
          />
        }
      />

      <ChainSource />
    </div>
  );
}
