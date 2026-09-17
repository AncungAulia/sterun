import { notFound } from "next/navigation";

import { FlaggedPage } from "@/modules/scanner/FlaggedPage";

export const metadata = { title: "Refused claims" };

/** STE-22: S11, the claims that were not accepted, kept for the organiser. */
export default async function ScanFlaggedRoute({ params }: PageProps<"/scan/[eventId]/flagged">) {
  const { eventId } = await params;
  if (!/^\d+$/.test(eventId)) notFound();

  return <FlaggedPage eventId={Number(eventId)} />;
}
