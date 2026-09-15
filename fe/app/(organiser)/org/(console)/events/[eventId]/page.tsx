import { notFound } from "next/navigation";

import { RaceConsole } from "@/modules/organiser/RaceConsole";
import { parseRaceTab } from "@/modules/organiser/race-tab";

/**
 * One race in the console. Event ids are sequential u32 from zero, so anything
 * else in the slot is a bad link; it goes to the console's own not-found,
 * which draws inside the rail rather than under a second header.
 */
export default async function RacePage({
  params,
  searchParams,
}: PageProps<"/org/events/[eventId]">) {
  const { eventId } = await params;
  if (!/^\d+$/.test(eventId)) notFound();
  const { tab } = await searchParams;

  return <RaceConsole eventId={Number(eventId)} tab={parseRaceTab(tab)} />;
}
