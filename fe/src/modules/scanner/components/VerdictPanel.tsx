"use client";

/**
 * S3 to S6: the verdict, which owns the screen until the volunteer moves on.
 *
 * Built to be read in under two seconds by someone in the sun who may not tell
 * red from green (docs/design/race-day/README.md §3). So every verdict differs
 * three ways before colour counts: the **word**, the **icon shape** (check,
 * cross, triangle, question mark) and the **ground** (HAND OVER is flat, every
 * refusal is striped). The reading order on HAND OVER is word, bib, name, which
 * is the order a volunteer acts in: decide, match the bib, greet the runner.
 *
 * **A refusal always offers the next move.** CODE EXPIRED is recoverable in a
 * second, so it offers both ways to try again. ALREADY CLAIMED and NOT ON
 * ROSTER offer only the next runner, because rescanning cannot change them.
 *
 * Nothing here waits on its own animation: the text is on screen from the first
 * frame, and the movement (M1, in globals.css) only makes the change legible.
 */
import { Check, CircleQuestionMark, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

import { distanceOf, formatClock, formatLedger } from "../lib/roster-facts";
import type { StoredRoster } from "../lib/scanner-store";
import type { Verdict } from "../lib/verdict";

export interface VerdictPanelProps {
  verdict: Verdict;
  roster: StoredRoster;
  waitingCount: number;
  onNext: () => void;
  onType: () => void;
}

function claimsWaiting(count: number): string {
  if (count === 0) return "No claims waiting to send";
  return count === 1 ? "1 claim waiting to send" : `${count} claims waiting to send`;
}

function Ground({
  flat,
  icon: Icon,
  word,
  bib,
  children,
}: {
  flat: boolean;
  icon: LucideIcon;
  word: string;
  bib: number | null;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "verdict-panel flex flex-1 flex-col items-center justify-center gap-5 px-8 py-10 text-center",
        flat ? "bg-success-strong text-ink" : "verdict-refused text-paper",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "verdict-icon flex size-28 items-center justify-center rounded-full",
          flat ? "bg-ink text-success-strong" : "bg-paper text-danger",
        )}
      >
        <Icon className="size-14" strokeWidth={3} />
      </span>
      <p className="verdict-word font-hero text-4xl font-bold tracking-wide uppercase">{word}</p>
      {bib !== null ? (
        <p className="verdict-bib text-bib leading-none font-semibold tabular-nums">{bib}</p>
      ) : null}
      {children}
    </div>
  );
}

function ActionBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 bg-n-950 px-5 pt-5 pb-6">{children}</div>;
}

const primary = "h-14 w-full bg-n-100 text-base text-ink hover:bg-n-200";
const secondary = "h-14 w-full border border-n-700 bg-transparent text-base text-paper hover:bg-n-800";

export function VerdictPanel({ verdict, roster, waitingCount, onNext, onType }: VerdictPanelProps) {
  switch (verdict.kind) {
    case "green": {
      const { entry } = verdict;
      const distance = distanceOf(roster, entry.categoryId);
      return (
        <section role="status" aria-label="Hand over" className="flex flex-1 flex-col">
          <Ground flat icon={Check} word="Hand over" bib={entry.bibNo}>
            {entry.nameFragment ? <p className="text-2xl">{entry.nameFragment}</p> : null}
            {distance ? <p className="text-xl">{distance}</p> : null}
            {entry.addOns.length > 0 ? (
              <ul aria-label="Race pack" className="flex flex-col gap-1 text-lg">
                {entry.addOns.map((addOn) => (
                  <li key={`${addOn.item}-${addOn.choice}`}>
                    {addOn.item} {addOn.choice}
                  </li>
                ))}
              </ul>
            ) : null}
          </Ground>
          <ActionBar>
            <p className="text-center text-base text-n-300">{claimsWaiting(waitingCount)}</p>
            <Button className={primary} onClick={onNext}>
              Next runner
            </Button>
          </ActionBar>
        </section>
      );
    }

    case "expired":
      return (
        <section role="alert" aria-label="Code expired" className="flex flex-1 flex-col">
          <Ground flat={false} icon={X} word="Code expired" bib={null}>
            <p className="max-w-sm text-2xl">
              The code on the runner&apos;s phone changes every 30 seconds. Ask for the one showing now.
            </p>
          </Ground>
          <ActionBar>
            <Button className={primary} onClick={onNext}>
              Scan again
            </Button>
            <Button className={secondary} onClick={onType}>
              Type the code instead
            </Button>
          </ActionBar>
        </section>
      );

    case "claimed": {
      const { entry, claimedHere } = verdict;
      return (
        <section role="alert" aria-label="Already claimed" className="flex flex-1 flex-col">
          <Ground flat={false} icon={TriangleAlert} word="Already claimed" bib={entry.bibNo}>
            <p className="max-w-sm text-2xl">
              {claimedHere
                ? `Collected ${formatClock(claimedHere.scannedAt)} at this desk. Do not hand over a second race pack.`
                : "Collected before this roster was downloaded. Do not hand over a second race pack."}
            </p>
          </Ground>
          <ActionBar>
            <Button className={primary} onClick={onNext}>
              Next runner
            </Button>
          </ActionBar>
        </section>
      );
    }

    case "unknown":
      return (
        <section role="alert" aria-label="Not on roster" className="flex flex-1 flex-col">
          <Ground flat={false} icon={CircleQuestionMark} word="Not on roster" bib={verdict.bibNo}>
            <p className="max-w-sm text-2xl">
              {verdict.bibNo !== null
                ? "This bib is not in the download for this race. Check the runner is at the right race."
                : "This pass is not in the download for this race. Check the runner is at the right race."}
            </p>
          </Ground>
          <ActionBar>
            <Button className={primary} onClick={onNext}>
              Next runner
            </Button>
            <p className="flex justify-center gap-6 text-sm text-n-300">
              <span>Roster {formatClock(roster.downloadedAt)}</span>
              <span>Ledger {formatLedger(roster.snapshotLedger)}</span>
            </p>
          </ActionBar>
        </section>
      );
  }
}
