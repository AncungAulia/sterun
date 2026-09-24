"use client";

/**
 * Everything the header can do to a race: one button, and a menu for the rest
 * (STE-69).
 *
 * `ConsoleHeader` holds **one** action per tab, and STE-57 broke that on
 * purpose so closing entries would stay reachable beside Add entries. A third
 * control would have made the exception the rule, so the three fold into one
 * button and a kebab menu, which is one action again.
 *
 * **Which one leads depends on the race**, and that decision is a pure function
 * (`lib/close-date.ts`, `headerPlan`) so it can be read and tested in one
 * place rather than inferred from nested conditions here. The short version: a
 * Draft race exists to be opened, an Open race leads with adding places because
 * a sold-out distance is money not being taken right now, and a race closed by
 * a date that has passed leads with the date, because reopening the status
 * alone changes a word and lets nobody in.
 */
import { EllipsisVerticalIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEventMetadata } from "@/hooks/useEventMetadata";
import { useNowSeconds } from "@/hooks/useNowSeconds";
import type { EventSummary } from "@/lib/event/events";

import { headerPlan, type RaceAction } from "../lib/close-date";
import { useRegistrationCloses } from "@/hooks/useRegistrationCloses";
import { AddPlaces } from "./AddPlaces";
import { CloseDateDialog } from "./CloseDateDialog";
import { StatusAction } from "./StatusAction";

export function RaceActions({ summary }: { summary: EventSummary }) {
  const nowS = useNowSeconds();
  const closes = useRegistrationCloses(summary.event.eventId);
  const metadata = useEventMetadata(summary.event.uri, summary.event.metadataHash);
  const [dateOpen, setDateOpen] = useState(false);

  const closesAt = closes.data ?? null;
  const plan = headerPlan(summary.event.status, closesAt, nowS);

  /** One action, drawn as the header's button or as a row in the menu. */
  function render(action: RaceAction, variant: "primary" | "menu") {
    switch (action) {
      case "addPlaces":
        return <AddPlaces key="addPlaces" summary={summary} variant={variant} />;
      case "open":
      case "reopen":
      case "close":
        return <StatusAction key="status" summary={summary} variant={variant} />;
      case "closeDate":
        return variant === "primary" ? (
          <Button key="closeDate" variant="outline" onClick={() => setDateOpen(true)}>
            {closesAt === null ? "Set closing date" : "Change closing date"}
          </Button>
        ) : (
          <DropdownMenuItem
            key="closeDate"
            // Radix closes the menu on select and returns focus to its trigger,
            // which would fight the dialog for it. Opening on the next frame
            // lets the menu finish first.
            onSelect={(event) => {
              event.preventDefault();
              setTimeout(() => setDateOpen(true), 0);
            }}
          >
            {closesAt === null ? "Set closing date" : "Change closing date"}
          </DropdownMenuItem>
        );
    }
  }

  return (
    <>
      {plan.primary ? render(plan.primary, "primary") : null}
      {plan.menu.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More for this race">
              <EllipsisVerticalIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {plan.menu.map((action) => render(action, "menu"))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {dateOpen ? (
        <CloseDateDialog
          summary={summary}
          closesAt={closesAt}
          metadata={metadata.data?.status === "verified" ? metadata.data.document : null}
          onClose={() => setDateOpen(false)}
        />
      ) : null}
    </>
  );
}
