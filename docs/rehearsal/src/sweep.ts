/**
 * STE-68 — take the sc/ sanity races off the directory.
 *
 * `sc/scripts/*-testnet.sh` prove each contract upgrade on the live network by
 * creating a race ("Sterun bib uniqueness sanity 2026-09-14", …) with a
 * fixture `starts_at` in 2027 and no document, and none of them cancels it.
 * On 2026-09-25 those were the first five rows a reviewer saw. They are signed
 * by the `sterun-organiser` CLI identity, which is kept, so they can be
 * cancelled after the fact — which this does, and only this (cleanup.ts has
 * the rules and why they are narrow).
 *
 * The scripts themselves are in sc/, outside this ticket's reach, so the
 * next upgrade script will add one more; running the sweep again (it is the
 * first step of every seed run) takes it off again.
 *
 * The key is read from `STERUN_SANITY_ORGANISER_SECRET`, or from the stellar
 * CLI (`stellar keys secret sterun-organiser`), and never printed. Without it
 * the sweep reports what it would cancel and ends MANUAL REQUIRED.
 */
import { execFileSync } from "node:child_process";

import { Keypair } from "@stellar/stellar-sdk";
import { SterunClient } from "@sterunxyz/sdk";

import { cancelRaces, litter, type RaceState } from "./cleanup";
import type { StepContext } from "./evidence";
import { API, remember } from "./harness";

export const SANITY_IDENTITY = process.env.STERUN_SANITY_IDENTITY ?? "sterun-organiser";

/** The sanity scripts' organiser, if this machine holds it. The secret is registered, never printed. */
export function sanityOrganiser(env: Map<string, string>): { kp: Keypair; from: string } | null {
  const fromEnv = process.env.STERUN_SANITY_ORGANISER_SECRET ?? env.get("STERUN_SANITY_ORGANISER_SECRET");
  if (fromEnv) return { kp: Keypair.fromSecret(remember(fromEnv)), from: "STERUN_SANITY_ORGANISER_SECRET" };
  try {
    const secret = execFileSync("stellar", ["keys", "secret", SANITY_IDENTITY], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return { kp: Keypair.fromSecret(remember(secret)), from: `the stellar CLI identity ${SANITY_IDENTITY}` };
  } catch {
    return null;
  }
}

/** Every race on the live registry, read from chain (the index can lag). */
export async function allRaces(sterun: SterunClient): Promise<RaceState[]> {
  const count = await sterun.eventCount();
  const races: RaceState[] = [];
  for (let eventId = 0; eventId < count; eventId += 1) {
    const e = await sterun.getEvent(eventId);
    races.push({ eventId, name: e.name, status: e.status, organiser: e.organiser, startsAt: e.startsAt });
  }
  return races;
}

export async function sweepSanityRaces(
  s: StepContext,
  sterun: SterunClient,
  env: Map<string, string>,
  opts: { apply: boolean },
): Promise<{ cancelled: number[]; theirs: RaceState[] }> {
  const key = sanityOrganiser(env);
  const races = await allRaces(sterun);
  const nowS = BigInt(Math.floor(Date.now() / 1000));
  const ours = new Set(key ? [key.kp.publicKey()] : []);
  const { cancellable, theirs } = litter(races, ours, nowS);
  s.note(`read ${races.length} races from the live registry`);

  for (const race of theirs) {
    s.note(`NOT OURS, left for its organiser ${race.organiser}: race ${race.eventId} "${race.name}" (${race.status})`);
  }
  if (theirs.length) s.note("the races above were created by a wallet this machine holds no key for; cancelling them would fail as a non-organiser, which is correct — ask their organiser to cancel them in the console");

  if (!key) {
    s.note(`no key for the sanity scripts' organiser: set STERUN_SANITY_ORGANISER_SECRET or add the stellar CLI identity ${SANITY_IDENTITY}`);
    s.manual("Axel", `cancel the sc/ sanity races with the ${SANITY_IDENTITY} key (docs/rehearsal/seed.sh --sweep-only on a machine that holds it)`, "STE-68");
    return { cancelled: [], theirs };
  }
  s.note(`sanity organiser ${key.kp.publicKey()}, key from ${key.from}`);
  if (cancellable.length === 0) {
    s.note("no sanity race of ours is still open");
    return { cancelled: [], theirs };
  }
  for (const race of cancellable) s.note(`ours: race ${race.eventId} "${race.name}" (${race.status})`);
  if (!opts.apply) {
    s.note(`dry run: ${cancellable.length} race(s) would be cancelled; run with --apply to cancel them`);
    return { cancelled: [], theirs };
  }

  const outcomes = await cancelRaces(sterun, cancellable.map((r) => r.eventId), SterunClient.as(key.kp));
  for (const o of outcomes) {
    if (o.txHash) s.tx(`set_event_status Cancelled — race ${o.eventId} was ${o.before}`, o.txHash);
    else if (o.error) s.note(`race ${o.eventId}: cancelling FAILED — ${o.error}`);
    else s.note(`race ${o.eventId} became ${o.before} meanwhile: left`);
    s.url(`GET /events/${o.eventId}`, `${API}/events/${o.eventId}`);
  }
  const failed = outcomes.filter((o) => o.error);
  s.check(failed.length === 0, `every sanity race of ours is cancelled; failed: ${failed.map((o) => o.eventId).join(", ")}`);
  return { cancelled: outcomes.filter((o) => o.txHash).map((o) => o.eventId), theirs };
}
