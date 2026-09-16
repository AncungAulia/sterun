"use client";

/**
 * The six characters and the QR payload for the step the phone is in.
 *
 * One interval at a second, rather than one timed to land exactly on the
 * boundary: a phone that sleeps in a pocket wakes with its timers behind, and
 * re-reading the clock every second corrects that on the next tick. The code
 * itself is computed only when the step changes, because HMAC is asynchronous
 * and the QR must not be redrawn for a countdown.
 *
 * A secret this device cannot use produces no code at all. Showing a wrong six
 * characters at a desk is worse than showing none: the volunteer would read a
 * refusal and blame the runner.
 */
import { useEffect, useState } from "react";

import { codeAt, qrPayload, secondsLeft as leftInStep, timeStepOf } from "../lib/totp";

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** What a computed code belongs to. A code outlives neither its secret nor its step. */
const keyOf = (secretHex: string, step: number) => `${secretHex}:${step}`;

export function usePassCode(tokenId: number, secretHex: string | null) {
  const [now, setNow] = useState(nowSeconds);
  const [computed, setComputed] = useState<{ key: string; code: string } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(nowSeconds()), 1000);
    return () => clearInterval(id);
  }, []);

  const step = timeStepOf(now);

  useEffect(() => {
    if (!secretHex) return;
    let current = true;
    const key = keyOf(secretHex, step);
    codeAt(secretHex, step)
      .then((code) => {
        if (current) setComputed({ key, code });
      })
      .catch(() => {
        // The page then offers to fetch the pass with the wallet instead.
        if (current) setComputed(null);
      });
    return () => {
      current = false;
    };
  }, [secretHex, step]);

  /*
    The code is shown only while it still belongs to this secret and this step.
    Holding it as plain state let the step roll over first and the new code
    arrive a tick later, so for that tick the payload carried the new step's
    number beside the old step's digits. A scanner refuses exactly that, and
    the runner standing at the desk is the one who looks wrong.
  */
  const key = secretHex === null ? null : keyOf(secretHex, step);
  const code = key !== null && computed?.key === key ? computed.code : null;

  return {
    code,
    payload: code === null ? null : qrPayload(tokenId, step, code),
    step,
    secondsLeft: leftInStep(now),
  };
}
