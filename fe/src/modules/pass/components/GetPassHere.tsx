"use client";

/**
 * A phone that did not enter, and so has no secret to make codes from.
 *
 * Entering on a laptop and running with a phone is the ordinary case, not an
 * edge one, and so is a new phone. Fetching the pass with the wallet that owns
 * the record is the route STE-52 added; this screen says what is missing and
 * what will fix it. The wallet flow itself lands in the next commit.
 */
export function GetPassHere({ tokenId }: { tokenId: number }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 py-10">
      <h1 className="heading-strong text-2xl text-ink">Get your pass on this phone</h1>
      <p className="text-base text-n-600">
        This phone did not enter the race, so it has no codes yet. Connect the wallet that entered
        and sign one message, and your codes are made here from then on, with no signal needed at
        the desk.
      </p>
      <p className="numeric text-sm text-n-500">Entry {tokenId}</p>
    </div>
  );
}
