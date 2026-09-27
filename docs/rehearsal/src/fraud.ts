/**
 * The SOW's two deliberate fraud attempts, as steps both the rehearsal
 * (mock-race.ts) and the demo seed (seed.ts) run — one implementation, so the
 * demo data and the evidence pack are the same exercise (STE-68).
 *
 *   forwardedScreenshot   F.1 (STE-67): a screenshot of a runner's pass,
 *                         presented after the scanner's tolerance has passed,
 *                         is refused; the runner's live pass is accepted.
 *   oneWinnerOneFlag      the duplicate race-pack collection: two offline
 *                         desks both handed a pack to the same runner; the
 *                         chain keeps one claim and the losing desk flags it.
 *
 * Both run the web app's own scanner and pass code in separate processes
 * (device.ts); nothing here decides a verdict itself.
 */
import { rpc } from "@stellar/stellar-sdk";
import type { SterunClient } from "@sterunxyz/sdk";

import { timeStepOf } from "../../../fe/src/lib/totp";
import type { Device } from "./device-process";
import type { StepContext } from "./evidence";
import { HORIZON, server } from "./harness";
import { FILMING_NOTE, honestyNote, staleFrom, waitUntilStale, type TotpWindow } from "./stale-qr";

/** A runner as the desks see them: an entered record and the pass's secret. */
export interface PassHolder {
  label: string;
  tokenId: number;
  bib: number;
  totpSecret: string;
}

export type Verdict = { kind: string; shownBib: number | null; claimedHere: boolean | null; offline: boolean };

/** The runner's phone shows the pass; an offline desk scans it. */
export async function scanAt(s: StepContext, phones: Device, desk: Device, deskName: string, eventId: number, r: PassHolder): Promise<Verdict> {
  const { qr } = await phones.call<{ qr: string }>("present", { tokenId: r.tokenId, secretHex: r.totpSecret });
  const verdict = await desk.call<Verdict>("scan", { eventId, qr });
  s.check(verdict.offline, `${deskName} was offline during the scan`);
  s.note(`${deskName} scans ${r.label}: ${verdict.kind.toUpperCase()}, screen shows bib ${verdict.shownBib} (chain bib ${r.bib})${verdict.claimedHere ? ", claimed at this desk" : ""}`);
  s.check(verdict.shownBib === r.bib, `the desk shows ${r.label}'s chain bib`);
  return verdict;
}

/**
 * F.1. Both desks must be offline with the roster downloaded, and `r` must be
 * a runner neither desk has scanned: a desk checks "already claimed" before
 * the code, so a runner already queued would read RED, not EXPIRED.
 *
 * The wait is real time, read from the roster; a mocked clock would prove the
 * unit test, not the product.
 */
export async function forwardedScreenshot(
  s: StepContext,
  ctx: { sterun: SterunClient; eventId: number; phones: Device; staleDesk: [string, Device]; liveDesk: [string, Device]; runner: PassHolder },
): Promise<void> {
  const { sterun, eventId: id, phones, runner: r } = ctx;
  const [staleName, staleDesk] = ctx.staleDesk;
  const [liveName, liveDesk] = ctx.liveDesk;
  const stepStarted = Date.now();

  const totp = await staleDesk.call<TotpWindow & { digits: number }>("totp", { eventId: id });
  s.note(`roster totp as ${staleName} stored it: step ${totp.stepSeconds}s, tolerance ±${totp.toleranceSteps} step(s), ${totp.digits} digits`);
  s.check(Number.isInteger(totp.toleranceSteps) && totp.toleranceSteps >= 0, "the roster carries a tolerance");
  s.check(timeStepOf(3600) * totp.stepSeconds === 3600, `the pass and the roster count steps of the same length (${totp.stepSeconds}s)`);
  s.note(honestyNote(totp));
  s.note(FILMING_NOTE);

  const queueBefore = await staleDesk.call<{ tokenId: number }[]>("claims", { eventId: id });
  const recordBefore = await sterun.recordOf(r.tokenId);
  s.check(recordBefore.state === "Entered", `${r.label} is Entered before the screenshot, got ${recordBefore.state}`);

  // 1. The screenshot: the runner's QR text at one moment, the pass's own code.
  const shot = await phones.call<{ qr: string; step: number }>("present", { tokenId: r.tokenId, secretHex: r.totpSecret });
  const takenAt = Date.now();
  const refusedFrom = staleFrom(shot.step, totp) * 1000;
  s.note(`screenshot of ${r.label}'s pass taken ${new Date(takenAt).toISOString()} (step ${shot.step}); a desk on the same clock accepts it until ${new Date(refusedFrom - 1000).toISOString()} and refuses it from ${new Date(refusedFrom).toISOString()}`);

  // 2. The wait, in real time, until the desk's own rule refuses the step.
  const waitMs = waitUntilStale(shot.step, totp, Date.now());
  s.note(`waiting ${(waitMs / 1000).toFixed(1)}s of real time (tolerance from the roster + 2s margin), no mocked clock`);
  await new Promise((resolve) => setTimeout(resolve, waitMs));

  // 3. The friend presents it at the other desk.
  const presentedAt = Date.now();
  const stale = await staleDesk.call<Verdict>("scan", { eventId: id, qr: shot.qr });
  const ageSeconds = (presentedAt - takenAt) / 1000;
  s.note(`${staleName} scans the screenshot ${ageSeconds.toFixed(1)}s after it was taken: ${stale.kind.toUpperCase()}, screen shows bib ${stale.shownBib}`);
  s.check(stale.offline, `${staleName} was offline during the scan`);
  s.check(presentedAt >= refusedFrom, "the screenshot was presented only after the scanner's tolerance had passed");

  // 4. Refused, nothing queued, the record untouched.
  s.check(stale.kind === "expired", `the stale screenshot is EXPIRED at ${staleName}, got ${stale.kind}`);
  const queueAfter = await staleDesk.call<{ tokenId: number }[]>("claims", { eventId: id });
  s.check(!queueAfter.some((c) => c.tokenId === r.tokenId), `${staleName} queued no claim for ${r.label}`);
  s.check(JSON.stringify(queueAfter) === JSON.stringify(queueBefore), `${staleName}'s queue is unchanged (${queueBefore.length} rows before and after)`);
  const recordAfter = await sterun.recordOf(r.tokenId);
  s.check(
    recordAfter.state === recordBefore.state && recordAfter.claimedAt === recordBefore.claimedAt,
    `${r.label}'s record is untouched: ${recordAfter.state}, claimed_at ${recordAfter.claimedAt}`,
  );

  // Then the runner, with the live pass: the pass works, the screenshot does not.
  const live = await scanAt(s, phones, liveDesk, liveName, id, r);
  s.check(live.kind === "green", `${r.label}'s current code is GREEN at ${liveName}, got ${live.kind}`);
  const queueLive = await liveDesk.call<{ tokenId: number }[]>("claims", { eventId: id });
  s.check(queueLive.filter((c) => c.tokenId === r.tokenId).length === 1, `${liveName} queued ${r.label} once`);

  s.note(`step took ${((Date.now() - stepStarted) / 1000).toFixed(1)}s, almost all of it the wait: the screenshot had to outlive the roster's ±${totp.toleranceSteps} step tolerance before it was shown`);
}

/** One desk's row for a runner after its last press of Send. */
export type ClaimRow = { tokenId: number; bibNo: number; status: string; txHash?: string; reason?: string };

/**
 * The duplicate collection, after both desks have sent: exactly one claim
 * landed, the other desk's was refused as already claimed (on the ledger or at
 * simulation — both are recorded), and the losing desk's Flagged screen says so.
 */
export async function oneWinnerOneFlag(
  s: StepContext,
  ctx: {
    sterun: SterunClient;
    eventId: number;
    runner: { label: string; tokenId: number };
    rows: Record<"desk-A" | "desk-B", ClaimRow | undefined>;
    devices: Record<"desk-A" | "desk-B", Device>;
    addresses: Record<"desk-A" | "desk-B", string>;
  },
): Promise<void> {
  const { rows, runner: r } = ctx;
  const a = rows["desk-A"];
  const b = rows["desk-B"];
  s.note(`desk-A ${r.label} row: ${JSON.stringify(a)}`);
  s.note(`desk-B ${r.label} row: ${JSON.stringify(b)}`);
  const winners = [a, b].filter((c) => c?.status === "sent");
  const losers = [a, b].filter((c) => c?.status === "refused");
  s.check(winners.length === 1 && losers.length === 1, `exactly one sent and one refused, got ${[a, b].map((c) => c?.status).join("/")}`);
  const winnerName = a?.status === "sent" ? "desk-A" : "desk-B";
  const loserName = winnerName === "desk-A" ? "desk-B" : "desk-A";
  s.tx(`winner ${winnerName} claim_racepack ${r.label}`, winners[0]!.txHash!);
  s.check(losers[0]!.reason === "already-claimed", "loser refused as already-claimed");
  const record = await ctx.sterun.recordOf(r.tokenId);
  s.note(`chain: ${r.label} ${record.state}, claimed_at ${record.claimedAt}; one pack is recorded, the second handover is what the flag is for`);

  const historyUrl = `${HORIZON}/accounts/${ctx.addresses[loserName]}/transactions?include_failed=true&order=asc&limit=50`;
  const history = (await (await fetch(historyUrl)).json()) as { _embedded: { records: { hash: string; successful: boolean; ledger: number }[] } };
  const failed = history._embedded.records.filter((t) => !t.successful);
  s.url(`${loserName} transactions incl. failed (Horizon)`, historyUrl);
  const winnerTx = await server.getTransaction(winners[0]!.txHash!);
  for (const t of failed) {
    s.tx(`${loserName} claim that FAILED on the ledger`, t.hash);
    const got = await server.getTransaction(t.hash);
    const diagnostics = JSON.stringify(got.status === rpc.Api.GetTransactionStatus.FAILED ? got.diagnosticEventsXdr ?? [] : []);
    const code = /"host_fn_failed"\},\{"error":\{"contract":(\d+)\}/.exec(diagnostics)?.[1];
    s.note(`${t.hash.slice(0, 8)}…: status ${got.status}, ledger ${t.ledger} (winner in ledger ${"ledger" in winnerTx ? winnerTx.ledger : "?"}), diagnostic host_fn_failed contract error ${code ?? "not found"}${code === "102" ? " = AlreadyClaimed" : ""}`);
  }
  if (failed.length === 0) {
    s.note(`${loserName}'s claim never reached the ledger: it was refused at simulation because the winner's transaction had already closed`);
  }
  const flagged = await ctx.devices[loserName].call<{ lines: string[]; copied: string }>("flagged", { eventId: ctx.eventId });
  s.note(`${loserName} Flagged screen: ${JSON.stringify(flagged.lines)}`);
  s.note(`${loserName} "copy for organiser": ${JSON.stringify(flagged.copied)}`);
  s.check(flagged.lines.length === 1 && /Already collected elsewhere/.test(flagged.lines[0]!), "the flag appears on the losing desk");
  s.note("two desks = two OS processes, each with its own IndexedDB and queue, running the web app's scanner code");
}
