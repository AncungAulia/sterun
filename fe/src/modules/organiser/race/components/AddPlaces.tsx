"use client";

/**
 * STE-57 - the header's Add places button (mockup section 1).
 *
 * A menu of the race's distances, because places are added to one distance at
 * a time and the header is the one place every tab shares. Each row says how
 * full the distance is, so the one that sold out is found without opening
 * anything. A race with a single distance has nothing to choose, so the button
 * opens the dialog straight away.
 *
 * Offered on every distance, not only a full one (Ancung, 2026-09-17): a
 * second batch is often opened before the first quite runs out.
 */
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNowSeconds } from "@/hooks/useNowSeconds";
import type { EventSummary } from "@/lib/event/events";

import { offersAddPlaces } from "../lib/add-places";
import { AddPlacesDialog } from "./AddPlacesDialog";

export function AddPlaces({ summary }: { summary: EventSummary }) {
  const nowS = useNowSeconds();
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const { event, categories } = summary;
  if (categories.length === 0 || !offersAddPlaces(event.status, event.startsAt, nowS)) return null;

  // Looked up on every render, so the dialog reads the distance as the chain
  // now holds it rather than as it was when the menu was opened.
  const chosen = categories.find((category) => category.categoryId === categoryId) ?? null;
  const only = categories.length === 1 ? categories[0] : null;

  return (
    <>
      {only ? (
        <Button onClick={() => setCategoryId(only.categoryId)}>Add entries</Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              Add entries
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="font-normal text-n-500">Which distance?</DropdownMenuLabel>
            {categories.map((category) => (
              <DropdownMenuItem
                key={category.categoryId}
                onSelect={() => setCategoryId(category.categoryId)}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="flex flex-col">
                  <span className="font-medium text-ink">{category.code}</span>
                  <span className="numeric text-sm text-n-500">
                    {category.enteredCount.toLocaleString("en-US")} of {category.quota.toLocaleString("en-US")}
                  </span>
                </span>
                {category.slotsLeft <= 0 ? <Badge variant="warning">Full</Badge> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {chosen ? (
        <AddPlacesDialog
          key={chosen.categoryId}
          category={chosen}
          organiser={event.organiser}
          status={event.status}
          onClose={() => setCategoryId(null)}
        />
      ) : null}
    </>
  );
}
