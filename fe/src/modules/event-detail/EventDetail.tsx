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
 * ## Why the poster and the entry card sit together, above the tabs
 *
 * A runner arrives with one question, and it is not "what is in the race
 * pack". Can I enter, what does it cost, is there room. That is the card on
 * the right, it is entirely chain state, and it stays put while the tabs
 * change under it. The tabs are the reading, and reading is what people do
 * second.
 */
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { ErrorNotice } from "@/components/elements/ErrorNotice";
import { ChainSource } from "@/components/layouts/ChainSource";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEvent, useEventAddOns } from "@/hooks/useEvents";
import { useEventMetadata } from "@/hooks/useEventMetadata";

import { EntryCard } from "./component/EntryCard";
import { TabAddOns } from "./component/TabAddOns";
import { TabCategories } from "./component/TabCategories";
import { TabDetails } from "./component/TabDetails";
import { TabProofs } from "./component/TabProofs";
import { TabTerms } from "./component/TabTerms";
import { TabTimeline } from "./component/TabTimeline";

export function EventDetail({ eventId }: { eventId: number }) {
  const { data, isPending, isError, refetch } = useEvent(eventId);
  const metadata = useEventMetadata(data?.event.uri ?? "", data?.event.metadataHash ?? "");
  const addOns = useEventAddOns(eventId);
  const [tab, setTab] = useState("details");

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

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        {document?.posterUrl ? (
          <Image
            src={document.posterUrl}
            alt=""
            width={1200}
            height={900}
            unoptimized
            /* Contained, not cover: the poster is whatever the organiser had,
               at whatever shape it was, and cropping a portrait one to fill a
               landscape box cuts the date off the bottom of half of them. */
            className="max-h-[26rem] w-full rounded-lg border border-n-200 object-contain"
          />
        ) : (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-n-300">
            <p className="text-sm text-n-500">This race has not published a poster.</p>
          </div>
        )}

        <EntryCard event={event} categories={categories} onEnter={() => setTab("categories")} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="terms">Terms</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="categories">Distances</TabsTrigger>
          <TabsTrigger value="add-ons">Race pack</TabsTrigger>
          <TabsTrigger value="proofs">Proofs</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <TabDetails
            document={document}
            organiser={event.organiser}
            startsAt={event.startsAt}
          />
        </TabsContent>

        <TabsContent value="terms">
          <TabTerms terms={document?.terms} />
        </TabsContent>

        <TabsContent value="timeline">
          <TabTimeline document={document ?? {}} startsAt={event.startsAt} />
        </TabsContent>

        <TabsContent value="categories">
          <TabCategories categories={categories} openForEntry={event.status === "Open"} />
        </TabsContent>

        <TabsContent value="add-ons">
          <TabAddOns items={document?.addOns ?? []} onChain={addOns.data ?? []} />
        </TabsContent>

        <TabsContent value="proofs">
          <TabProofs
            result={metadata.data}
            uri={event.uri}
            metadataHash={event.metadataHash}
            startsAt={event.startsAt}
          />
        </TabsContent>
      </Tabs>

      <ChainSource />
    </div>
  );
}
