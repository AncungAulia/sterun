/**
 * One country's cities, fetched when that country is picked.
 *
 * Cities are not in the bundle: names alone for the whole world are 2.1 MB, and
 * charging every visitor 2.1 MB so that the handful who open the create form
 * get a dropdown is the wrong trade. They are one static file per country under
 * `public/places/`, and this is what pulls one down.
 *
 * React Query rather than a fetch in an effect, for the same reasons the chain
 * reads use it: one request in flight however many fields ask, and a result
 * that survives stepping forward and back through the wizard. The data is a
 * file committed to this repo, so it is never stale until a deploy replaces it,
 * which is what `Infinity` says here.
 */
import { useQuery } from "@tanstack/react-query";

import { fetchCities, hasCities, type CitiesByProvince } from "@/lib/places";

export const cityKeys = {
  one: (iso2: string) => ["cities", iso2] as const,
};

export function useCities(iso2: string) {
  return useQuery<CitiesByProvince>({
    queryKey: cityKeys.one(iso2),
    queryFn: () => fetchCities(iso2),
    // No country, or a country with no file: there is nothing to ask for, and
    // asking would be a 404 in the console on every render of the form.
    enabled: iso2.length > 0 && hasCities(iso2),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
