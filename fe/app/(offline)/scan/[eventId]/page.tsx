import { notFound } from "next/navigation";

import { ScanDeskPage } from "@/modules/scanner/ScanDeskPage";

export const metadata = { title: "Checking runners in" };

/**
 * STE-22: the desk. An event id is a u32 from zero, so anything else is a bad
 * link. Whether this phone can run the desk is decided on the page, from the
 * roster it holds.
 */
export default async function ScanDeskRoute({ params }: PageProps<"/scan/[eventId]">) {
  const { eventId } = await params;
  if (!/^\d+$/.test(eventId)) notFound();

  return <ScanDeskPage eventId={Number(eventId)} />;
}
