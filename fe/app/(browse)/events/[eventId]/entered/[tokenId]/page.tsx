import { notFound } from "next/navigation";

import { EnteredPage } from "@/modules/entry/EnteredPage";

export const metadata = { title: "Your entry" };

/**
 * STE-21. Both ids are u32 from zero, so anything else in either slot is a bad
 * link. Whether the record really belongs to this race is decided on the page,
 * from chain, not trusted from the URL.
 */
export default async function EnteredRoute({ params }: PageProps<"/events/[eventId]/entered/[tokenId]">) {
  const { eventId, tokenId } = await params;
  if (!/^\d+$/.test(eventId) || !/^\d+$/.test(tokenId)) notFound();

  return <EnteredPage eventId={Number(eventId)} tokenId={Number(tokenId)} />;
}
