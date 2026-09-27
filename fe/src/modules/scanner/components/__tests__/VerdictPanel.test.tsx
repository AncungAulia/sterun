/**
 * Each verdict says its own word, shows its own facts and offers only the moves
 * the handoff gives it (docs/design/race-day/README.md §3 and §7).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { VerdictPanel } from "@/modules/scanner/components/VerdictPanel";
import type { RosterEntry, StoredRoster } from "@/modules/scanner/lib/scanner-store";
import type { Verdict } from "@/modules/scanner/lib/verdict";

const entry: RosterEntry = {
  tokenId: 7,
  bibNo: 128,
  categoryId: 0,
  state: "Entered",
  nameFragment: "Budi S.",
  addOns: [{ item: "Event jersey", choice: "L" }],
  totpSecret: "c".repeat(64),
};

const roster: StoredRoster = {
  eventId: 3,
  raceName: "Sasando Run 2026",
  categories: [{ categoryId: 0, code: "10K" }],
  snapshotLedger: 4_469_811,
  generatedAt: "2026-09-27T02:02:00.000Z",
  downloadedAt: "2026-09-27T02:02:00.000Z",
  driftSeconds: 0,
  totp: { digits: 6, stepSeconds: 30, toleranceSteps: 1 },
  entries: [entry],
};

function show(verdict: Verdict, waitingCount = 4) {
  const onNext = vi.fn();
  const onType = vi.fn();
  render(<VerdictPanel verdict={verdict} roster={roster} waitingCount={waitingCount} onNext={onNext} onType={onType} />);
  return { onNext, onType };
}

describe("HAND OVER", () => {
  it("reads word, bib, name, distance and what goes in the pack", () => {
    show({ kind: "green", entry });

    const panel = screen.getByRole("status", { name: "Hand over" });
    expect(panel).toHaveTextContent("Hand over");
    expect(panel).toHaveTextContent("128");
    expect(panel).toHaveTextContent("Budi S.");
    expect(panel).toHaveTextContent("10K");
    expect(screen.getByRole("list", { name: "Race pack" })).toHaveTextContent("Event jersey L");
  });

  it("says how many claims are waiting, and moves on to the next runner", async () => {
    const { onNext } = show({ kind: "green", entry });

    expect(screen.getByText("4 claims waiting to send")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next runner" }));
    expect(onNext).toHaveBeenCalled();
  });

  it("does not print an empty name for an entry that has none", () => {
    show({ kind: "green", entry: { ...entry, nameFragment: null, addOns: [] } });
    expect(screen.queryByRole("list", { name: "Race pack" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent("null");
  });

  it("is flat, where every refusal is striped", () => {
    show({ kind: "green", entry });
    expect(document.querySelector(".verdict-refused")).toBeNull();
  });
});

describe("CODE EXPIRED", () => {
  it("offers both ways to try again, because an expired code is recoverable at once", async () => {
    const { onNext, onType } = show({ kind: "expired", entry });

    expect(screen.getByRole("alert", { name: "Code expired" })).toHaveTextContent(
      "changes every 30 seconds",
    );
    expect(document.querySelector(".verdict-refused")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Scan again" }));
    await userEvent.click(screen.getByRole("button", { name: "Type the code instead" }));
    expect(onNext).toHaveBeenCalled();
    expect(onType).toHaveBeenCalled();
  });

  it("shows no bib, since the code did not prove whose pass it is", () => {
    show({ kind: "expired", entry });
    expect(screen.getByRole("alert")).not.toHaveTextContent("128");
  });
});

describe("ALREADY CLAIMED", () => {
  it("names this desk and the time when this phone recorded it", () => {
    show({
      kind: "claimed",
      entry,
      claimedHere: {
        tokenId: 7,
        bibNo: 128,
        eventId: 3,
        scannedAt: new Date(2026, 8, 27, 9, 41).toISOString(),
        status: "waiting",
      },
    });

    const panel = screen.getByRole("alert", { name: "Already claimed" });
    expect(panel).toHaveTextContent("128");
    expect(panel).toHaveTextContent("Collected 09:41 at this desk. Do not hand over a second race pack.");
  });

  it("says it happened before the download when the roster is the one that knows", () => {
    show({ kind: "claimed", entry: { ...entry, state: "RacepackClaimed" }, claimedHere: null });
    expect(screen.getByRole("alert")).toHaveTextContent("Collected before this roster was downloaded.");
  });

  it("offers only the next runner, because scanning again cannot change it", () => {
    show({ kind: "claimed", entry, claimedHere: null });
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Next runner"]);
  });
});

describe("NOT ON ROSTER", () => {
  it("names the bib that was typed and how old the roster is", () => {
    show({ kind: "unknown", bibNo: 512 });

    const panel = screen.getByRole("alert", { name: "Not on roster" });
    expect(panel).toHaveTextContent("512");
    expect(panel).toHaveTextContent("This bib is not in the download for this race.");
    expect(panel).toHaveTextContent("Runner list downloaded at");
    expect(panel).not.toHaveTextContent("Ledger");
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Next runner"]);
  });

  it("talks about the pass, not a bib, when it came from a QR", () => {
    show({ kind: "unknown", bibNo: null });
    expect(screen.getByRole("alert")).toHaveTextContent("This pass is not in the download for this race.");
  });
});
