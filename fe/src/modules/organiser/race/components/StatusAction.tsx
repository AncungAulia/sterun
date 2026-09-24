"use client";

/**
 * The header's one action on a race page: open, close or reopen entries.
 *
 * Always behind a dialog, even for closing, because every one of these is a
 * signature and a button that raises a wallet with no warning has already
 * surprised somebody. The dialog cannot be dismissed while the signature is in
 * flight: closing it would hide the only place the outcome is reported.
 *
 * **Two triggers, one dialog** (STE-69). The header now leads with whichever
 * action that race most needs and folds the rest into a menu, so this renders
 * either a button or a menu item. Splitting the dialog into a component of its
 * own instead would leave the wallet write, its phases and its error in one
 * file and the words that explain them in another.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { eventKeys } from "@/hooks/useEvents";
import { useNowSeconds } from "@/hooks/useNowSeconds";
import { useSetEventStatus } from "@/modules/organiser/shared/hooks/useOrganiser";
import type { EventSummary } from "@/lib/event/events";
import { friendlyError } from "@/lib/api/errors";

import { statusAction } from "../lib/status-action";

export function StatusAction({
  summary,
  variant = "primary",
}: {
  summary: EventSummary;
  variant?: "primary" | "menu";
}) {
  const nowS = useNowSeconds();
  const queryClient = useQueryClient();
  const { write, phase, isBusy, error, reset } = useSetEventStatus();
  const [open, setOpen] = useState(false);

  const move = statusAction(summary.event.status, summary.event.startsAt, nowS);
  if (!move) return null;

  async function confirm(to: "Open" | "Closed") {
    try {
      await write({ eventId: summary.event.eventId, status: to });
      // Every read that holds this race's status (the page, the rail, the
      // dashboard and the bell) starts from the "events" key.
      await queryClient.invalidateQueries({ queryKey: eventKeys.all });
      setOpen(false);
      reset();
    } catch {
      // `error` carries it into the dialog; nothing else to do here.
    }
  }

  const busyLabel = phase === "signing" ? "Confirm in your wallet" : "Saving";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isBusy) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      {variant === "menu" ? (
        <DropdownMenuItem
          // Radix closes the menu on select and moves focus back to its
          // trigger, which would fight the dialog for it. Opening on the next
          // frame lets the menu finish first.
          onSelect={(event) => {
            event.preventDefault();
            setTimeout(() => setOpen(true), 0);
          }}
        >
          {move.label}
        </DropdownMenuItem>
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
          {move.label}
        </Button>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{move.title}</DialogTitle>
          <DialogDescription>{move.body}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {friendlyError(error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={isBusy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={isBusy} onClick={() => void confirm(move.to)}>
            {isBusy ? busyLabel : move.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
