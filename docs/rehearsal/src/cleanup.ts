/**
 * STE-68 — races our own scripts leave behind, and taking them off the
 * directory.
 *
 * On 2026-09-25 the top five rows of the public directory were sanity races:
 * "Sterun quota increase sanity", "Sterun bib uniqueness sanity", … with no
 * document and a fixture date. There is no delete; the only way off the list
 * is `Cancelled` (the directory hides cancelled races and races whose start
 * has passed — `entryRank` in fe/src/lib/event/events.ts). Only the race's
 * organiser can cancel, and `Completed` and `Cancelled` are terminal.
 *
 * Two sources, handled in two places:
 *
 *   the rehearsal (mock-race.ts)   a fresh organiser key per run, never
 *                                  saved. So it must cancel its own leftovers
 *                                  before it exits, or nobody ever can.
 *   the sc/ sanity scripts         `sc/scripts/*-testnet.sh`, signed by the
 *                                  `sterun-organiser` CLI identity, which is
 *                                  kept. `sweep.ts` cancels those.
 *
 * What is cancelled is deliberately narrow: a race is only ever cancelled by
 * the key that created it, and the sweep only touches races whose NAME says
 * they are a sanity check. A demo race or a real one is never matched by
 * accident, and an organiser we do not hold a key for is reported, not
 * attempted — it would fail as a non-organiser, and that is correct.
 */

export const TERMINAL: readonly string[] = ["Completed", "Cancelled"];

export interface RaceState {
  eventId: number;
  name: string;
  status: string;
  organiser: string;
  startsAt: bigint;
}

/** What still needs cancelling out of a run's own races. */
export function stillOpen(races: readonly RaceState[]): RaceState[] {
  return races.filter((race) => !TERMINAL.includes(race.status));
}

/**
 * The line written into the evidence the moment a run creates a race, and
 * replaced once cleanup has run. A run killed before cleanup therefore leaves
 * this sentence behind instead of saying nothing.
 */
export function pendingCleanupNote(eventIds: readonly number[]): string {
  return (
    `NOT RUN YET — if you are reading this in a finished evidence file, the run died before its cleanup. ` +
    `Race(s) ${eventIds.join(", ")} may still be open, and this run's organiser key was never saved, so nobody can cancel them now. ` +
    "They are off the directory's default list anyway: the rehearsal race's starts_at is the moment it was created."
  );
}

/** Visible on the directory's default list: neither terminal nor started. */
export function visible(race: RaceState, nowS: bigint): boolean {
  return race.status !== "Cancelled" && race.startsAt >= nowS;
}

const SANITY = /\bsanity\b/i;
/** Names that read as a test to a reviewer, whoever made them. Reported, never cancelled on a name alone. */
const TESTY = /\b(sanity|test|testing|rehearsal)\b/i;

/** A sanity race one of `ours` created and could still cancel. */
export function isOurSanityRace(race: RaceState, ours: ReadonlySet<string>): boolean {
  return ours.has(race.organiser) && SANITY.test(race.name) && !TERMINAL.includes(race.status);
}

/**
 * Everything on the default list that reads as a test, split by whether we
 * can cancel it. `theirs` is the list to hand to the organiser who owns it.
 */
export function litter(races: readonly RaceState[], ours: ReadonlySet<string>, nowS: bigint) {
  const cancellable = races.filter((race) => isOurSanityRace(race, ours));
  const theirs = races.filter(
    (race) => !ours.has(race.organiser) && TESTY.test(race.name) && !TERMINAL.includes(race.status) && visible(race, nowS),
  );
  return { cancellable, theirs };
}

export interface CancelOutcome {
  eventId: number;
  before: string;
  txHash?: string;
  error?: string;
}

/** The two calls cancelling needs, as `SterunClient` exposes them. */
export interface CancelClient {
  getEvent(eventId: number): Promise<{ status: string }>;
  setEventStatus(eventId: number, status: "Cancelled", options?: unknown): Promise<{ txHash: string }>;
}

/**
 * Cancels each race that is not already terminal, re-reading its status first
 * so a race that completed or was cancelled meanwhile is left alone. One
 * failure does not stop the rest; each outcome is returned for the evidence.
 */
export async function cancelRaces(client: CancelClient, eventIds: readonly number[], options: unknown): Promise<CancelOutcome[]> {
  const out: CancelOutcome[] = [];
  for (const eventId of eventIds) {
    let before = "unknown";
    try {
      before = (await client.getEvent(eventId)).status;
      if (TERMINAL.includes(before)) {
        out.push({ eventId, before });
        continue;
      }
      const sent = await client.setEventStatus(eventId, "Cancelled", options);
      out.push({ eventId, before, txHash: sent.txHash });
    } catch (error) {
      out.push({ eventId, before, error: error instanceof Error ? error.message.split("\n")[0]!.slice(0, 300) : String(error) });
    }
  }
  return out;
}
