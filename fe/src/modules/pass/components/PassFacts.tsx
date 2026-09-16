/**
 * Everything above the QR: the race, three facts in a row, and the bib.
 *
 * Labelled columns rather than one line separated by dots (the design, section
 * 4): facts in fixed positions can be scanned for the one you need, where a
 * flat string has to be read through. Ancung put the state in that row and
 * centred the columns (2026-09-16), which gives the three things a volunteer
 * checks one shape and one place.
 *
 * **The name leads and the number stays.** The name is what a volunteer matches
 * to the person in front of them, so it is the large one. The number is small
 * but present, because the manual fallback at the desk is the code plus the
 * bib number (docs/specs/HASH_AND_TOTP.md section 5), and a pass that never
 * shows it leaves a runner with a broken camera unable to check in at all.
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
  bibName,
  claimed,
}: {
  raceName: string;
  distanceCode: string;
  startsAt: bigint;
  city?: string;
  bibNo: number;
  /** What the runner put on their bib. Absent on an entry made before the form asked. */
  bibName?: string;
  claimed: boolean;
}) {
  const facts: [string, string][] = [
    ["Distance", distanceCode],
    ["Date", formatEventDate(startsAt)],
    ...(city ? ([["Where", city]] as [string, string][]) : []),
  ];

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <h1 className="heading-strong text-2xl text-ink">{raceName}</h1>

      <dl className="flex flex-wrap items-start justify-center gap-x-8 gap-y-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs tracking-[0.1em] text-n-600">{label}</dt>
            <dd className="mt-0.5 text-base text-ink">{value}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs tracking-[0.1em] text-n-600">Status</dt>
          <dd className="mt-0.5">
            <Badge variant={claimed ? "success" : "accent"}>
              {claimed ? "Race pack claimed" : "Entered"}
            </Badge>
          </dd>
        </div>
      </dl>

      <div>
        {bibName ? (
          <>
            <p className="heading-hero text-4xl text-ink">{bibName}</p>
            <p className="numeric mt-1 text-sm text-n-600">Bib {bibNo}</p>
          </>
        ) : (
          /* No name on this device, so the number carries the weight alone. */
          <>
            <p className="text-xs tracking-[0.1em] text-n-600">Bib</p>
            <p className="heading-hero numeric text-bib text-ink">{bibNo}</p>
          </>
        )}
      </div>
    </div>
  );
}
