/**
 * The connected wallet's sUSD, as the pay step and the wallet menu read it.
 *
 * Fresh for five seconds only: it decides whether the Sign and pay button is
 * usable, and it changes the moment test sUSD lands. Callers invalidate
 * `susdKey` after funding rather than waiting for it to go stale.
 */
import { useQuery } from "@tanstack/react-query";

import { readSusdBalance, type SusdBalance } from "@/lib/wallet/susd";

export const susdKey = (address: string | null) => ["susd-balance", address] as const;

export function useSusdBalance(address: string | null) {
  return useQuery<SusdBalance>({
    queryKey: susdKey(address),
    queryFn: () => readSusdBalance(address as string),
    enabled: Boolean(address),
    staleTime: 5_000,
  });
}
