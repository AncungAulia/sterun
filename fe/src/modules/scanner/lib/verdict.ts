/**
 * The whole decision a desk makes, as one function with no camera, no network
 * and no React in it (design §4).
 *
 * Three local inputs: what the runner presented, the roster downloaded while
 * there was signal, and the claims this phone has already recorded. The answer
 * is one of four screens.
 *
 * ## The order is the answer
 *
 *   1. Not on the roster → `unknown`. Nothing else can be checked without a secret.
 *   2. Already claimed → `claimed`. Before the code, because a valid code changes
 *      nothing about a pack already handed over, and the runner standing there
 *      needs the reason rather than the maths.
 *   3. The code does not verify → `expired`. A stale screenshot and a mistyped
 *      code are the same screen: the volunteer does the same thing about both.
 *   4. Otherwise → `green`.
 *
 * "Already claimed" has two sources of different ages, and both count: the
 * roster's snapshot (the ledger it was read at) and this phone's own claims (a
 * second ago). The common double scan is the same desk twice within a minute,
 * which no snapshot can see.
 */
import type { QueuedClaim, RosterEntry, StoredRoster } from "./scanner-store";
import { verifyCode } from "./verify";

export type Presented =
  /** Read from the runner's QR: the step comes with the code. */
  | { via: "qr"; tokenId: number; step: number; code: string }
  /** Read out and typed by the volunteer: a bib, and no step. */
  | { via: "typed"; bibNo: number; code: string };

export type Verdict =
  | { kind: "green"; entry: RosterEntry }
  | { kind: "expired"; entry: RosterEntry | null }
  /** `claimedHere` is set when this phone's own record is the reason. */
  | { kind: "claimed"; entry: RosterEntry; claimedHere: QueuedClaim | null }
  | { kind: "unknown"; bibNo: number | null };

export interface VerdictInput {
  presented: Presented;
  roster: Pick<StoredRoster, "entries" | "totp">;
  claims: QueuedClaim[];
  nowStep: number;
}

export async function verdictFor({ presented, roster, claims, nowStep }: VerdictInput): Promise<Verdict> {
  const toleranceSteps = roster.totp.toleranceSteps;
  const step = presented.via === "qr" ? presented.step : null;

  const check = (entry: RosterEntry) =>
    verifyCode({ secretHex: entry.totpSecret, code: presented.code, step, nowStep, toleranceSteps });

  let entry: RosterEntry | undefined;

  if (presented.via === "qr") {
    entry = roster.entries.find((candidate) => candidate.tokenId === presented.tokenId);
    if (!entry) return { kind: "unknown", bibNo: null };
  } else {
    const candidates = roster.entries.filter((candidate) => candidate.bibNo === presented.bibNo);
    if (candidates.length === 0) return { kind: "unknown", bibNo: presented.bibNo };

    if (candidates.length === 1) {
      entry = candidates[0];
    } else {
      // Two runners with one bib: only possible for an event created before
      // bibs became event-wide (STE-54), where each distance counted from its
      // own zero. The code is what tells them apart, so it has to be checked
      // first here, and the order above resumes with the runner it picked.
      for (const candidate of candidates) {
        if (await check(candidate)) {
          entry = candidate;
          break;
        }
      }
      if (!entry) return { kind: "expired", entry: null };
    }
  }

  const claimedHere = claims.find((row) => row.tokenId === entry.tokenId) ?? null;
  if (claimedHere || entry.state !== "Entered") {
    return { kind: "claimed", entry, claimedHere };
  }

  if (!(await check(entry))) return { kind: "expired", entry };

  return { kind: "green", entry };
}
