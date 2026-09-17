import { notFound } from "next/navigation";

import { EntryFlow } from "@/modules/entry/EntryFlow";

export const metadata = { title: "Enter this race" };

/**
 * STE-21. Event ids are sequential u32 from zero, so anything else in the slot
 * is a bad link. `?category=` is read here and handed down as a number, or null
 * when it is missing or not one: a stale link should still reach the form, not
 * an error, and `entryGate` picks a distance for it.
 */
export default async function EnterPage({
  params,
  searchParams,
}: PageProps<"/events/[eventId]/enter">) {
  const { eventId } = await params;
  if (!/^\d+$/.test(eventId)) notFound();

  const { category } = await searchParams;
  const requested = typeof category === "string" && /^\d+$/.test(category) ? Number(category) : null;

  return <EntryFlow eventId={Number(eventId)} requestedCategory={requested} />;
}
