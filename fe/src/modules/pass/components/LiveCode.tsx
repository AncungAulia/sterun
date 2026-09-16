"use client";

/**
 * The part of the pass that changes: the QR, the countdown and the six
 * characters.
 *
 * It owns the clock. `usePassCode` sets state every second, and state belongs
 * to the smallest component that needs it: held one level up, in the page, that
 * tick re-rendered the race name, the date and the bib sixty times a minute,
 * none of which had changed (Ancung, 2026-09-16). Here the tick reaches the QR
 * and the digits and stops.
 *
 * Without a code there is nothing to hold up at a desk, so this says so rather
 * than drawing an empty frame.
 */
import { ErrorNotice } from "@/components/feedback/ErrorNotice";

import { CodeRow } from "./CodeRow";
import { Countdown } from "./Countdown";
import { PassQr } from "./PassQr";
import { usePassCode } from "../hooks/usePassCode";

export function LiveCode({ tokenId, secretHex }: { tokenId: number; secretHex: string }) {
  const { code, payload, secondsLeft, step } = usePassCode(tokenId, secretHex);

  if (!code || !payload) {
    return (
      <ErrorNotice
        title="We could not make your code on this phone"
        detail="Open this pass again, or fetch it with the wallet that entered."
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-n-200 bg-card p-4">
        <PassQr payload={payload} />
        <Countdown secondsLeft={secondsLeft} step={step} />
      </div>
      {/*
        Nothing stands under the code (Ancung, 2026-09-16). The mockup puts two
        notes there: one reassuring that the pass works without signal, which
        the offline banner already says when the signal actually goes, and one
        explaining that a code caught mid-change is still accepted, which the
        scanner does whatever the pass says.
      */}
      <CodeRow code={code} />
    </>
  );
}
