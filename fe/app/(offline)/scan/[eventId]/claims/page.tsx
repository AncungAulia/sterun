import { notFound } from "next/navigation";

import { ClaimsPage } from "@/modules/scanner/ClaimsPage";

/** STE-22: S9 and S10, the claims this phone holds for a race and sending them. */
export default async function ScanClaimsRoute({ params }: PageProps<"/scan/[eventId]/claims">) {
  const { eventId } = await params;
  if (!/^\d+$/.test(eventId)) notFound();

  return <ClaimsPage eventId={Number(eventId)} />;
}
