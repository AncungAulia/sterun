/**
 * STE-68 — seed the live testnet demo a reviewer clicks through.
 *
 *     docs/rehearsal/seed.sh                # sweep + seed, evidence in docs/rehearsal/runs/<UTC>-seed/
 *     docs/rehearsal/seed.sh --sweep-only   # only take the sc/ sanity races off the directory
 *     docs/rehearsal/seed.sh --no-sweep     # seed without sweeping
 *
 * What one run leaves behind is demo-plan.ts: four races with a document and a
 * poster each, twenty-five records, one race already run with finish times,
 * and the SOW's two fraud attempts at that race's pack desks. The steps drive
 * the same code the product runs, the way the rehearsal does (README.md):
 *
 *   organiser, runners   @sterunxyz/sdk + the live API, as the console and the
 *                        entry flow call them; the event document is built by
 *                        the console's own `buildEventDocument`
 *   desk-A, desk-B       separate processes running the web app's scanner
 *                        (device.ts), for the two fraud attempts
 *   main desk            one hand-over for everyone else, in one signature when
 *                        the live contract has `claim_racepack_many` (claims.ts)
 *
 * Accounts: the admin key and the demo organiser's key come from the repo-root
 * `.env`. The organiser is created on the first run and its secret appended
 * there as STERUN_DEMO_ORGANISER_SECRET, so the organiser console can be
 * opened as it (import the key into a wallet) and a later run replaces this
 * demo rather than stacking a second copy beside it. Runner and desk keys are
 * written to `.env.demo` (gitignored, 0600) so a pass can be shown on a phone
 * for the video. No secret is ever printed or written to the evidence.
 */
import { createHash, randomInt } from "node:crypto";
import { appendFileSync, chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Asset, Keypair } from "@stellar/stellar-sdk";
import { SterunClient, TESTNET, chunkResults, type SterunResult } from "@sterunxyz/sdk";

import { parseDeployments, type Deployments } from "../../../be/src/deployments";
import { chooseClaimPath, claimRacepacks, sdkHasBatch, type ClaimPath } from "./claims";
import { cancelRaces } from "./cleanup";
import { eventDocument } from "./demo-document";
import {
  ENTRIES,
  RACES,
  RACE_DAY,
  RESULTS,
  entryPrice,
  race,
  raceDate,
  resultsCsv,
  runner as plannedRunner,
  runnersInPlay,
  spendByRunner,
  startsAt,
  type PlannedRace,
} from "./demo-plan";
import { Device } from "./device-process";
import { BlockedError, Evidence, accountUrl, contractUrl } from "./evidence";
import { fundFromFaucet, payoutBudget } from "./faucet";
import { forwardedScreenshot, oneWinnerOneFlag, scanAt, type ClaimRow, type PassHolder } from "./fraud";
import {
  API,
  APP,
  REPO,
  SUSD,
  addTrustline,
  api,
  checkLinks,
  contractExports,
  friendbot,
  log,
  newAccount,
  postFaucet,
  readEnvFile,
  remember,
  secrets,
  server,
  signedHeaders,
  sleep,
  susdBalance,
  waitFor,
} from "./harness";
import { allRaces, sweepSanityRaces } from "./sweep";

const RUN_DIR = process.env.REHEARSAL_RUN_DIR ?? join(REPO, "docs", "rehearsal", "runs", "local-seed");
const DEVICE_BUNDLE = process.env.REHEARSAL_DEVICE_BUNDLE ?? "";
const POSTERS = join(REPO, "docs", "rehearsal", "demo", "posters");
const ARGS = new Set(process.argv.slice(2));
const SWEEP_ONLY = ARGS.has("--sweep-only");
const NO_SWEEP = ARGS.has("--no-sweep");
const ORGANISER_ENV = "STERUN_DEMO_ORGANISER_SECRET";

const newDevice = (role: string) => new Device(role, DEVICE_BUNDLE, [`--env-file=${join(REPO, "fe", ".env")}`]);
const stroops = (susd: number) => BigInt(susd) * SUSD;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

interface Person {
  label: string;
  kp: Keypair;
  nationalId: string;
  emergencyContact: string;
}

interface Entered {
  tokenId: number;
  bib: number;
  participantHash: string;
  totpSecret: string;
}

async function main(): Promise<void> {
  const env = readEnvFile(join(REPO, ".env"));
  const deployments: Deployments = parseDeployments(readFileSync(join(REPO, "docs", "deployments.md"), "utf8"));
  const contracts = { eventRegistry: deployments.eventRegistry, raceRecord: deployments.raceRecord };
  const sterun = new SterunClient({ ...TESTNET, contracts });
  const susd = new Asset("sUSD", deployments.susdIssuer);
  const now = new Date();

  const ev = new Evidence(RUN_DIR, () => secrets, {
    title: "STE-68 demo data — evidence",
    script: `docs/rehearsal/seed.sh${SWEEP_ONLY ? " --sweep-only" : NO_SWEEP ? " --no-sweep" : ""}`,
    legend:
      "`S` = setup, `D` = directory clean-up, `P` = a race published, `E` = its entries, `K` = race-pack day at the race that has run, " +
      "`F` = the SOW's two fraud attempts, `R` = results, `V` = what a reviewer opens, `M` = manual.",
  });
  ev.meta.started = now.toISOString();
  ev.meta.network = "Stellar testnet";
  ev.meta.api = API;
  ev.meta.app = APP;
  ev.meta.EventRegistry = deployments.eventRegistry;
  ev.meta.RaceRecord = deployments.raceRecord;
  ev.meta["sUSD SAC"] = deployments.susdSac;
  ev.meta.git = process.env.REHEARSAL_GIT ?? "unknown";
  ev.write();

  // -------------------------------------------------------------- directory
  if (!NO_SWEEP) {
    await ev.step("D.0", "D", "Take the sc/ sanity races off the directory (cancel; there is no delete)", "SDK + stellar CLI key", async (s) => {
      await sweepSanityRaces(s, sterun, env, { apply: true });
    });
  }
  if (SWEEP_ONLY) return finish(ev);

  // -------------------------------------------------------------- preflight
  let claimPath: ClaimPath = chooseClaimPath(null, false);
  let faucetAmount = 0n;
  const pre = await ev.step("S.1", "S", "Preflight: the live backend serves these contracts, the faucet can pay this run, the claim path", "API + RPC", async (s) => {
    const health = await api("/health");
    s.url("GET /health", `${API}/health`);
    s.check(health.status === 200, `/health 200, got ${health.status}`);
    const config = await api<{
      addresses: Deployments;
      faucet: { amountStroops: string; route: { available: boolean; reason: string | null; dailyCapStroops: string } };
    }>("/config");
    s.url("GET /config", `${API}/config`);
    for (const key of ["eventRegistry", "raceRecord", "susdSac", "susdIssuer"] as const) {
      s.check(config.body.addresses[key] === deployments[key], `/config ${key} equals docs/deployments.md`);
    }
    const route = config.body.faucet.route;
    s.check(route.available, `the faucet route is available (${route.reason ?? "no reason given"})`);
    faucetAmount = BigInt(config.body.faucet.amountStroops);
    const budget = payoutBudget(route, config.body.faucet.amountStroops, runnersInPlay().length);
    s.note(`faucet: ${Number(faucetAmount / SUSD)} sUSD a payout, ${budget.perDay} payouts per 24h; this run needs ${budget.needed}`);
    s.check(budget.fits, `this run's ${budget.needed} payouts fit the daily cap of ${budget.perDay}`);
    for (const [label, spend] of spendByRunner()) {
      s.check(stroops(spend) <= faucetAmount, `${label}'s entries (${spend} sUSD) fit one payout`);
    }
    const contractHas = await contractExports(deployments.raceRecord, "claim_racepack_many");
    claimPath = chooseClaimPath(contractHas, sdkHasBatch(sterun));
    s.note(`claim path: ${claimPath.kind.toUpperCase()} — ${claimPath.why}`);
  });
  if (pre.status !== "PASS") {
    log("\npreflight failed: nothing was created. Fix the cause above and run again.");
    return finish(ev);
  }

  // -------------------------------------------------------------- the organiser
  const organiserSecret = process.env[ORGANISER_ENV] ?? env.get(ORGANISER_ENV);
  const organiser = organiserSecret ? Keypair.fromSecret(remember(organiserSecret)) : newAccount();
  ev.meta.organiser = organiser.publicKey();
  const admin = (() => {
    const secret = process.env.STERUN_ADMIN_SECRET ?? env.get("STERUN_ADMIN_SECRET");
    return secret ? Keypair.fromSecret(remember(secret)) : null;
  })();

  const org = await ev.step("S.2", "S", "The demo organiser: funded, sUSD trustline, allowlisted", "Friendbot + SDK", async (s) => {
    if (!organiserSecret) {
      // Saved before anything is spent on it, so a run that dies later still leaves the key behind.
      appendFileSync(join(REPO, ".env"), `\n# STE-68 demo organiser (docs/rehearsal/seed.sh). Import into a wallet to open the console as it.\n${ORGANISER_ENV}=${organiser.secret()}\n`);
      chmodSync(join(REPO, ".env"), 0o600);
      s.note(`a new demo organiser was created; its secret was appended to .env as ${ORGANISER_ENV} (value not printed)`);
    } else {
      s.note(`the demo organiser from .env (${ORGANISER_ENV})`);
    }
    s.url("organiser", accountUrl(organiser.publicKey()));
    try {
      await server.getAccount(organiser.publicKey());
    } catch {
      await friendbot(organiser.publicKey());
      s.note("funded with Friendbot");
    }
    const { balanceEntry } = await server.getAssetBalance(organiser.publicKey(), susd, TESTNET.networkPassphrase);
    if (!balanceEntry) s.tx("organiser changeTrust sUSD", await addTrustline(organiser, susd));
    if (!(await sterun.isOrganiser(organiser.publicKey()))) {
      if (!admin) throw new Error("STERUN_ADMIN_SECRET is not set (repo root .env), and the organiser is not allowlisted yet");
      s.tx("add_organiser", (await sterun.addOrganiser(organiser.publicKey(), SterunClient.as(admin))).txHash);
    }
    s.check(await sterun.isOrganiser(organiser.publicKey()), "is_organiser true");
    s.url("organiser console (connect this wallet)", `${APP}/org`);
  });
  if (org.status !== "PASS") return finish(ev);

  await ev.step("D.1", "D", "Retire the previous demo: cancel this organiser's races from an earlier seed that are still open", "SDK", async (s) => {
    const names = new Set(RACES.map((r) => r.name));
    const previous = (await allRaces(sterun)).filter(
      (r) => r.organiser === organiser.publicKey() && names.has(r.name) && r.status !== "Completed" && r.status !== "Cancelled",
    );
    if (previous.length === 0) {
      s.note("no earlier demo race of this organiser is open");
      return;
    }
    const outcomes = await cancelRaces(sterun, previous.map((r) => r.eventId), SterunClient.as(organiser));
    for (const o of outcomes) {
      if (o.txHash) s.tx(`set_event_status Cancelled — earlier demo race ${o.eventId} (${o.before})`, o.txHash);
      else if (o.error) s.note(`race ${o.eventId}: cancelling FAILED — ${o.error}`);
    }
    s.note("a re-run replaces the demo instead of stacking a second copy of every race on the directory; a Completed race cannot be cancelled and is off the default list by its date");
    s.check(outcomes.every((o) => !o.error), "every earlier open demo race is cancelled");
  });

  // -------------------------------------------------------------- wallets
  const people = new Map<string, Person>();
  for (const r of runnersInPlay()) {
    people.set(r.label, {
      label: r.label,
      kp: newAccount(),
      nationalId: `3372${String(randomInt(10 ** 11, 10 ** 12 - 1))}`,
      emergencyContact: `+62812${String(randomInt(10 ** 6, 10 ** 7 - 1))}`,
    });
  }
  const deskKeys = { "desk-A": newAccount(), "desk-B": newAccount() };
  ev.meta["desk-A scanner (also the main desk)"] = deskKeys["desk-A"].publicKey();
  ev.meta["desk-B scanner"] = deskKeys["desk-B"].publicKey();
  ev.meta.runners = [...people.values()].map((p) => `${p.label} ${plannedRunner(p.label).name} ${p.kp.publicKey()}`).join(", ");
  // For the video: a pass can only be shown from its runner's wallet.
  const demoKeys = join(REPO, ".env.demo");
  writeFileSync(
    demoKeys,
    [
      `# STE-68 demo keys from the seed run started ${now.toISOString()}. Testnet only. Overwritten by the next run.`,
      // The name on its own line: some env parsers keep an inline `# …` as part of the value.
      ...[...people.values()].flatMap((p) => [`# ${p.label} ${plannedRunner(p.label).name}`, `DEMO_${p.label}_SECRET=${p.kp.secret()}`]),
      `DEMO_DESK_A_SECRET=${deskKeys["desk-A"].secret()}`,
      `DEMO_DESK_B_SECRET=${deskKeys["desk-B"].secret()}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  chmodSync(demoKeys, 0o600); // `mode` only applies when the file is created
  ev.write();

  const wallets = await ev.step("S.3", "S", `Fund ${people.size} runners and 2 desks; runners get test sUSD from the web app's faucet route`, "Friendbot + changeTrust + POST /faucet", async (s) => {
    for (const kp of [...[...people.values()].map((p) => p.kp), deskKeys["desk-A"], deskKeys["desk-B"]]) await friendbot(kp.publicKey());
    s.note(`runner and desk keys written to .env.demo (0600, gitignored) for showing a pass on a phone; values not printed`);
    let paid = 0;
    for (const p of people.values()) {
      s.tx(`${p.label} changeTrust sUSD`, await addTrustline(p.kp, susd));
      const payout = await fundFromFaucet(postFaucet(p.kp), p.label, paid);
      paid += 1;
      s.tx(`${p.label} faucet ${Number(payout.paidStroops / SUSD)} sUSD`, payout.txHash);
      await sleep(10_500); // the faucet's per-client limit is 6 a minute
    }
    s.url("POST /faucet", `${API}/faucet`);
  });
  if (wallets.status !== "PASS") {
    if (wallets.error?.includes("FaucetDailyCapReached")) log("\nthe faucet's daily cap stopped this run; see S.3 for when to run again");
    return finish(ev);
  }

  // -------------------------------------------------------------- races
  const raceIds = new Map<PlannedRace["key"], number>();
  const categoryIds = new Map<string, number>();
  const addOnIds = new Map<string, number>();
  const entered = new Map<string, Entered>();
  const need = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new BlockedError(`${what} is missing because an earlier step failed`);
    return value;
  };

  const upload = async (bytes: Uint8Array, contentType: string) => {
    const res = await api<{ url: string; sha256: string; created: boolean; error?: string; message?: string }>("/events/files", {
      method: "POST",
      headers: { ...(await signedHeaders(organiser)), "content-type": contentType },
      body: Buffer.from(bytes),
    });
    if (res.status !== 201) throw new Error(`POST /events/files answered ${res.status} ${JSON.stringify(res.body)}`);
    // Content-addressed: the url ends with the sha256 of the bytes. A mismatch means they changed in transit.
    if (res.body.sha256 !== sha256(bytes)) throw new Error(`uploaded ${sha256(bytes)} but the store answered ${res.body.sha256}`);
    return res.body;
  };

  for (const r of RACES) {
    await ev.step(`P.${r.key}`, "P", `Publish ${r.name}: poster and document through POST /events/files, then create, distances, add-ons, open`, "API + SDK (the console's run)", async (s) => {
      const day = raceDate(r, now);
      const gun = startsAt(r, now);
      s.note(`race day ${day} ${r.gunStart} ${r.timeZone} (starts_at ${gun}, ${new Date(gun * 1000).toISOString()})`);

      const posterBytes = readFileSync(join(POSTERS, r.poster));
      const poster = await upload(posterBytes, "image/jpeg");
      s.url(`poster ${r.poster}${poster.created ? "" : " (already stored)"}`, poster.url);

      const { text, closesAt } = eventDocument(r, now, poster.url);
      const document = await upload(new TextEncoder().encode(text), "application/json");
      s.url("event document", document.url);

      const created = await sterun.createEvent(
        { organiser: organiser.publicKey(), name: r.name, metadataHash: document.sha256, uri: document.url, startsAt: BigInt(gun) },
        SterunClient.as(organiser),
      );
      const id = created.value;
      raceIds.set(r.key, id);
      ev.meta[`race ${r.key}`] = id;
      s.tx(`create_event → event ${id}`, created.txHash);
      for (const c of r.categories) {
        const added = await sterun.addCategory({ eventId: id, code: c.code, distanceM: c.distanceM, quota: c.quota, priceStroops: stroops(c.priceSusd) }, SterunClient.as(organiser));
        categoryIds.set(`${r.key}/${c.code}`, added.value);
        s.tx(`add_category ${c.code} quota ${c.quota} @ ${c.priceSusd} sUSD → ${added.value}`, added.txHash);
      }
      for (const a of r.addOns) {
        const added = await sterun.addAddon({ eventId: id, code: a.code, priceStroops: stroops(a.priceSusd), quota: a.quota }, SterunClient.as(organiser));
        addOnIds.set(`${r.key}/${a.code}`, added.value);
        s.tx(`add_addon ${a.code} ${a.priceSusd} sUSD ×${a.quota} → ${added.value}`, added.txHash);
      }
      if (closesAt !== null) {
        s.tx(`set_registration_closes ${new Date(closesAt * 1000).toISOString()}`, (await sterun.setRegistrationCloses(id, closesAt, SterunClient.as(organiser))).txHash);
      }
      s.tx("set_event_status Open", (await sterun.setEventStatus(id, "Open", SterunClient.as(organiser))).txHash);

      // What the event page does: fetch the uri, hash the bytes, compare with the chain.
      const onChain = await sterun.getEvent(id);
      const served = new Uint8Array(await (await fetch(onChain.uri)).arrayBuffer());
      s.check(sha256(served) === onChain.metadataHash, "the document served at uri hashes to the metadata_hash on chain, so the race page will show it");
      s.check(onChain.status === "Open", `status Open, got ${onChain.status}`);
      s.url(`race page`, `${APP}/events/${id}`);
      s.url(`GET /events/${id}`, `${API}/events/${id}`);
    });
  }

  // -------------------------------------------------------------- entries
  for (const r of RACES) {
    await ev.step(`E.${r.key}`, "E", `Runners enter ${r.name} through the entry flow and pay sUSD`, "API + SDK (the entry flow's calls)", async (s) => {
      const id = need(raceIds.get(r.key), `${r.key} race`);
      for (const entry of ENTRIES.filter((x) => x.race === r.key)) {
        const p = need(people.get(entry.runner), entry.runner);
        const who = plannedRunner(entry.runner);
        const categoryId = need(categoryIds.get(`${r.key}/${entry.category}`), `${r.key} ${entry.category}`);
        const submitted = await api<{ participant_hash: string; salt: string; totp_secret: string }>("/participants", {
          method: "POST",
          headers: { ...(await signedHeaders(p.kp)), "content-type": "application/json" },
          body: JSON.stringify({
            name: who.name,
            national_id: p.nationalId,
            emergency_contact: p.emergencyContact,
            id_type: "national_id_card",
            bib_name: who.bibName,
            email: `${who.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
            phone: p.emergencyContact,
            gender: who.gender,
            date_of_birth: who.dateOfBirth,
            emergency_contact_name: "Keluarga",
            event_id: id,
            category_id: categoryId,
            runner_address: p.kp.publicKey(),
          }),
        });
        s.check(submitted.status === 201, `${entry.runner} POST /participants 201, got ${submitted.status} ${JSON.stringify(submitted.body)}`);
        remember(submitted.body.salt);
        const totpSecret = remember(submitted.body.totp_secret);
        const price = stroops(entryPrice(entry));
        const before = await susdBalance(p.kp.publicKey(), susd);
        const sent = await sterun.enter(
          {
            runner: p.kp.publicKey(),
            eventId: id,
            categoryId,
            addOnIds: entry.addOns.map((code) => need(addOnIds.get(`${r.key}/${code}`), `${r.key} ${code}`)),
            participantHash: submitted.body.participant_hash,
          },
          SterunClient.as(p.kp),
        );
        const record = await sterun.recordOf(sent.value);
        const after = await susdBalance(p.kp.publicKey(), susd);
        entered.set(`${r.key}/${entry.runner}`, { tokenId: sent.value, bib: record.bibNo, participantHash: submitted.body.participant_hash, totpSecret });
        s.tx(`${entry.runner} ${who.name} enters ${entry.category}${entry.addOns.length ? ` + ${entry.addOns.join(", ")}` : ""} → token ${sent.value}, bib ${record.bibNo}`, sent.txHash);
        s.check(before - after === price, `${entry.runner} paid exactly ${price} stroops, paid ${before - after}`);
        s.check(record.participantHash === submitted.body.participant_hash, `${entry.runner}'s on-chain participant_hash is the vault's`);
      }
    });
  }

  // -------------------------------------------------------------- race-pack day
  const ran = race(RACE_DAY.race);
  const soloId = raceIds.get(ran.key);
  const soloRunners = ENTRIES.filter((x) => x.race === ran.key).map((x) => x.runner);
  const tokenOf = (label: string) => need(entered.get(`${ran.key}/${label}`), `${label}'s ${ran.key} record`);
  const holder = (label: string): PassHolder => ({ label, ...tokenOf(label) });
  const deskAddress = { "desk-A": deskKeys["desk-A"].publicKey(), "desk-B": deskKeys["desk-B"].publicKey() };

  const deskA = newDevice("desk-A");
  const deskB = newDevice("desk-B");
  const phones = newDevice("phones");
  const devices = { "desk-A": deskA, "desk-B": deskB };
  try {
    await ev.step("K.1", "K", `${ran.name}: entries close, and the organiser adds two scanner desks`, "SDK (console)", async (s) => {
      const id = need(soloId, "race");
      s.tx("set_event_status Closed", (await sterun.setEventStatus(id, "Closed", SterunClient.as(organiser))).txHash);
      for (const name of ["desk-A", "desk-B"] as const) {
        s.tx(`add_scanner ${name}`, (await sterun.addScanner(id, deskAddress[name], SterunClient.as(organiser))).txHash);
        s.check(await sterun.isScanner(id, deskAddress[name]), `${name} is_scanner`);
      }
    });

    const counter = soloRunners.filter((label) => ![RACE_DAY.duplicate, RACE_DAY.screenshot, RACE_DAY.noShow].includes(label));
    await ev.step("K.2", "K", `The main desk hands over ${counter.length} race packs`, `SDK: ${claimPath.kind === "batch" ? "claim_racepack_many, one signature" : "claim_racepack, one signature each"}`, async (s) => {
      s.note(`claim path: ${claimPath.why}`);
      const ids = counter.map((label) => tokenOf(label).tokenId);
      const out = await claimRacepacks(sterun, ids, deskAddress["desk-A"], SterunClient.as(deskKeys["desk-A"]), claimPath);
      for (const tx of out.txs) s.tx(tx.label, tx.hash);
      s.check(out.skipped.length === 0, `nothing skipped, got ${JSON.stringify(out.skipped)}`);
      for (const label of counter) {
        const record = await sterun.recordOf(tokenOf(label).tokenId);
        s.check(record.state === "RacepackClaimed", `${label} RacepackClaimed, got ${record.state}`);
      }
      s.note(`${RACE_DAY.duplicate} and ${RACE_DAY.screenshot} come to the offline desks (F.1, F.2); ${RACE_DAY.noShow} never comes`);
    });

    await ev.step("K.3", "K", "Both desks download the roster online, then lose signal", "desk processes: fe fetchRoster + saveRoster", async (s) => {
      const id = need(soloId, "race");
      const categories = ran.categories.map((c) => ({ categoryId: need(categoryIds.get(`${ran.key}/${c.code}`), c.code), code: c.code }));
      for (const name of ["desk-A", "desk-B"] as const) {
        await devices[name].call("wallet", { secret: deskKeys[name].secret() });
        const roster = await waitFor(`${name}'s roster with ${soloRunners.length} entries`, async () => {
          const got = await devices[name].call<{ entries: { tokenId: number; bibNo: number }[]; snapshotLedger: number }>("download", { eventId: id, raceName: ran.name, categories });
          return got.entries.length === soloRunners.length ? got : undefined;
        });
        s.note(`${name}: ${roster.entries.length} entries, snapshot ledger ${roster.snapshotLedger}`);
        await devices[name].call("offline");
      }
      s.url(`GET /events/${id}/roster (scanner-signed)`, `${API}/events/${id}/roster`);
    });

    await ev.step("F.1", "F", `Fraud attempt 1: a forwarded screenshot of ${RACE_DAY.screenshot}'s pass is refused once stale; the live pass is accepted`, "phones + desk processes: fe verdictFor (offline, real wait)", async (s) => {
      await forwardedScreenshot(s, {
        sterun,
        eventId: need(soloId, "race"),
        phones,
        staleDesk: ["desk-A", deskA],
        liveDesk: ["desk-B", deskB],
        runner: holder(RACE_DAY.screenshot),
      });
    });

    await ev.step("F.2a", "F", `Fraud attempt 2: ${RACE_DAY.duplicate} collects at BOTH offline desks`, "phones + desk processes: fe verdictFor (offline)", async (s) => {
      const id = need(soloId, "race");
      for (const name of ["desk-A", "desk-B"] as const) {
        const verdict = await scanAt(s, phones, devices[name], name, id, holder(RACE_DAY.duplicate));
        s.check(verdict.kind === "green", `${name} GREEN for ${RACE_DAY.duplicate}: offline, it cannot know the other desk handed a pack over`);
      }
    });

    type SyncResult = { stop: { kind: string; message?: string } | null; claims: ClaimRow[] };
    const last: Record<"desk-A" | "desk-B", SyncResult | undefined> = { "desk-A": undefined, "desk-B": undefined };
    await ev.step("K.4", "K", "Signal returns: both desks press Send at the same moment", "desk processes: fe sendClaims → claim_racepack", async (s) => {
      const id = need(soloId, "race");
      for (const name of ["desk-A", "desk-B"] as const) await devices[name].call("online");
      const goAt = Date.now() + 3_000;
      const [a, b] = await Promise.all([
        deskA.call<SyncResult>("sync", { eventId: id, goAt }),
        deskB.call<SyncResult>("sync", { eventId: id, goAt }),
      ]);
      last["desk-A"] = a;
      last["desk-B"] = b;
      // A desk whose run stopped does what its screen says: Send again.
      for (const name of ["desk-A", "desk-B"] as const) {
        if (last[name]?.stop) {
          s.note(`${name} stopped (${JSON.stringify(last[name]!.stop)}); the volunteer presses Send again`);
          last[name] = await devices[name].call<SyncResult>("sync", { eventId: id, goAt: 0 });
        }
        for (const claim of last[name]!.claims) {
          s.note(`${name} row token ${claim.tokenId}: ${claim.status}${claim.reason ? ` (${claim.reason})` : ""}`);
          if (claim.txHash) s.tx(`${name} claim_racepack token ${claim.tokenId}`, claim.txHash);
        }
        s.check(last[name]!.stop === null, `${name} finished its queue`);
      }
      for (const label of [RACE_DAY.duplicate, RACE_DAY.screenshot]) {
        s.check((await sterun.recordOf(tokenOf(label).tokenId)).state === "RacepackClaimed", `${label} RacepackClaimed on chain`);
      }
      s.check((await sterun.recordOf(tokenOf(RACE_DAY.noShow).tokenId)).state === "Entered", `${RACE_DAY.noShow} (no-show) still Entered`);
    });

    await ev.step("F.2", "F", `Fraud attempt 2, caught: the chain keeps one claim for ${RACE_DAY.duplicate}, the other desk flags it`, "desk processes + chain + RPC + Horizon", async (s) => {
      const t = tokenOf(RACE_DAY.duplicate).tokenId;
      await oneWinnerOneFlag(s, {
        sterun,
        eventId: need(soloId, "race"),
        runner: { label: RACE_DAY.duplicate, tokenId: t },
        rows: { "desk-A": last["desk-A"]?.claims.find((c) => c.tokenId === t), "desk-B": last["desk-B"]?.claims.find((c) => c.tokenId === t) },
        devices,
        addresses: deskAddress,
      });
    });
  } finally {
    for (const device of [deskA, deskB, phones]) device.stop();
  }

  // -------------------------------------------------------------- results
  let publishable: { token_id: number; kind: "timed" | "untimed" | "dnf"; finish_time_s: number | null }[] = [];
  await ev.step("R.1", "R", `${ran.name}: the results file previews clean`, "API (organiser-signed POST /events/:id/results/preview)", async (s) => {
    const id = need(soloId, "race");
    await waitFor("every pack claim in the index", async () => {
      const res = await api<{ records: { state: string }[] }>(`/events/${id}/records`);
      return res.body.records?.filter((x) => x.state === "RacepackClaimed").length === soloRunners.length - 1 ? true : undefined;
    });
    const csv = resultsCsv((label) => tokenOf(label).bib);
    s.note(`CSV: ${csv.split("\n").slice(1).join(" | ")}`);
    const res = await api<{ counts: Record<string, number>; publishable: typeof publishable }>(`/events/${id}/results/preview`, {
      method: "POST",
      headers: { ...(await signedHeaders(organiser)), "content-type": "text/csv" },
      body: csv,
    });
    s.url(`POST /events/${id}/results/preview`, `${API}/events/${id}/results/preview`);
    s.check(res.status === 200, `preview 200, got ${res.status} ${JSON.stringify(res.body)}`);
    s.note(`counts ${JSON.stringify(res.body.counts)}`);
    s.check(res.body.publishable.length === RESULTS.length, `${RESULTS.length} publishable, got ${res.body.publishable.length}`);
    publishable = res.body.publishable;
  });

  await ev.step("R.2", "R", `The organiser records all ${RESULTS.length} results in one signature, and the race is Completed`, "SDK record_results (v2.6) + set_event_status", async (s) => {
    const id = need(soloId, "race");
    s.check(publishable.length === RESULTS.length, "the reviewed rows are available");
    const rows: SterunResult[] = publishable.map((p) =>
      p.kind === "timed" ? { tokenId: p.token_id, kind: "timed", finishTimeS: p.finish_time_s! } : { tokenId: p.token_id, kind: p.kind },
    );
    for (const batch of chunkResults(rows)) {
      s.tx(`record_results ×${batch.length}`, (await sterun.recordResults(id, batch, SterunClient.as(organiser))).txHash);
    }
    s.tx("set_event_status Completed", (await sterun.setEventStatus(id, "Completed", SterunClient.as(organiser))).txHash);
    for (const result of RESULTS) {
      const t = tokenOf(result.runner);
      const record = await sterun.recordOf(t.tokenId);
      const expected = result.kind === "timed" || result.kind === "untimed" ? "Finished" : "Dnf";
      const time = result.kind === "timed" ? result.seconds : null;
      s.check(record.state === expected && record.finishTimeS === time, `${result.runner} ${expected} ${time ?? "no time"}, got ${record.state} ${record.finishTimeS}`);
      s.check(await sterun.readOnly().verify(t.tokenId, t.participantHash), `${result.runner}: verify(token, vault hash) is true`);
    }
    s.note("an untimed finish reads finish_time_s null on chain — the pages must say 'no official time', never 0");
  });

  // -------------------------------------------------------------- what a reviewer opens
  await ev.step("V.1", "V", "What a reviewer opens, with no wallet: the directory, each race, the runners", "API index + web app URLs", async (s) => {
    const ids = [...raceIds.values()];
    await waitFor("every demo race in the index", async () => {
      const res = await api<{ events: { event_id: number }[] }>("/events?limit=200");
      return ids.every((id) => res.body.events?.some((e) => e.event_id === id)) ? true : undefined;
    });
    s.url("directory", `${APP}/`);
    s.note(`${ran.name} has run, so the directory lists it behind "Show races that have finished"; the other ${RACES.length - 1} are on the first screen`);
    for (const r of RACES) {
      const id = need(raceIds.get(r.key), r.key);
      const records = await waitFor(`${r.key}'s records in the index`, async () => {
        const res = await api<{ records: unknown[] }>(`/events/${id}/records`);
        return res.body.records?.length === ENTRIES.filter((x) => x.race === r.key).length ? res.body.records : undefined;
      });
      s.url(`${r.name} (${records.length} records)`, `${APP}/events/${id}`);
    }
    const byRunner = [...people.values()]
      .map((p) => ({ p, races: ENTRIES.filter((x) => x.runner === p.label).map((x) => x.race) }))
      .sort((a, b) => b.races.length - a.races.length);
    for (const { p, races } of byRunner.slice(0, 6)) {
      const history = await api<{ records: unknown[] }>(`/runners/${p.kp.publicKey()}/records`);
      s.check(history.body.records?.length === races.length, `${p.label}'s history holds ${races.length} record(s)`);
      s.url(`runner ${plannedRunner(p.label).name} (${races.join(", ")})`, `${APP}/runner/${p.kp.publicKey()}`);
    }
    s.url("organiser console (connect the demo organiser's wallet)", `${APP}/org`);
    s.url("EventRegistry", contractUrl(deployments.eventRegistry));
    s.url("RaceRecord", contractUrl(deployments.raceRecord));
    ev.meta.records = `${entered.size} records across ${raceIds.size} races`;
  });

  await ev.step("M.1", "M", "Open the demo in a browser, and film the two fraud attempts", "human + browser + two phones", async (s) => {
    s.manual(
      "Axel",
      "open the V.1 links with no wallet and check each race page shows its poster, venue and city, and that the untimed finish reads 'no official time'; " +
        "for the video, repeat F.1 and F.2 with two phones running /scan, using the runner keys in .env.demo — take the screenshot, wait on camera, present it",
      "STE-28",
    );
  });

  return finish(ev);
}

async function finish(ev: Evidence): Promise<void> {
  await checkLinks(ev, "failed txs on the ledger (expected only for the losing desk's duplicate claim, if any)");
  const counts = ev.counts();
  log(`\nRESULT ${counts.PASS} PASS, ${counts.FAIL} FAIL, ${counts["MANUAL REQUIRED"]} MANUAL REQUIRED, ${counts.BLOCKED} BLOCKED of ${ev.steps.length}`);
  log(`evidence: ${join(RUN_DIR, "EVIDENCE.md")}`);
  if (counts.FAIL > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`\n❌ seed aborted: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
