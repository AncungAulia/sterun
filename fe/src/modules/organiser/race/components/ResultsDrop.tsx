"use client";

/**
 * The Results tab before a file: the drop card and nothing else.
 *
 * Settled on 2026-09-13 (`docs/superpowers/specs/2026-09-13-org-console-mockup.html`,
 * block 5) and kept: there is no table to filter and no count to read, so the
 * tab holds one thing and says what it wants. Everything worth saying about a
 * finish list is said about the real file a moment later, by the review, in
 * terms of this race's own runners.
 *
 * The file is read in the browser and sent as bytes. The backend hashes exactly
 * what it receives, so nothing here may reformat, re-encode or "clean" it.
 */
import { UploadIcon } from "lucide-react";
import { useRef, useState } from "react";

import { ErrorNotice } from "@/components/feedback/ErrorNotice";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/useWallet";
import { friendlyError } from "@/lib/api/errors";
import { PlainError } from "@/lib/api/plain-error";
import { signMessage } from "@/lib/wallet/kit";

import { MAX_CSV_BYTES, previewResults } from "../lib/results-preview";
import { useResultsContext } from "./ResultsContext";

const ACCEPT = ".csv,text/csv,application/csv,text/plain";

export function ResultsDrop({ eventId }: { eventId: number }) {
  const address = useWallet((state) => state.address);
  const { setLoaded } = useResultsContext();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File): Promise<void> {
    setError(null);
    if (!address) return;
    if (file.size > MAX_CSV_BYTES) {
      setError("That file is larger than 5 MB. A finish list of any size fits well under that.");
      return;
    }
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const review = await previewResults({
        eventId,
        csv: bytes,
        address,
        sign: signMessage,
      });
      if (review.counts.total === 0) {
        throw new PlainError(
          "There are no rows in that file. Check it has a bib column, and a header row above it.",
        );
      }
      setLoaded({ fileName: file.name, review });
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-n-300 bg-paper px-6 py-12 text-center">
        <p className="heading-strong text-xl text-ink">Drop the timing file here</p>
        <p className="max-w-md text-base text-n-600">
          A bib column and a finish time. Runners with no time are fine.
        </p>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Choose a results file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared so choosing the same file twice still fires a change,
            // which is what an organiser does after correcting it in place.
            event.target.value = "";
            if (file) void choose(file);
          }}
        />
        <Button className="mt-2" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? (
            "Reading the file..."
          ) : (
            <>
              <UploadIcon aria-hidden="true" />
              Choose a file
            </>
          )}
        </Button>
      </div>
      {error ? <ErrorNotice title="We could not read that file" detail={error} /> : null}
    </div>
  );
}
