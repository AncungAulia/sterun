import { notFound } from "next/navigation";

import { readClient } from "@/lib/chain/sterun";
import { EventDetail } from "@/modules/event-detail/EventDetail";

/** How long the tab title may wait on a public node before giving up. */
const NAME_TIMEOUT_MS = 2_500;

/**
 * The race's own name in the tab and in a shared link.
 *
 * This is the one page people send each other, and "Sterun" in a chat preview
 * says nothing about which race is being sent. The name is on chain, so it is
 * read here rather than guessed from the id.
 *
 * It is also the only thing on this page rendered on the server, so it is kept
 * cheap and optional: one read, a short timeout, and the plain title on
 * anything going wrong. A slow node must cost a generic tab title, never the
 * page.
 */
export async function generateMetadata({ params }: PageProps<"/events/[eventId]">) {
  const { eventId } = await params;
  if (!/^\d+$/.test(eventId)) return { title: "Race" };
  try {
    const event = await Promise.race([
      readClient.getEvent(Number(eventId)),
      new Promise<never>((_, reject) => setTimeout(reject, NAME_TIMEOUT_MS, new Error("slow node"))),
    ]);
    return { title: event.name };
  } catch {
    return { title: "Race" };
  }
}

/**
 * Event ids are sequential u32 from zero. Anything else in the slot is a bad
 * link rather than a missing event, and saying so here keeps the id that
 * reaches the module a number.
 */
export default async function EventPage({ params }: PageProps<"/events/[eventId]">) {
  const { eventId } = await params;
  if (!/^\d+$/.test(eventId)) notFound();

  return <EventDetail eventId={Number(eventId)} />;
}
