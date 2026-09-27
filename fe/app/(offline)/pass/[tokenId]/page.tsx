import { notFound } from "next/navigation";

import { PassPage } from "@/modules/pass/PassPage";

export const metadata = { title: "Your race pass" };

/**
 * STE-21 round 2. A token id is a u32 from zero, so anything else is a bad
 * link. Whether this device can open that pass is decided on the page, from
 * what it holds and from chain, never trusted from the URL.
 */
export default async function PassRoute({ params }: PageProps<"/pass/[tokenId]">) {
  const { tokenId } = await params;
  if (!/^\d+$/.test(tokenId)) notFound();

  return <PassPage tokenId={Number(tokenId)} />;
}
