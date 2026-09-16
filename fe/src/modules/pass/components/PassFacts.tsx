/**
 * Everything above the QR: the race, three labelled facts, and the bib.
 *
 * Labelled columns rather than one line separated by dots (the design, section
 * 4): three facts in three positions can be scanned for the one you need, where
 * a flat string has to be read through to find the distance.
 *
 * The city is absent until this device has been online once, because round 1
 * never stored it. A missing fact drops its column rather than showing a dash.
 */
import { Badge } from "@/components/ui/badge";
import { formatEventDate } from "@/utils/format";

export function PassFacts({
  raceName,
  distanceCode,
  startsAt,
  city,
  bibNo,
  claimed,
}: {
  raceName: string;
  distanceCode: string;
  startsAt: bigint;
  city?: string;
  bibNo: number;
  claimed: boolean;
}) {
  const facts: [string, string][] = [
    ["Distance", distanceCode],
    ["Date", formatEventDate(startsAt)],
    ...(city ? ([["Where", city]] as [string, string][]) : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="heading-strong text-2xl text-ink">{raceName}</h1>

      <dl className="flex flex-wrap gap-x-6 gap-y-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs tracking-[0.1em] text-n-600 uppercase">{label}</dt>
            <dd className="text-base text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.1em] text-n-600 uppercase">Bib</p>
          <p className="heading-hero numeric text-bib text-ink">{bibNo}</p>
        </div>
        <Badge variant={claimed ? "success" : "accent"}>
          {claimed ? "Race pack claimed" : "Entered"}
        </Badge>
      </div>
    </div>
  );
}
