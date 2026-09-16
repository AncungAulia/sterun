/**
 * Everything above the QR: the race, its facts in a row, and the bib name.
 *
 * Labelled columns rather than one line separated by dots (the design, section
 * 4): facts in fixed positions can be scanned for the one you need, where a
 * flat string has to be read through. Ancung put the state in that row and
 * centred the columns (2026-09-16).
 *
 * **The bib number is the first column of that row** (Ancung, 2026-09-16).
 * It has to be on the pass: the manual fallback at a desk is the code plus the
 * bib number (`docs/specs/HASH_AND_TOTP.md` §5, and the scanner's typing sheet
 * in STE-22), and a runner collecting a race pack does not have a printed bib
 * yet. The distance is labelled **Category**, not Distance (Ancung,
 * 2026-09-16): a code like `3K_FUN_WALK` names the category a runner entered,
 * and reads oddly under a word that promises a length. For one morning it was dropped, with the name alone under the row; that
 * left a volunteer asking for a number the runner had nowhere to read. A fact in
 * the row keeps the name as the large thing on the pass. On a phone that holds
 * no name the number is already the large thing, so it is not repeated.
 *
 * Three facts sit in one row. Four (once the city is known) wrap into two rows
 * of two: a quarter of a phone is too narrow for "Not collected".
 *
 * The date is gone for the same reason a runner does not need it here: they are
 * standing at the race. The city stays when this device has it, because a
 * series with two towns is the case where a runner checks.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";

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
    ...(bibName ? ([["Bib", String(bibNo)]] as [string, string][]) : []),
    ["Category", distanceCode],
    ...(city ? ([["Where", city]] as [string, string][]) : []),
  ];

  /** The facts plus the state, which always has a column of its own. */
  const columns = facts.length + 1;

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <h1 className="heading-strong text-2xl text-ink">{raceName}</h1>

      {/*
        Equal columns across the whole width, rather than each one only as wide
        as its own text (Ancung, 2026-09-16): sized to their contents they sat
        almost touching in the middle of the card. The count is written out
        rather than left to `grid-flow-col`, so what the browser does is the
        same thing the class says. Three columns fit a phone; two and four are
        laid out as rows of two.
      */}
      <dl className={cn("grid w-full gap-4", columns === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs tracking-[0.1em] text-n-600">{label}</dt>
            <dd className="mt-0.5 text-base text-ink tabular-nums">{value}</dd>
          </div>
        ))}
        <div>
          {/*
            "Race pack", not "Status" (Ancung, 2026-09-16). "Entered" told a
            runner at the desk nothing they were asking: whether this pass has
            already been used to collect. "Collected" is the pass's own word for
            it (ClaimedPanel), and "claimed" is kept for the chain's side.
          */}
          <dt className="text-xs tracking-[0.1em] text-n-600">Race pack</dt>
          <dd className="mt-0.5">
            <Badge variant={claimed ? "success" : "accent"}>{claimed ? "Collected" : "Not collected"}</Badge>
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
