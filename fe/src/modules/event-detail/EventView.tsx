"use client";

/**
 * One race as a runner meets it: the poster and the entry card, then the tabs.
 *
 * ## Why this is its own component
 *
 * Two screens draw it. The public page draws a race read from the chain and
 * its verified document; the organiser's review draws a race that does not
 * exist yet, from what the wizard is about to sign. A review built from its
 * own markup is a second page that merely resembles this one, and every way
 * the two drift apart is something an organiser approves without having seen
 * it. So everything that has to be fetched stays in `EventDetail`, and this
 * takes the facts as props, wherever they came from.
 *
 * ## Why the poster and the entry card sit together, above the tabs
 *
 * A runner arrives with one question, and it is not "what is in the race
 * pack". Can I enter, what does it cost, is there room. That is the card on
 * the right, it is entirely chain state, and it stays put while the tabs
 * change under it. The tabs are the reading, and reading is what people do
 * second.
 */
import { useState, type ReactNode } from "react";
import Image from "next/image";
import {
  CalendarClockIcon,
  InfoIcon,
  RouteIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  ShirtIcon,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EventMetadata } from "@/lib/metadata";
import type { SterunAddOn, SterunCategory, SterunEvent } from "@sterunxyz/sdk";

import { EntryCard } from "./component/EntryCard";
import { TabAddOns } from "./component/TabAddOns";
import { TabCategories } from "./component/TabCategories";
import { TabDetails } from "./component/TabDetails";
import { TabTerms } from "./component/TabTerms";
import { TabTimeline } from "./component/TabTimeline";

export interface EventViewProps {
  event: SterunEvent;
  categories: SterunCategory[];
  /** Only a document that can be trusted. Undefined draws the chain alone. */
  document: EventMetadata | undefined;
  addOns: SterunAddOn[];
  /**
   * The Proofs tab, supplied rather than built here. The public page proves a
   * live event against its hash; a preview has nothing on chain to prove yet,
   * and pretending otherwise would be the one lie on a page about not lying.
   */
  proofs: ReactNode;
  /**
   * Drawn inside the organiser's wizard, with no Enter button anywhere: not
   * on the card, not on a distance, not on the timeline. A race that does not
   * exist cannot be entered, and following a link out of the wizard loses
   * everything typed into it.
   */
  preview?: boolean;
}

export function EventView({
  event,
  categories,
  document,
  addOns,
  proofs,
  preview = false,
}: EventViewProps) {
  const [tab, setTab] = useState("details");
  /** Absent in a preview, and every Enter button on the page hangs off it. */
  const onEnter = preview ? undefined : () => setTab("categories");

  return (
    <>
      {/*
        Both columns end on the same line. `min-h` rather than a fixed height
        so a card with eight distances in it can still push the row taller;
        the poster then letterboxes inside its frame rather than the two
        columns drifting apart.
      */}
      <div className="grid gap-6 lg:min-h-[26rem] lg:grid-cols-[1fr_22rem]">
        {document?.posterUrl ? (
          <div className="flex h-full items-center justify-center overflow-hidden rounded-lg border border-n-200 bg-n-100">
            <Image
              src={document.posterUrl}
              alt=""
              width={1200}
              height={900}
              unoptimized
              /* Contained, not cover: the poster is whatever the organiser had,
                 at whatever shape it was, and cropping a portrait one to fill a
                 landscape box cuts the date off the bottom of half of them. */
              className="max-h-[26rem] w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex h-full min-h-64 items-center justify-center rounded-lg border border-dashed border-n-300">
            <p className="text-sm text-n-500">This race has not published a poster.</p>
          </div>
        )}

        <EntryCard event={event} categories={categories} onEnter={onEnter} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* The strip divides the full width evenly, and on a phone it scrolls
            rather than wrapping: six tabs on two rows would put an active
            underline in the middle of the block.

            `overflow-y-hidden` is not decoration. Setting one axis to `auto`
            promotes the other one out of `visible` too, and the triggers hang
            a pixel past the rule with `-mb-px`, so the strip grew a vertical
            scrollbar of its own next to the last tab. */}
        <div className="overflow-x-auto overflow-y-hidden">
          <TabsList>
            <TabsTrigger value="details">
              <InfoIcon aria-hidden="true" />
              Details
            </TabsTrigger>
            <TabsTrigger value="terms">
              <ScrollTextIcon aria-hidden="true" />
              Terms
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <CalendarClockIcon aria-hidden="true" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="categories">
              <RouteIcon aria-hidden="true" />
              Distances
            </TabsTrigger>
            <TabsTrigger value="add-ons">
              <ShirtIcon aria-hidden="true" />
              Race pack
            </TabsTrigger>
            <TabsTrigger value="proofs">
              <ShieldCheckIcon aria-hidden="true" />
              Proofs
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="details">
          <TabDetails document={document} organiser={event.organiser} startsAt={event.startsAt} />
        </TabsContent>

        <TabsContent value="terms">
          <TabTerms terms={document?.terms} />
        </TabsContent>

        <TabsContent value="timeline">
          <TabTimeline
            document={document ?? {}}
            startsAt={event.startsAt}
            categoryCodes={categories.map((category) => category.code)}
            canEnter={
              event.status === "Open" && categories.some((category) => category.slotsLeft > 0)
            }
            onEnter={onEnter}
          />
        </TabsContent>

        <TabsContent value="categories">
          <TabCategories
            categories={categories}
            openForEntry={event.status === "Open"}
            offerEntry={!preview}
          />
        </TabsContent>

        <TabsContent value="add-ons">
          <TabAddOns items={document?.addOns ?? []} onChain={addOns} />
        </TabsContent>

        <TabsContent value="proofs">{proofs}</TabsContent>
      </Tabs>
    </>
  );
}
