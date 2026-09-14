/**
 * The tabs of one race, and how they live in the address.
 *
 * In the address rather than in component state, for two reasons that both
 * showed up before this file existed: the bell links straight to
 * `?tab=scanners`, and the rail sits in a layout that must not remount between
 * console pages, so the tab has to be something a link can set.
 *
 * Results is not listed. It waits for STE-44, and an old link to it opens
 * Overview rather than a page with nothing on it.
 *
 * No "use client": the route, a server component, imports `parseRaceTab`.
 */
export const RACE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "entries", label: "Entries" },
  { id: "scanners", label: "Scanners" },
] as const;

export type RaceTab = (typeof RACE_TABS)[number]["id"];

export function parseRaceTab(value: string | string[] | undefined): RaceTab {
  const first = Array.isArray(value) ? value[0] : value;
  const found = RACE_TABS.find((tab) => tab.id === first);
  return found ? found.id : "overview";
}

export function raceTabHref(eventId: number, tab: RaceTab): string {
  return tab === "overview" ? `/org/events/${eventId}` : `/org/events/${eventId}?tab=${tab}`;
}
