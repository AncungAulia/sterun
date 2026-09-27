"use client";

/** The index's latest change for one card. Optional by design: see `lib/record-trail.ts`. */
import { useQuery } from "@tanstack/react-query";

import { fetchRecordTrail } from "../lib/record-trail";

export function useRecordTrail(tokenId: number) {
  return useQuery({
    queryKey: ["record-trail", tokenId],
    queryFn: () => fetchRecordTrail(tokenId),
    staleTime: 60_000,
    retry: false,
  });
}
