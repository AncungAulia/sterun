"use client";

/**
 * S7: the code typed by hand, when the camera cannot read a pass.
 *
 * Six characters and a bib, which is the fallback the frozen spec names
 * (HASH_AND_TOTP.md §5). The code field keeps what is typed as text from the
 * first keystroke to the verdict: a leading zero is a digit, and a field that
 * held a number would quietly drop it, so the note under the fields says so in
 * plain words.
 *
 * It covers the camera rather than replacing it (M4), so going back is instant
 * and the camera does not have to start again.
 */
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ManualEntryProps {
  onCheck: (typed: { code: string; bibNo: number }) => void;
  /** Absent when there is no camera to go back to. */
  onBack?: () => void;
  /** Why the camera is not an option, when it is not. */
  reason?: string;
}

/**
 * Digits only, trimmed after filtering rather than capped by `maxLength`: a code
 * pasted as "079 663" would be cut to "079 66" by the browser before any
 * filtering, and lose a digit the runner did read out.
 */
const digitsOnly = (value: string) => value.replace(/\D/g, "");

export function ManualEntry({ onCheck, onBack, reason }: ManualEntryProps) {
  const codeId = useId();
  const bibId = useId();
  const [code, setCode] = useState("");
  const [bib, setBib] = useState("");

  const ready = code.length === 6 && bib.length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    onCheck({ code, bibNo: Number(bib) });
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Type the code"
      className="flex flex-1 flex-col gap-6 bg-n-950 px-5 pt-6 pb-6 text-paper"
    >
      <header className="flex flex-col gap-2">
        <h1 className="heading-strong text-3xl">Type the code</h1>
        <p className="text-lg text-n-300">Ask the runner to read out the six digits, then their bib.</p>
        {reason ? <p className="text-base text-n-300">{reason}</p> : null}
      </header>

      <div className="flex flex-col gap-2">
        <Label htmlFor={codeId} className="text-base font-normal text-n-300">
          Six-digit code
        </Label>
        <Input
          id={codeId}
          value={code}
          onChange={(event) => setCode(digitsOnly(event.target.value).slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="079663"
          className="h-16 border-n-700 bg-n-900 px-5 text-3xl tracking-widest text-paper tabular-nums placeholder:text-n-600 md:text-3xl"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={bibId} className="text-base font-normal text-n-300">
          Bib number
        </Label>
        <Input
          id={bibId}
          value={bib}
          onChange={(event) => setBib(digitsOnly(event.target.value).slice(0, 6))}
          inputMode="numeric"
          placeholder="128"
          className="h-16 border-n-700 bg-n-900 px-5 text-3xl tracking-widest text-paper tabular-nums placeholder:text-n-600 md:text-3xl"
        />
      </div>

      <p className="text-base text-n-300">A code starting with 0 is normal. Type all six.</p>

      <div className="mt-auto flex flex-col gap-3">
        <Button type="submit" size="lg" className="h-14 text-base" disabled={!ready}>
          Check
        </Button>
        {onBack ? (
          <Button
            type="button"
            size="lg"
            className="h-14 border border-n-700 bg-transparent text-base text-paper hover:bg-n-800"
            onClick={onBack}
          >
            Back to camera
          </Button>
        ) : null}
      </div>
    </form>
  );
}
