"use client";

/**
 * Cancelling a race: the one thing in this console nothing can undo.
 *
 * The contract has taken `Cancelled` since v2 and the console never offered it,
 * which left an organiser who published a race by mistake with no way to
 * withdraw it. What follows from "terminal on chain" is every choice here:
 *
 * - **It says what it costs other people first.** The entries and the money are
 *   read from the chain, and there is no escrow: the fee moved from runner to
 *   organiser at the moment of entry, so a cancelled race leaves the organiser
 *   holding money for a race that will not happen. That is a refund owed off
 *   chain, and a screen that stays quiet about it helps somebody forget.
 * - **The name has to be typed.** Every other dialog in this console guards a
 *   signature another signature can undo. This one cannot be undone by
 *   anything, so the guard is the one that scales with the cost, and it is the
 *   pattern people already know from deleting a repository.
 * - **The way out is "Keep the race"**, never a second button reading Cancel.
 *   Two buttons that both say cancel is how people press the wrong one.
 * - **It does not promise a delete.** Nothing is removed: the page keeps its
 *   URL, a search still reaches it, the name stays on chain. What changes is
 *   that entries stop for good and the directory drops it.
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
import { Field } from "@/components/form/Field";
import { eventKeys, useEventAddOns } from "@/hooks/useEvents";
import { friendlyError } from "@/lib/api/errors";
import type { EventSummary } from "@/lib/event/events";
import { useSetEventStatus } from "@/modules/organiser/shared/hooks/useOrganiser";
import { formatAmount } from "@/utils/format";

import { raceTotals } from "../lib/race";

export function CancelRaceDialog({
  summary,
  onClose,
}: {
  summary: EventSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const addOns = useEventAddOns(summary.event.eventId);
  const { write, phase, isBusy, error, reset } = useSetEventStatus();
  const [typed, setTyped] = useState("");

  const { event } = summary;
  const totals = raceTotals(summary.categories, addOns.data ?? []);
  const matches = typed.trim() === event.name.trim();

  function close(): void {
    if (isBusy) return;
    reset();
    onClose();
  }

  async function cancel(): Promise<void> {
    try {
      await write({ eventId: event.eventId, status: "Cancelled" });
      // The page, the rail, the dashboard and the directory all read a race's
      // status from here.
      await queryClient.invalidateQueries({ queryKey: eventKeys.all });
      close();
    } catch {
      // `error` carries it into the dialog; nothing else to do here.
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent showCloseButton={!isBusy} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="heading-strong text-xl text-ink">
            Cancel {event.name}?
          </DialogTitle>
          <DialogDescription className="text-base text-n-600">
            This cannot be undone by anyone, including us.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 rounded-lg border border-danger-border bg-danger-surface px-4 py-3">
          {totals.entered > 0 ? (
            <>
              <p className="heading-strong text-sm text-ink">
                {totals.entered.toLocaleString("en-US")} runners have entered, and they have paid{" "}
                {formatAmount(totals.received)} sUSD.
              </p>
              <p className="text-sm text-n-700">
                Sterun never held that money: it went straight to your wallet as each runner entered.
                Cancelling does not send any of it back, and no refund can be made from here.
              </p>
            </>
          ) : (
            <>
              <p className="heading-strong text-sm text-ink">Nobody has entered this race.</p>
              <p className="text-sm text-n-700">
                Nothing is owed to anyone. Cancelling is still permanent.
              </p>
            </>
          )}
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-n-700">
            <li>Entries stop at once and cannot reopen</li>
            {totals.entered > 0 ? (
              <li>Every entry stays on its runner&apos;s record, marked &quot;Race cancelled&quot;</li>
            ) : null}
            <li>The race page stays online, saying the race was cancelled</li>
            <li>It drops off the directory by itself</li>
          </ul>
        </div>

        <Field
          id="cancel-confirm"
          label="Type the race name to confirm"
          autoComplete="off"
          value={typed}
          onChange={(input) => setTyped(input.target.value)}
          hint={event.name}
        />

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {friendlyError(error)}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" disabled={isBusy} onClick={close}>
            Keep the race
          </Button>
          <Button
            variant="destructive"
            disabled={!matches || isBusy}
            onClick={() => void cancel()}
          >
            {isBusy ? (phase === "signing" ? "Confirm in your wallet" : "Cancelling") : "Cancel this race"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
