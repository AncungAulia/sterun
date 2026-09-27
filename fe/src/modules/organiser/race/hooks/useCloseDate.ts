"use client";

/**
 * STE-69 - moving the registration close date, wired to the wallet, the chain
 * and the API.
 *
 * Every rule lives in `lib/announced-change.ts`, the runner this shares with
 * STE-57: sign the announcement, move the date, publish. This only supplies the
 * real dependencies and keeps the run's state where the dialog can read it.
 *
 * **What counts as landed**: the date on chain is exactly the one this plan
 * asked for. Not "some date", and not "later than before": a date that is
 * neither means somebody else moved it, and publishing this announcement over
 * that would tell runners a figure that is not in force.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useChainWrite } from "@/hooks/useChainWrite";
import { eventKeys } from "@/hooks/useEvents";
import { raceUpdateKeys } from "@/hooks/useRaceUpdates";
import { readClient } from "@/lib/chain/sterun";
import { publishAnnouncement } from "@/lib/event/announcements";
import { signMessage } from "@/lib/wallet/kit";

import {
  INITIAL_ANNOUNCED_STATE,
  runAnnouncedChange,
  type AnnouncedState,
} from "../lib/announced-change";
import { closesKeys } from "@/hooks/useRegistrationCloses";

export interface CloseDatePlan {
  eventId: number;
  organiser: string;
  /** Unix seconds, the moment entries stop. */
  closesAt: bigint;
  body: string;
}

export function useCloseDate() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AnnouncedState>(INITIAL_ANNOUNCED_STATE);
  const move = useChainWrite<CloseDatePlan, void>((plan, actor) =>
    readClient.setRegistrationCloses(plan.eventId, plan.closesAt, actor),
  );
  const { write } = move;

  const start = useCallback(
    async (plan: CloseDatePlan, from: AnnouncedState) => {
      const end = await runAnnouncedChange(
        { eventId: plan.eventId, organiser: plan.organiser, body: plan.body },
        from,
        {
          now: () => Date.now(),
          signMessage: (message) => signMessage(message, { address: plan.organiser }),
          apply: async () => {
            await write(plan);
          },
          landed: async () => (await readClient.getRegistrationCloses(plan.eventId)) === plan.closesAt,
          publish: async (fields) => {
            await publishAnnouncement(fields);
          },
          onChange: setState,
        },
      );
      if (end.applied) {
        void queryClient.invalidateQueries({ queryKey: closesKeys.one(plan.eventId) });
        // The race page reads the status from here, and a date that has passed
        // changes what that page may offer.
        void queryClient.invalidateQueries({ queryKey: eventKeys.all });
      }
      if (end.published) {
        void queryClient.invalidateQueries({ queryKey: raceUpdateKeys.announcements(plan.eventId) });
      }
      return end;
    },
    [queryClient, write],
  );

  const reset = useCallback(() => setState(INITIAL_ANNOUNCED_STATE), []);

  return { state, start, reset, movePhase: move.phase };
}
