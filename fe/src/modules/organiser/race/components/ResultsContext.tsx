"use client";

/**
 * The reviewed file, shared between the Results tab and the console header.
 *
 * The console's rule is that each tab keeps its **one** action in the header
 * (`ConsoleHeader`), and on this tab that action is "Sign and record N
 * results". But the file being reviewed lives in the tab, below the header, so
 * one of the two has to reach the other. This is the same shape `NeedsContext`
 * already uses for the bell: the state is provided once by `RaceConsole`,
 * which renders both, and read by whichever component needs it.
 *
 * Lifting the state into `RaceConsole` itself was the alternative, and it would
 * put an upload, a wallet signature and a review response into the component
 * that draws four tabs.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { ResultsReview } from "../lib/results-preview";

/** What was uploaded, once the backend has reviewed it. */
export interface LoadedResults {
  fileName: string;
  review: ResultsReview;
}

interface ResultsState {
  loaded: LoadedResults | null;
  setLoaded: (loaded: LoadedResults | null) => void;
  /** Bumped after a run lands, so the tab re-reads what is now on chain. */
  recordedAt: number;
  markRecorded: () => void;
}

const ResultsContext = createContext<ResultsState | null>(null);

export function ResultsProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<LoadedResults | null>(null);
  const [recordedAt, setRecordedAt] = useState(0);

  const value = useMemo<ResultsState>(
    () => ({
      loaded,
      setLoaded,
      recordedAt,
      markRecorded: () => {
        setRecordedAt((n) => n + 1);
        // The file is spent: every row in it either landed or was held, and
        // leaving it on screen would invite a second run over rows the chain
        // has already refused once.
        setLoaded(null);
      },
    }),
    [loaded, recordedAt],
  );

  return <ResultsContext.Provider value={value}>{children}</ResultsContext.Provider>;
}

export function useResultsContext(): ResultsState {
  const value = useContext(ResultsContext);
  if (!value) throw new Error("useResultsContext must be used inside ResultsProvider");
  return value;
}
