/**
 * Everything above the QR: the race, its facts in a row, and the bib name.
 *
 * Labelled columns rather than one line separated by dots (the design, section
 * 4): facts in fixed positions can be scanned for the one you need, where a
 * flat string has to be read through. Ancung put the state in that row and
 * centred the columns (2026-09-16).
 *
 * **The bib number is not shown** (Ancung, 2026-09-16). It was, small, under
 * the name, because the manual fallback at a desk is the code plus the bib
 * number (`docs/specs/HASH_AND_TOTP.md` §5) and a runner collecting a race pack
 * does not have a printed bib yet. That path now depends on the volunteer
 * having another way to the number, which is worth settling when the scanner's
 * manual entry is built (STE-22). The number is still shown on a phone that
 * holds no name, because then it is the only thing identifying the entry.
 *
 * The date is gone for the same reason a runner does not need it here: they are
 * standing at the race. The city stays when this device has it, because a
 * series with two towns is the case where a runner checks.
 */
import { Badge } from "@/components/ui/badge";

export function PassFacts({
  raceName,
  distanceCode,
  city,
  bibNo,
  bibName,
  claimed,
}: {
  raceName: string;
  distanceCode: string;
  city?: string;
  bibNo: number;
  /** What the runner put on their bib. Absent on an entry made before the form asked. */
  bibName?: string;
  claimed: boolean;
}) {
  const facts: [string, string][] = [
    ["Distance", distanceCode],
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

      {bibName ? (
        <p className="heading-hero text-4xl text-ink">{bibName}</p>
      ) : (
        <div>
          <p className="text-xs tracking-[0.1em] text-n-600">Bib</p>
          <p className="heading-hero numeric text-bib text-ink">{bibNo}</p>
        </div>
      )}
    </div>
  );
}
