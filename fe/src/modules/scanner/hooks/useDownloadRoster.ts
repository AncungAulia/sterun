"use client";

/**
 * Download one race's roster, add what the desk will need offline, keep it.
 *
 * The roster carries a category id per runner and nothing else about the race,
 * and at the desk there is no signal to look the rest up. So the race's name
 * and its distance labels are taken from the summary this screen already read,
 * and stored beside the entries.
 *
 * The wallet kit is imported on press, the same as `GetPassHere`: this route is
 * the one that has to open at a venue, and a static import would pull all of
 * Stellar Wallets Kit into it.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { EventSummary } from "@/lib/event/events";

import { rememberServerTime } from "../lib/clock";
import { fetchRoster } from "../lib/roster-api";
import { saveRoster, type StoredRoster } from "../lib/scanner-store";
import { scannerKeys } from "./useScannerEvents";

export function useDownloadRoster(address: string | null) {
  const queryClient = useQueryClient();

  return useMutation<{ roster: StoredRoster; missingFromIndex: number }, Error, EventSummary>({
    mutationFn: async (summary) => {
      if (!address) throw new Error("Connect your wallet first.");
      const { signMessage } = await import("@/lib/wallet/kit");
      const { roster, missingFromIndex } = await fetchRoster(summary.event.eventId, address, signMessage);

      const stored: StoredRoster = {
        ...roster,
        raceName: summary.event.name,
        categories: summary.categories.map((category) => ({
          categoryId: category.categoryId,
          code: category.code,
        })),
      };
      await saveRoster(stored);
      // A true time, just now: the desk measures its clock from this until it has a better one.
      rememberServerTime(Date.parse(roster.generatedAt));
      return { roster: stored, missingFromIndex };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scannerKeys.rosters });
    },
  });
}
