"use client";

/**
 * STE-57 - the add-places run, wired to the wallet, the chain and the API.
 *
 * Every rule lives in `lib/add-places-run.ts`; this only supplies the real
 * dependencies and keeps the run's state where a dialog can read it. The raise
 * goes through `useChainWrite` like every other organiser write, so the step
 * can tell "check your wallet" from "saving".
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { eventKeys } from "@/hooks/useEvents";
import { useChainWrite } from "@/hooks/useChainWrite";
import { raceUpdateKeys } from "@/hooks/useRaceUpdates";
import { readClient } from "@/lib/chain/sterun";
import { publishAnnouncement } from "@/lib/event/announcements";
import { signMessage } from "@/lib/wallet/kit";

import {
  INITIAL_STATE,
  runAddPlaces,
  type AddPlacesPlan,
  type AddPlacesState,
} from "../lib/add-places-run";

export function useAddPlaces() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AddPlacesState>(INITIAL_STATE);
  const raise = useChainWrite<AddPlacesPlan, void>((plan, actor) =>
    readClient.increaseQuota(
      { eventId: plan.eventId, categoryId: plan.categoryId, newQuota: plan.newQuota },
      actor,
    ),
  );
  const { write } = raise;

  const start = useCallback(
    async (plan: AddPlacesPlan, from: AddPlacesState) => {
      const end = await runAddPlaces(plan, from, {
        now: () => Date.now(),
        signMessage: (message) => signMessage(message, { address: plan.organiser }),
        increaseQuota: async (p) => {
          await write(p);
        },
        quotaOnChain: async (p) => {
          const categories = await readClient.listCategories(p.eventId);
          const category = categories.find((c) => c.categoryId === p.categoryId);
          if (!category) throw new Error("distance not found");
          return category.quota;
        },
        publish: async (fields) => {
          await publishAnnouncement(fields);
        },
        onChange: setState,
      });
      if (end.raised) {
        // The page, the rail and the dashboard all read places from "events".
        void queryClient.invalidateQueries({ queryKey: eventKeys.all });
        void queryClient.invalidateQueries({ queryKey: raceUpdateKeys.quotaHistory(plan.eventId) });
      }
      if (end.published) {
        void queryClient.invalidateQueries({ queryKey: raceUpdateKeys.announcements(plan.eventId) });
      }
      return end;
    },
    [queryClient, write],
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { state, start, reset, raisePhase: raise.phase };
}
