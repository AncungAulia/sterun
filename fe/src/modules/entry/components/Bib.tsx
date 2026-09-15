/**
 * The bib, drawn as a bib (Ancung, from the mockup, block 5).
 *
 * A landscape sheet with a pin hole in each corner; an ink band across the
 * top with the race name centred and nothing else; the number large in the
 * hero face with the name on the bib under it; the distance on a teal tab at
 * each edge; a pale teal band along the bottom carrying only the Sterun mark.
 * No date and no race pack: a bib is read from across a start pen.
 *
 * One image to a screen reader, named in the order it is read: "Bib 98, BUDI,
 * 10K". The parts inside are decoration for the eye.
 *
 * The number is shown exactly as the contract holds it. Since STE-54 it is unique
 * within the race and counts from 1; a race created before that upgrade keeps
 * its per-distance numbers from 0. The distance is never folded into the number,
 * which is why it rides on the tabs instead.
 */
import Image from "next/image";

export function Bib({
  raceName,
  bibNo,
  bibName,
  distanceCode,
}: {
  raceName: string;
  bibNo: number;
  /** Absent on a device that did not enter: it is not on chain. */
  bibName?: string;
  distanceCode: string;
}) {
  const label = [`Bib ${bibNo}`, bibName, distanceCode].filter(Boolean).join(", ");
  const pin = "absolute z-10 size-3 rounded-full bg-paper ring-2 ring-n-300 ring-inset";

  return (
    <div
      role="img"
      aria-label={label}
      className="relative mx-auto flex aspect-[3/2] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-n-200 bg-card shadow-card"
    >
      <span aria-hidden="true" className={`${pin} top-2.5 left-2.5`} />
      <span aria-hidden="true" className={`${pin} top-2.5 right-2.5`} />
      <span aria-hidden="true" className={`${pin} bottom-2.5 left-2.5`} />
      <span aria-hidden="true" className={`${pin} right-2.5 bottom-2.5`} />

      <div className="bg-ink px-9 py-3 text-center">
        <span className="heading-strong block truncate text-base text-paper sm:text-lg">{raceName}</span>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-12">
        <span className="heading-strong absolute top-1/2 left-0 -translate-y-1/2 rounded-r-md bg-teal-500 px-2 py-1.5 text-xs text-paper sm:text-sm">
          {distanceCode}
        </span>
        <span className="heading-strong absolute top-1/2 right-0 -translate-y-1/2 rounded-l-md bg-teal-500 px-2 py-1.5 text-xs text-paper sm:text-sm">
          {distanceCode}
        </span>
        <span className="heading-hero numeric text-8xl leading-none text-ink sm:text-9xl">{bibNo}</span>
        {bibName ? (
          <span className="heading-strong mt-1 max-w-full truncate text-lg tracking-wide text-ink sm:text-2xl">
            {bibName}
          </span>
        ) : null}
      </div>

      <div className="flex justify-center border-t border-teal-100 bg-teal-50 px-9 py-2">
        <Image src="/brand/logo/sterun-lockup-black.svg" alt="" width={88} height={16} className="h-4 w-auto" />
      </div>
    </div>
  );
}
