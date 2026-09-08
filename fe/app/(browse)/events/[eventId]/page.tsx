import { notFound } from "next/navigation";

import { EventDetail } from "@/modules/event-detail/EventDetail";

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
