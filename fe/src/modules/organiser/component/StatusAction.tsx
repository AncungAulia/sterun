"use client";

/**
 * The header's one action on a race page: open, close or reopen entries.
 *
 * Always behind a dialog, even for closing, because every one of these is a
 * signature and a button that raises a wallet with no warning has already
 * surprised somebody. The dialog cannot be dismissed while the signature is in
 * flight: closing it would hide the only place the outcome is reported.
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
import { eventKeys } from "@/hooks/useEvents";
import { useNowSeconds } from "@/hooks/useNowSeconds";
import { useSetEventStatus } from "@/hooks/useOrganiser";
import type { EventSummary } from "@/lib/event/events";
import { friendlyError } from "@/lib/api/errors";

import { statusAction } from "../status-action";

export function StatusAction({ summary }: { summary: EventSummary }) {
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
      <Button variant="outline" onClick={() => setOpen(true)}>
        {move.label}
      </Button>
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
