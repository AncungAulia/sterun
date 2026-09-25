/**
 * STE-25 — a full mock race on live testnet, with evidence written as it runs.
 *
 *     docs/rehearsal/run.sh
 *
 * The scenario, the cast and what is deliberately left to a human are in
 * docs/rehearsal/README.md. This file is the stage manager: it creates the
 * accounts, drives the organiser, nine runners, two scanner desks and the
 * results upload against the live backend and the live contracts, and records
 * every step with its transaction hash or URL the moment the step ends.
 *
 * Three kinds of actor, and which code each one runs:
 *
 *   organiser, runners   @sterunxyz/sdk + the live API, as the console and the
 *                        entry flow call them; a Keypair signs where a browser
 *                        wallet would
 *   desk-A, desk-B       separate processes running the web app's scanner code
 *                        (device.ts)
 *   phones               a process running the pass's TOTP/QR code (device.ts)
 *
 * A refused step is recorded and the run carries on wherever the next step does
 * not depend on it. Nothing is retried to make the log look clean.
 */
import { randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { Asset, Keypair, rpc } from "@stellar/stellar-sdk";
import { SterunClient, TESTNET, type SterunRecord } from "@sterunxyz/sdk";

import { parseDeployments, type Deployments } from "../../../be/src/deployments";
import {
  BlockedError,
  Evidence,
  StepContext,
  accountUrl,
  contractUrl,
} from "./evidence";
import { Device } from "./device-process";
import {
  API,
  HORIZON,
  REPO,
  SUSD,
  addTrustline,
  api,
  big,
  bigintJson,
  expectRevert,
  friendbot,
  log,
  newAccount,
  readEnvFile,
  remember,
  secrets,
  server,
  signedHeaders,
  sleep,
  susdBalance,
  waitFor,
} from "./harness";
import { FILMING_NOTE, STALE_QR_CLAIM, honestyNote, staleFrom, waitUntilStale, type TotpWindow } from "./stale-qr";
import { timeStepOf } from "../../../fe/src/lib/totp";

// ---------------------------------------------------------------------------
// Configuration (the shared half lives in harness.ts)
// ---------------------------------------------------------------------------

const RUN_DIR = process.env.REHEARSAL_RUN_DIR ?? join(REPO, "docs", "rehearsal", "runs", "local");
const DEVICE_BUNDLE = process.env.REHEARSAL_DEVICE_BUNDLE ?? "";

const PRICE_10K = 10n * SUSD;
const PRICE_5K = 5n * SUSD;

// Desks and phones are child processes; see device-process.ts for why that handle
// has its own module.
const newDevice = (role: string) => new Device(role, DEVICE_BUNDLE, [`--env-file=${join(REPO, "fe", ".env")}`]);

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------

interface Runner {
  label: string;
  kp: Keypair;
  category: "10K" | "5K";
  person: { name: string; national_id: string; emergency_contact: string };
  bibName: string;
  participantId?: string;
  participantHash?: string;
  salt?: string;
  totpSecret?: string;
  tokenId?: number;
  bib?: number;
  enterTx?: string;
}

const NAMES = [
  ["Budi Santoso", "BUDI"],
  ["Siti Rahayu", "SITI"],
  ["Andi Wijaya", "ANDI"],
  ["Dewi Lestari", "DEWI"],
  ["Rizky Pratama", "RIZKY"],
  ["Putri Ayu", "PUTRI"],
  ["Agus Salim", "AGUS"],
  ["Nur Aini", "NUR"],
  ["Fajar Nugroho", "FAJAR"],
] as const;

function makeRunner(index: number, category: "10K" | "5K"): Runner {
  const [name, bibName] = NAMES[index]!;
  const nik = `3201${String(randomInt(10 ** 11, 10 ** 12 - 1))}${index}`;
  return {
    label: `R${index + 1}`,
    kp: newAccount(),
    category,
    person: { name, national_id: nik, emergency_contact: `+62812${String(randomInt(10 ** 6, 10 ** 7 - 1))}${index}` },
    bibName,
  };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!DEVICE_BUNDLE) throw new Error("REHEARSAL_DEVICE_BUNDLE is not set; run docs/rehearsal/run.sh");
  const env = readEnvFile(join(REPO, ".env"));
  const adminSecret = process.env.STERUN_ADMIN_SECRET ?? env.get("STERUN_ADMIN_SECRET");
  if (!adminSecret) throw new Error("STERUN_ADMIN_SECRET is not set (repo root .env, testnet only)");
  remember(adminSecret);
  const admin = Keypair.fromSecret(adminSecret);

  const deployments: Deployments = parseDeployments(readFileSync(join(REPO, "docs", "deployments.md"), "utf8"));
  const contracts = { eventRegistry: deployments.eventRegistry, raceRecord: deployments.raceRecord };
  const sterun = new SterunClient({ ...TESTNET, contracts });
  const susd = new Asset("sUSD", deployments.susdIssuer);

  const ev = new Evidence(RUN_DIR, () => secrets);
  const startedAt = new Date().toISOString();
  ev.meta.started = startedAt;
  ev.meta.network = "Stellar testnet";
  ev.meta.api = API;
  ev.meta.EventRegistry = deployments.eventRegistry;
  ev.meta.RaceRecord = deployments.raceRecord;
  ev.meta["sUSD SAC"] = deployments.susdSac;
  ev.meta.git = process.env.REHEARSAL_GIT ?? "unknown";
  ev.meta["findings filed"] = "STE-61 (SDK, James), STE-62 (scanner, Ancung), STE-63 (console wording, Ancung); pre-existing: STE-32 (deploy), STE-24 (profile), STE-58 (results screen), STE-60 (batch results)";

  const organiser = newAccount();
  const outsider = newAccount(); // never allowlisted, never a scanner
  const deskKeys = { A: newAccount(), B: newAccount() };
  const runners: Runner[] = [
    makeRunner(0, "10K"),
    makeRunner(1, "10K"),
    makeRunner(2, "10K"),
    makeRunner(3, "10K"),
    makeRunner(4, "5K"),
    makeRunner(5, "5K"),
    makeRunner(6, "5K"),
    makeRunner(7, "5K"),
    makeRunner(8, "10K"), // the ninth: arrives after 10K sold out
  ];
  const [r1, r2, r3, r4, r5, r6, r7, r8, r9] = runners as [Runner, Runner, Runner, Runner, Runner, Runner, Runner, Runner, Runner];
  ev.meta.organiser = organiser.publicKey();
  ev.meta["outsider (never allowlisted)"] = outsider.publicKey();
  ev.meta["desk-A scanner"] = deskKeys.A.publicKey();
  ev.meta["desk-B scanner"] = deskKeys.B.publicKey();
  ev.meta.runners = runners.map((r) => `${r.label} ${r.kp.publicKey()}`).join(", ");
  ev.write();

  const deskA = newDevice("desk-A");
  const deskB = newDevice("desk-B");
  const phones = newDevice("phones");
  const consoleDevice = newDevice("console"); // the web app's error wording, for negative paths

  let eventId: number | undefined;
  let cat10k: number | undefined;
  let cat5k: number | undefined;
  const need = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new BlockedError(`${what} is missing because an earlier step failed`);
    return value;
  };

  try {
    // ---------------------------------------------------------------- setup
    await ev.step("S.1", "S", "The live backend answers and serves the contracts in docs/deployments.md", "API", async (s) => {
      const health = await api<{ status?: string }>("/health");
      s.url("GET /health", `${API}/health`);
      s.check(health.status === 200, `/health 200, got ${health.status}`);
      const config = await api<{ addresses: Deployments; indexer: { enabled: boolean }; roster: { enabled: boolean }; results: { enabled: boolean }; vault: { enabled: boolean }; faucet: { route: { available: boolean } } }>("/config");
      s.url("GET /config", `${API}/config`);
      for (const key of ["eventRegistry", "raceRecord", "susdSac", "susdIssuer"] as const) {
        s.check(config.body.addresses[key] === deployments[key], `/config ${key} ${config.body.addresses[key]} equals deployments.md ${deployments[key]}`);
      }
      s.note(`addresses match docs/deployments.md; vault ${config.body.vault.enabled}, indexer ${config.body.indexer.enabled}, roster ${config.body.roster.enabled}, results ${config.body.results.enabled}, faucet route ${config.body.faucet.route.available}`);
      const status = await api<{ last_ledger: number; updated_at: string }>("/indexer/status");
      s.url("GET /indexer/status", `${API}/indexer/status`);
      s.note(`indexer last_ledger ${status.body.last_ledger}, updated ${status.body.updated_at}`);
      s.url("EventRegistry", contractUrl(deployments.eventRegistry));
      s.url("RaceRecord", contractUrl(deployments.raceRecord));
    });

    await ev.step("S.2", "S", "Find the live web app and landing page", "repo search + HTTP", async (s) => {
      const res = await fetch("https://sterun.xyz", { redirect: "follow" });
      const text = await res.text();
      const parked = /Parked Domain/i.test(text);
      s.url("https://sterun.xyz", "https://sterun.xyz");
      s.note(`the only web origin named in the repo besides the API is sterun.xyz (used in fixture uris); it answers ${res.status}${parked ? " with a Hostinger 'Parked Domain' page, not the app" : ""}`);
      s.note("no Vercel URL for fe/ or landing-page/ exists anywhere in the repo or docs/deployments.md; STE-32 (Vercel deploy) is still Backlog");
      s.manual(
        "Ancung",
        "deploy fe/ and landing-page/ (STE-32), then repeat proofs 1, 2, 4 and 9 through the UI with a browser wallet, and record the URLs here",
        "STE-32",
      );
    });

    await ev.step("S.3", "S", "Fund 13 fresh testnet accounts (organiser, outsider, 2 desks, 9 runners)", "Friendbot", async (s) => {
      const all = [organiser, outsider, deskKeys.A, deskKeys.B, ...runners.map((r) => r.kp)];
      for (const kp of all) await friendbot(kp.publicKey());
      s.url("organiser", accountUrl(organiser.publicKey()));
      s.url("outsider", accountUrl(outsider.publicKey()));
      s.url("desk-A", accountUrl(deskKeys.A.publicKey()));
      s.url("desk-B", accountUrl(deskKeys.B.publicKey()));
      for (const r of runners) s.url(r.label, accountUrl(r.kp.publicKey()));
      s.note("all 13 accounts are throwaway keys created by this run; only the admin key comes from .env");
    });

    await ev.step("S.4", "S", "Organiser and runners open an sUSD trustline", "classic changeTrust", async (s) => {
      s.tx("organiser changeTrust", await addTrustline(organiser, susd));
      for (const r of runners) s.tx(`${r.label} changeTrust`, await addTrustline(r.kp, susd));
    });

    await ev.step("S.5", "S", "Each runner gets test sUSD from the web app's faucet route (POST /faucet)", "API", async (s) => {
      const failures: string[] = [];
      for (const r of runners) {
        let res = await api<{ tx_hash?: string; paid_stroops?: string; error?: string; message?: string }>("/faucet", {
          method: "POST",
          headers: { ...(await signedHeaders(r.kp)), "content-type": "application/json" },
          body: "{}",
        });
        if (res.status === 429) {
          s.note(`${r.label}: 429 from the per-client rate limit (6/min); waiting 65s, as a person would`);
          await sleep(65_000);
          res = await api("/faucet", {
            method: "POST",
            headers: { ...(await signedHeaders(r.kp)), "content-type": "application/json" },
            body: "{}",
          });
        }
        if (res.status === 200 && res.body.tx_hash) {
          s.tx(`${r.label} faucet ${Number(BigInt(res.body.paid_stroops ?? "0") / SUSD)} sUSD`, res.body.tx_hash);
        } else {
          failures.push(`${r.label}: ${res.status} ${JSON.stringify(res.body)}`);
        }
        await sleep(10_500);
      }
      s.url("POST /faucet", `${API}/faucet`);
      s.check(failures.length === 0, `every faucet payout succeeds; failures: ${failures.join("; ")}`);
    });

    // ------------------------------------------------------------ proof 1
    await ev.step("1.1", "1", "Admin allowlists the organiser (STE-36)", "SDK", async (s) => {
      const sent = await sterun.addOrganiser(organiser.publicKey(), SterunClient.as(admin));
      s.tx("add_organiser", sent.txHash);
      s.check(await sterun.isOrganiser(organiser.publicKey()), "is_organiser true");
      s.check(!(await sterun.isOrganiser(outsider.publicKey())), "outsider is not an organiser");
    });

    await ev.step("N.1", "N", "A non-allowlisted wallet tries to create a race", "web app readClient + friendlyError", async (s) => {
      const result = await consoleDevice.call("attempt", {
        secret: outsider.secret(),
        method: "createEvent",
        args: [{ organiser: outsider.publicKey(), name: "Jakarta Marathon 2026", metadataHash: randomBytes(32).toString("hex"), uri: "https://example.com/fake.json", startsAt: big(BigInt(Math.floor(Date.now() / 1000) + 86_400)) }],
      });
      expectRevert(s, result, { code: 18, variant: "NotAllowlistedOrganiser" });
      s.check(/cannot publish races/i.test(String(result.friendly)), "the console says it in a sentence rather than crashing");
    });

    await ev.step("1.2", "1", "Organiser creates the race: 2 categories with quota and sUSD price, then opens entries", "SDK (console equivalent)", async (s) => {
      const startsAt = BigInt(Math.floor(Date.now() / 1000) + 3 * 86_400);
      const created = await sterun.createEvent(
        {
          organiser: organiser.publicKey(),
          name: `STE-25 Rehearsal Run ${startedAt.slice(0, 10)}`,
          metadataHash: randomBytes(32).toString("hex"),
          uri: "https://sterun.xyz/events/ste-25-rehearsal.json",
          startsAt,
        },
        SterunClient.as(organiser),
      );
      eventId = created.value;
      s.tx(`create_event → event ${eventId}`, created.txHash);
      const a = await sterun.addCategory({ eventId, code: "R10K", distanceM: 10_000, quota: 4, priceStroops: PRICE_10K }, SterunClient.as(organiser));
      cat10k = a.value;
      s.tx(`add_category R10K quota 4 @ 10 sUSD → ${cat10k}`, a.txHash);
      const b = await sterun.addCategory({ eventId, code: "R5K", distanceM: 5_000, quota: 4, priceStroops: PRICE_5K }, SterunClient.as(organiser));
      cat5k = b.value;
      s.tx(`add_category R5K quota 4 @ 5 sUSD → ${cat5k}`, b.txHash);
      const open = await sterun.setEventStatus(eventId, "Open", SterunClient.as(organiser));
      s.tx("set_event_status Open", open.txHash);
      const event = await sterun.getEvent(eventId);
      s.check(event.status === "Open", `status Open, got ${event.status}`);
      s.check(event.organiser === organiser.publicKey(), "get_organiser is the organiser");
      s.url(`GET /events/${eventId}`, `${API}/events/${eventId}`);
      ev.meta.event_id = eventId;
      s.note("driven through @sterunxyz/sdk, the client the console uses; the console screens themselves are a separate MANUAL step (M.1)");
    });

    await ev.step("N.2", "N", "A wallet that is not this race's organiser tries to modify it", "web app readClient + friendlyError", async (s) => {
      const id = need(eventId, "event");
      const attempts = [
        { method: "addCategory", args: [{ eventId: id, code: "FAKE", distanceM: 1_000, quota: 100, priceStroops: big(0n) }] },
        { method: "setEventStatus", args: [id, "Cancelled"] },
        { method: "increaseQuota", args: [{ eventId: id, categoryId: need(cat10k, "category"), newQuota: 999 }] },
        { method: "addScanner", args: [id, outsider.publicKey()] },
      ];
      for (const attempt of attempts) {
        const result = await consoleDevice.call("attempt", { secret: outsider.secret(), ...attempt });
        if (result.sent) {
          s.tx(`${attempt.method} UNEXPECTEDLY ACCEPTED`, String(result.txHash));
          throw new Error(`${attempt.method} by a non-organiser was accepted`);
        }
        s.note(`${attempt.method}: refused — ${String(result.message).split("\n")[0]!.slice(0, 220)}`);
        s.note(`${attempt.method}: web app sentence "${String(result.friendly)}"`);
      }
      const event = await sterun.getEvent(id);
      const categories = await sterun.listCategories(id);
      s.check(event.status === "Open", "status still Open");
      s.check(categories.length === 2, `still 2 categories, got ${categories.length}`);
      s.check(categories.find((c) => c.categoryId === cat10k)?.quota === 4, "R10K quota still 4");
      s.check(!(await sterun.isScanner(id, outsider.publicKey())), "outsider is not a scanner");
      s.note("chain state re-read afterwards: nothing changed. Refused at simulation (auth), so no transaction exists");
    });

    // ------------------------------------------------------------ proof 2
    const enterRunner = async (s: StepContext, r: Runner, categoryId: number, price: bigint) => {
      const id = need(eventId, "event");
      if (!r.participantId) {
        const submitted = await api<{ participant_id: string; participant_hash: string; salt: string; totp_secret: string }>("/participants", {
          method: "POST",
          headers: { ...(await signedHeaders(r.kp)), "content-type": "application/json" },
          body: JSON.stringify({
            ...r.person,
            id_type: "national_id_card",
            bib_name: r.bibName,
            email: `${r.label.toLowerCase()}-rehearsal@example.com`,
            phone: r.person.emergency_contact,
            gender: "female",
            date_of_birth: "1994-08-17",
            emergency_contact_name: "Rehearsal Contact",
            event_id: id,
            category_id: categoryId,
            runner_address: r.kp.publicKey(),
          }),
        });
        s.check(submitted.status === 201, `POST /participants 201, got ${submitted.status} ${JSON.stringify(submitted.body)}`);
        r.participantId = submitted.body.participant_id;
        // participant_hash is public on chain by design; salt and secret stay out of the evidence.
        r.participantHash = submitted.body.participant_hash;
        r.salt = remember(submitted.body.salt);
        r.totpSecret = remember(submitted.body.totp_secret);
        s.url(`POST /participants → 201 (participant_hash ${r.participantHash.slice(0, 12)}…)`, `${API}/participants/${r.participantId}`);
      }

      const before = { runner: await susdBalance(r.kp.publicKey(), susd), organiser: await susdBalance(organiser.publicKey(), susd) };
      const entered = await sterun.enter(
        { runner: r.kp.publicKey(), eventId: id, categoryId, participantHash: need(r.participantHash, "participant hash") },
        SterunClient.as(r.kp),
      );
      r.tokenId = entered.value;
      r.enterTx = entered.txHash;
      s.tx(`enter → token ${r.tokenId}`, entered.txHash);
      const record = await sterun.recordOf(r.tokenId);
      r.bib = record.bibNo;
      const after = { runner: await susdBalance(r.kp.publicKey(), susd), organiser: await susdBalance(organiser.publicKey(), susd) };
      s.note(`bib ${record.bibNo}, state ${record.state}, owner_of ${await sterun.ownerOf(r.tokenId) === r.kp.publicKey() ? "= runner" : "≠ runner"}`);
      s.note(`sUSD runner ${before.runner} → ${after.runner} stroops, organiser ${before.organiser} → ${after.organiser} stroops`);
      s.check(before.runner - after.runner === price, `runner paid exactly ${price} stroops`);
      s.check(after.organiser - before.organiser === price, `organiser received exactly ${price} stroops`);
      s.check(record.participantHash === r.participantHash, "on-chain participant_hash equals the vault's");
      s.check(record.state === "Entered", "state Entered");
    };

    for (const r of [r1, r2, r3, r4]) {
      await ev.step(`2.${r.label}`, "2", `${r.label} enters R10K through the entry flow and pays 10 sUSD`, "API + SDK (entry flow equivalent)", (s) => enterRunner(s, r, need(cat10k, "R10K"), PRICE_10K));
    }
    for (const r of [r5, r6, r7, r8]) {
      await ev.step(`2.${r.label}`, "2", `${r.label} enters R5K through the entry flow and pays 5 sUSD`, "API + SDK (entry flow equivalent)", (s) => enterRunner(s, r, need(cat5k, "R5K"), PRICE_5K));
    }

    // ------------------------------------------------------------ proof 3 + second batch
    await ev.step("3.1", "3", "R9 tries to enter R10K after it sold out (4/4)", "API + web app readClient + classifyEnterFailure", async (s) => {
      const id = need(eventId, "event");
      const category = await sterun.getCategory(id, need(cat10k, "R10K"));
      s.note(`R10K entered_count ${category.enteredCount} of quota ${category.quota}`);
      s.check(category.enteredCount === 4 && category.quota === 4, "R10K is full before the attempt");
      const submitted = await api<{ participant_id: string; participant_hash: string; salt: string; totp_secret: string }>("/participants", {
        method: "POST",
        headers: { ...(await signedHeaders(r9.kp)), "content-type": "application/json" },
        body: JSON.stringify({
          ...r9.person, id_type: "national_id_card", bib_name: r9.bibName, email: "r9-rehearsal@example.com", phone: r9.person.emergency_contact,
          gender: "male", date_of_birth: "1991-01-01", emergency_contact_name: "Rehearsal Contact", event_id: id, category_id: cat10k, runner_address: r9.kp.publicKey(),
        }),
      });
      s.check(submitted.status === 201, `POST /participants 201, got ${submitted.status}`);
      r9.participantId = submitted.body.participant_id;
      r9.participantHash = submitted.body.participant_hash;
      r9.salt = remember(submitted.body.salt);
      r9.totpSecret = remember(submitted.body.totp_secret);
      const before = await susdBalance(r9.kp.publicKey(), susd);
      const result = await consoleDevice.call("attempt", {
        secret: r9.kp.secret(),
        method: "enter",
        args: [{ runner: r9.kp.publicKey(), eventId: id, categoryId: cat10k, participantHash: r9.participantHash }],
      });
      expectRevert(s, result, { code: 5, variant: "QuotaFull" });
      const after = await susdBalance(r9.kp.publicKey(), susd);
      s.check(before === after, "no sUSD moved");
      s.check((result.enterFailure as { kind?: string } | undefined)?.kind === "sold-out", "the entry flow tells the runner the distance sold out");
    });

    await ev.step("Q.1", "Q", "Organiser opens a second batch: R10K quota 4 → 5 (STE-55)", "SDK", async (s) => {
      const id = need(eventId, "event");
      const raised = await sterun.increaseQuota({ eventId: id, categoryId: need(cat10k, "R10K"), newQuota: 5 }, SterunClient.as(organiser));
      s.tx("increase_quota 4 → 5", raised.txHash);
      const category = await sterun.getCategory(id, cat10k!);
      s.check(category.quota === 5 && category.enteredCount === 4, `quota 5 entered 4, got ${category.quota}/${category.enteredCount}`);
      const same = await consoleDevice.call("attempt", { secret: organiser.secret(), method: "increaseQuota", args: [{ eventId: id, categoryId: cat10k, newQuota: 5 }] });
      expectRevert(s, same, { code: 19, variant: "QuotaNotIncreased" });
    });

    await ev.step("Q.2", "Q", "R9 enters R10K in the second batch, and the bib numbering continues", "SDK (entry flow equivalent)", (s) => enterRunner(s, r9, need(cat10k, "R10K"), PRICE_10K));

    await ev.step("Q.3", "Q", "The index shows the new quota and the rise as a dated fact (STE-56)", "API", async (s) => {
      const id = need(eventId, "event");
      const category = await waitFor("the quota rise in the index", async () => {
        const res = await api<{ categories: { category_id: number; quota: number; entered_count: number; quota_history: { previous: number; current: number; tx_hash: string }[] }[] }>(`/events/${id}`);
        const c = res.body.categories?.find((x) => x.category_id === cat10k);
        return c && c.quota === 5 && c.quota_history.length === 1 && c.entered_count === 5 ? c : undefined;
      });
      s.url(`GET /events/${id}`, `${API}/events/${id}`);
      s.note(`index: quota ${category.quota}, entered ${category.entered_count}, history ${JSON.stringify(category.quota_history.map((h) => [h.previous, h.current]))}`);
    });

    await ev.step("B.1", "B", "Bibs are unique within the event and count from 1 (STE-54): chain vs API", "SDK + API", async (s) => {
      const id = need(eventId, "event");
      const entered = runners.filter((r) => r.tokenId !== undefined);
      const bibs = entered.map((r) => r.bib!);
      s.note(`chain bibs in entry order: ${entered.map((r) => `${r.label}=${r.bib}`).join(", ")}`);
      s.check(new Set(bibs).size === bibs.length, "no bib repeats within the event");
      s.check(JSON.stringify([...bibs].sort((a, b) => a - b)) === JSON.stringify(bibs.map((_, i) => i + 1)), "bibs are exactly 1..n");
      const records = await waitFor("all entries in the index", async () => {
        const res = await api<{ records: { token_id: number; bib_no: number }[] }>(`/events/${id}/records`);
        return res.body.records?.length === entered.length ? res.body.records : undefined;
      });
      s.url(`GET /events/${id}/records`, `${API}/events/${id}/records`);
      for (const r of entered) {
        const row = records.find((x) => x.token_id === r.tokenId);
        s.check(row?.bib_no === r.bib, `${r.label} API bib ${row?.bib_no} equals chain bib ${r.bib}`);
      }
      s.note("API /events/:id/records agrees with chain get_record for every bib");
    });

    // ------------------------------------------------------------ closed / cancelled
    await ev.step("N.3", "N", "Entries close; a runner tries to enter the Closed race", "SDK + web app readClient + classifyEnterFailure", async (s) => {
      const id = need(eventId, "event");
      const closed = await sterun.setEventStatus(id, "Closed", SterunClient.as(organiser));
      s.tx("set_event_status Closed", closed.txHash);
      const result = await consoleDevice.call("attempt", {
        secret: r5.kp.secret(),
        method: "enter",
        args: [{ runner: r5.kp.publicKey(), eventId: id, categoryId: cat5k, participantHash: randomBytes(32).toString("hex") }],
      });
      expectRevert(s, result, { code: 4, variant: "EventNotOpen" });
      s.check((result.enterFailure as { kind?: string } | undefined)?.kind === "closed", "the entry flow says entries are closed");
      s.note("participant_hash here is random: the vault's one-entry-per-person rule would refuse a second submit first, and what is under test is the contract gate");
    });

    let cancelledId: number | undefined;
    await ev.step("N.4", "N", "A second race is cancelled; a runner tries to enter it", "SDK + web app readClient + classifyEnterFailure", async (s) => {
      const created = await sterun.createEvent(
        { organiser: organiser.publicKey(), name: `STE-25 Cancelled Race ${startedAt.slice(0, 10)}`, metadataHash: randomBytes(32).toString("hex"), uri: "https://sterun.xyz/events/ste-25-cancelled.json", startsAt: BigInt(Math.floor(Date.now() / 1000) + 7 * 86_400) },
        SterunClient.as(organiser),
      );
      cancelledId = created.value;
      s.tx(`create_event → event ${cancelledId}`, created.txHash);
      const c = await sterun.addCategory({ eventId: cancelledId, code: "R5K", distanceM: 5_000, quota: 10, priceStroops: PRICE_5K }, SterunClient.as(organiser));
      s.tx("add_category R5K", c.txHash);
      s.tx("set_event_status Open", (await sterun.setEventStatus(cancelledId, "Open", SterunClient.as(organiser))).txHash);
      s.tx("set_event_status Cancelled", (await sterun.setEventStatus(cancelledId, "Cancelled", SterunClient.as(organiser))).txHash);
      const result = await consoleDevice.call("attempt", {
        secret: r6.kp.secret(),
        method: "enter",
        args: [{ runner: r6.kp.publicKey(), eventId: cancelledId, categoryId: c.value, participantHash: randomBytes(32).toString("hex") }],
      });
      expectRevert(s, result, { code: 4, variant: "EventNotOpen" });
      s.note(`entry flow classification for a cancelled race: ${JSON.stringify(result.enterFailure)}`);
      const reopen = await consoleDevice.call("attempt", { secret: organiser.secret(), method: "setEventStatus", args: [cancelledId, "Open"] });
      s.check(!reopen.sent, "a Cancelled race cannot be reopened");
      s.note(`reopening refused: ${String(reopen.message).split("\n")[0]!.slice(0, 160)}`);
    });

    // ------------------------------------------------------------ desks
    await ev.step("4.0", "4", "Organiser adds two scanner wallets, one per desk", "SDK (console equivalent)", async (s) => {
      const id = need(eventId, "event");
      s.tx("add_scanner desk-A", (await sterun.addScanner(id, deskKeys.A.publicKey(), SterunClient.as(organiser))).txHash);
      s.tx("add_scanner desk-B", (await sterun.addScanner(id, deskKeys.B.publicKey(), SterunClient.as(organiser))).txHash);
      s.check(await sterun.isScanner(id, deskKeys.A.publicKey()), "desk-A is_scanner");
      s.check(await sterun.isScanner(id, deskKeys.B.publicKey()), "desk-B is_scanner");
    });

    await ev.step("N.5", "N", "A wallet that is not a scanner tries to claim a race pack", "web app readClient", async (s) => {
      const result = await consoleDevice.call("attempt", { secret: outsider.secret(), method: "claimRacepack", args: [need(r1.tokenId, "R1 token"), outsider.publicKey()] });
      expectRevert(s, result, { code: 104, variant: "NotAuthorized" });
    });

    await ev.step("X.1", "2", "Every runner's pass is restorable from the vault, linked from chain without a confirm call (STE-52/59)", "API", async (s) => {
      for (const r of runners) {
        const token = need(r.tokenId, `${r.label} token`);
        const pass = await waitFor(`${r.label}'s pass`, async () => {
          const res = await api<{ token_id: number; totp_secret: string; bib_name: string | null }>(`/records/${token}/pass`, { headers: await signedHeaders(r.kp) });
          return res.status === 200 ? res.body : undefined;
        });
        s.check(pass.totp_secret === r.totpSecret, `${r.label} pass secret equals the one shown at submit`);
        s.check(pass.bib_name === r.bibName, `${r.label} bib_name ${pass.bib_name}`);
      }
      s.url("GET /records/:tokenId/pass (wallet-signed)", `${API}/records/${r1.tokenId}/pass`);
      s.note("all 9 passes answered 200 to their own wallet with the secret shown once at submit");
    });

    const categoriesForDesk = () => [
      { categoryId: need(cat10k, "R10K"), code: "R10K" },
      { categoryId: need(cat5k, "R5K"), code: "R5K" },
    ];
    await ev.step("4.1", "4", "Both desks download the roster while online", "desk processes: fe fetchRoster + saveRoster", async (s) => {
      const id = need(eventId, "event");
      await deskA.call("wallet", { secret: deskKeys.A.secret() });
      await deskB.call("wallet", { secret: deskKeys.B.secret() });
      for (const [name, desk] of [["desk-A", deskA], ["desk-B", deskB]] as const) {
        const roster = await waitFor(`${name}'s roster with 9 entries`, async () => {
          const r = await desk.call<{ entries: { tokenId: number; bibNo: number; state: string }[]; snapshotLedger: number; missingFromIndex: number; driftSeconds: number }>("download", { eventId: id, raceName: `STE-25 Rehearsal Run ${startedAt.slice(0, 10)}`, categories: categoriesForDesk() });
          return r.entries.length === 9 ? r : undefined;
        });
        s.note(`${name}: ${roster.entries.length} entries, snapshot ledger ${roster.snapshotLedger}, missing_from_index ${roster.missingFromIndex}, clock drift ${roster.driftSeconds}s`);
        for (const r of runners) {
          const row = roster.entries.find((e) => e.tokenId === r.tokenId);
          s.check(row?.bibNo === r.bib, `${name} roster bib for ${r.label} ${row?.bibNo} equals chain bib ${r.bib}`);
        }
      }
      s.url(`GET /events/${id}/roster (scanner-signed)`, `${API}/events/${id}/roster`);
      s.note("B: roster bib_no equals chain bib for all 9 runners on both desks");
    });

    // ------------------------------------------------------------ offline scanning
    const scanAt = async (s: StepContext, desk: Device, deskName: string, r: Runner) => {
      const { qr } = await phones.call<{ qr: string }>("present", { tokenId: need(r.tokenId, `${r.label} token`), secretHex: need(r.totpSecret, "secret") });
      const verdict = await desk.call<{ kind: string; shownBib: number | null; claimedHere: boolean | null; offline: boolean }>("scan", { eventId: need(eventId, "event"), qr });
      s.check(verdict.offline, `${deskName} was offline during the scan`);
      s.note(`${deskName} scans ${r.label}: ${verdict.kind.toUpperCase()}, screen shows bib ${verdict.shownBib} (chain bib ${r.bib})${verdict.claimedHere ? ", claimed at this desk" : ""}`);
      s.check(verdict.shownBib === r.bib, `the desk shows ${r.label}'s chain bib`);
      return verdict;
    };

    await ev.step("4.2", "4", "Both desks lose signal; R4 shows the pass at BOTH desks, others at one", "desk processes (offline: fetch disabled)", async (s) => {
      await deskA.call("offline");
      await deskB.call("offline");
      // R4 first at both desks, so it is the first claim either desk sends.
      s.check((await scanAt(s, deskA, "desk-A", r4)).kind === "green", "desk-A GREEN for R4");
      s.check((await scanAt(s, deskB, "desk-B", r4)).kind === "green", "desk-B GREEN for R4: offline, it cannot know desk-A handed a pack over");
      for (const r of [r1, r2, r3, r5]) s.check((await scanAt(s, deskA, "desk-A", r)).kind === "green", `desk-A GREEN for ${r.label}`);
      for (const r of [r6, r7]) s.check((await scanAt(s, deskB, "desk-B", r)).kind === "green", `desk-B GREEN for ${r.label}`);
      s.note("R8 never comes to a desk: the no-show");
      s.note("R9 comes to desk-B in F.1, after a screenshot of its pass has been tried at desk-A");
    });

    // STE-67: the SOW's second fraud attempt, a forwarded QR screenshot. The
    // wait is real time, read from the roster; a mocked clock would prove the
    // unit test, not the product.
    await ev.step("F.1", "F", `A forwarded screenshot of R9's pass, shown after the wait, is refused; R9's live pass is accepted (${STALE_QR_CLAIM})`, "phones + desk processes: fe verdictFor (offline, real wait)", async (s) => {
      const id = need(eventId, "event");
      const token = need(r9.tokenId, "R9 token");
      const stepStarted = Date.now();

      const totp = await deskA.call<TotpWindow & { digits: number }>("totp", { eventId: id });
      s.note(`roster totp as desk-A stored it: step ${totp.stepSeconds}s, tolerance ±${totp.toleranceSteps} step(s), ${totp.digits} digits`);
      s.check(Number.isInteger(totp.toleranceSteps) && totp.toleranceSteps >= 0, "the roster carries a tolerance");
      s.check(timeStepOf(3600) * totp.stepSeconds === 3600, `the pass and the roster count steps of the same length (${totp.stepSeconds}s)`);
      s.note(honestyNote(totp));
      s.note(FILMING_NOTE);

      const queueBefore = await deskA.call<{ tokenId: number }[]>("claims", { eventId: id });
      const recordBefore = await sterun.recordOf(token);
      s.check(recordBefore.state === "Entered", `R9 is Entered before the screenshot, got ${recordBefore.state}`);

      // 1. The screenshot: R9's QR text at one moment, the pass's own code.
      const shot = await phones.call<{ qr: string; step: number }>("present", { tokenId: token, secretHex: need(r9.totpSecret, "secret") });
      const takenAt = Date.now();
      const refusedFrom = staleFrom(shot.step, totp) * 1000;
      s.note(`screenshot of R9's pass taken ${new Date(takenAt).toISOString()} (step ${shot.step}); a desk on the same clock accepts it until ${new Date(refusedFrom - 1000).toISOString()} and refuses it from ${new Date(refusedFrom).toISOString()}`);

      // 2. The wait, in real time, until the desk's own rule refuses the step.
      const waitMs = waitUntilStale(shot.step, totp, Date.now());
      s.note(`waiting ${(waitMs / 1000).toFixed(1)}s of real time (tolerance from the roster + 2s margin), no mocked clock`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      // 3. The friend presents it at the other desk.
      const presentedAt = Date.now();
      const stale = await deskA.call<{ kind: string; shownBib: number | null; offline: boolean }>("scan", { eventId: id, qr: shot.qr });
      const ageSeconds = (presentedAt - takenAt) / 1000;
      s.note(`desk-A scans the screenshot ${ageSeconds.toFixed(1)}s after it was taken: ${stale.kind.toUpperCase()}, screen shows bib ${stale.shownBib}`);
      s.check(stale.offline, "desk-A was offline during the scan");
      s.check(presentedAt >= refusedFrom, "the screenshot was presented only after the scanner's tolerance had passed");

      // 4. Refused, nothing queued, the record untouched.
      s.check(stale.kind === "expired", `the stale screenshot is EXPIRED at desk-A, got ${stale.kind}`);
      const queueAfter = await deskA.call<{ tokenId: number }[]>("claims", { eventId: id });
      s.check(!queueAfter.some((c) => c.tokenId === token), "desk-A queued no claim for R9");
      s.check(JSON.stringify(queueAfter) === JSON.stringify(queueBefore), `desk-A's queue is unchanged (${queueBefore.length} rows before and after)`);
      const recordAfter = await sterun.recordOf(token);
      s.check(
        recordAfter.state === recordBefore.state && recordAfter.claimedAt === recordBefore.claimedAt,
        `R9's record is untouched: ${recordAfter.state}, claimed_at ${recordAfter.claimedAt}`,
      );

      // Then the runner, with the live pass: the pass works, the screenshot does not.
      const live = await scanAt(s, deskB, "desk-B", r9);
      s.check(live.kind === "green", `R9's current code is GREEN at desk-B, got ${live.kind}`);
      const queueB = await deskB.call<{ tokenId: number }[]>("claims", { eventId: id });
      s.check(queueB.filter((c) => c.tokenId === token).length === 1, "desk-B queued R9 once");

      s.note(`step took ${((Date.now() - stepStarted) / 1000).toFixed(1)}s, almost all of it the wait: the screenshot had to outlive the roster's ±${totp.toleranceSteps} step tolerance before it was shown`);
    });

    await ev.step("5.1", "5", "Double claim at the same desk: desk-A scans R2 again, still offline", "desk process: fe verdictFor", async (s) => {
      const verdict = await scanAt(s, deskA, "desk-A", r2);
      s.check(verdict.kind === "claimed" && verdict.claimedHere === true, `RED "Already claimed" from this desk's own queue, got ${verdict.kind}`);
      const claims = await deskA.call<{ tokenId: number }[]>("claims", { eventId: need(eventId, "event") });
      s.check(claims.filter((c) => c.tokenId === r2.tokenId).length === 1, "the queue still holds R2 once");
    });

    type SyncResult = {
      stop: { kind: string; message?: string } | null;
      errors: { tokenId: number; name: string; message: string }[];
      claims: { tokenId: number; bibNo: number; status: string; txHash?: string; reason?: string }[];
      startedAt: string;
    };
    const syncs: Record<"desk-A" | "desk-B", SyncResult[]> = { "desk-A": [], "desk-B": [] };
    const noteSync = (s: StepContext, name: string, sync: SyncResult) => {
      s.note(`${name} started ${sync.startedAt}, stop reason ${JSON.stringify(sync.stop)}`);
      for (const e of sync.errors) {
        const r = runners.find((x) => x.tokenId === e.tokenId);
        s.note(`${name} raw error sending ${r?.label}: ${e.name}: ${e.message}`);
      }
      for (const claim of sync.claims) {
        const r = runners.find((x) => x.tokenId === claim.tokenId);
        s.note(`${name} row ${r?.label}: ${claim.status}${claim.reason ? ` (${claim.reason})` : ""}`);
      }
    };
    const recordSentTxs = (s: StepContext, name: string, before: SyncResult | undefined, after: SyncResult) => {
      for (const claim of after.claims) {
        const already = before?.claims.find((c) => c.tokenId === claim.tokenId)?.txHash;
        if (claim.txHash && claim.txHash !== already) {
          const r = runners.find((x) => x.tokenId === claim.tokenId);
          s.tx(`${name} claim_racepack ${r?.label} (bib ${claim.bibNo})`, claim.txHash);
        }
      }
    };

    await ev.step("4.3", "4 + 6", "Signal returns: both desks press Send at the same moment", "desk processes: fe sendClaims → claim_racepack", async (s) => {
      const id = need(eventId, "event");
      const a = await deskA.call<{ offlineCallsBlocked: number }>("online");
      const b = await deskB.call<{ offlineCallsBlocked: number }>("online");
      s.note(`network calls attempted while offline: desk-A ${a.offlineCallsBlocked}, desk-B ${b.offlineCallsBlocked}`);
      const goAt = Date.now() + 3_000;
      const [syncA, syncB] = await Promise.all([
        deskA.call<SyncResult>("sync", { eventId: id, goAt }),
        deskB.call<SyncResult>("sync", { eventId: id, goAt }),
      ]);
      syncs["desk-A"].push(syncA);
      syncs["desk-B"].push(syncB);
      for (const [name, sync] of [["desk-A", syncA], ["desk-B", syncB]] as const) {
        recordSentTxs(s, name, undefined, sync);
        noteSync(s, name, sync);
      }
      const stopped = ([["desk-A", syncA], ["desk-B", syncB]] as const).filter(([, sync]) => sync.stop !== null);
      if (stopped.length > 0) {
        s.owner = "James (SDK) + Ancung (scanner)";
        s.ticket = "STE-61, STE-62";
      }
      s.check(stopped.length === 0, `both desks finish their queue in one press; stopped: ${stopped.map(([n, x]) => `${n} ${JSON.stringify(x.stop)}`).join("; ")}`);
    });

    await ev.step("4.4", "4", "A desk whose run stopped does what its screen says: presses Send again", "desk processes: fe sendClaims", async (s) => {
      const id = need(eventId, "event");
      let pressed = 0;
      for (const [name, desk] of [["desk-A", deskA], ["desk-B", deskB]] as const) {
        const last = syncs[name].at(-1);
        if (!last || last.stop === null) continue;
        pressed += 1;
        s.note(`${name} showed "${last.stop.message ?? last.stop.kind}"; the volunteer presses Send again`);
        const again = await desk.call<SyncResult>("sync", { eventId: id, goAt: 0 });
        syncs[name].push(again);
        recordSentTxs(s, name, last, again);
        noteSync(s, name, again);
        s.check(again.stop === null, `${name}'s second press finishes the queue`);
      }
      if (pressed === 0) s.note("no desk stopped, so nobody had to press Send twice");
      for (const r of [r1, r2, r3, r4, r5, r6, r7, r9]) {
        const record = await sterun.recordOf(need(r.tokenId, "token"));
        s.check(record.state === "RacepackClaimed", `${r.label} RacepackClaimed on chain, got ${record.state}`);
      }
      s.check((await sterun.recordOf(need(r8.tokenId, "R8"))).state === "Entered", "R8 (no-show) still Entered");
      const sentByA = syncs["desk-A"].flatMap((sync) => sync.claims).filter((c) => c.tokenId === r9.tokenId);
      s.check(sentByA.length === 0, "desk-A, shown only R9's stale screenshot (F.1), never sent a claim for R9");
      s.note("chain: all 8 runners who came are RacepackClaimed; R8 is still Entered");
    });

    await ev.step("6.1", "6", "Two offline desks claimed R4: the chain keeps one, the other desk flags it", "desk processes + chain + RPC + Horizon", async (s) => {
      const finalRow = (name: "desk-A" | "desk-B") => syncs[name].at(-1)?.claims.find((c) => c.tokenId === r4.tokenId);
      const a = finalRow("desk-A");
      const b = finalRow("desk-B");
      s.note(`desk-A R4 row: ${JSON.stringify(a)}`);
      s.note(`desk-B R4 row: ${JSON.stringify(b)}`);
      const winners = [a, b].filter((c) => c?.status === "sent");
      const losers = [a, b].filter((c) => c?.status === "refused");
      s.check(winners.length === 1 && losers.length === 1, `exactly one sent and one refused, got ${[a, b].map((c) => c?.status).join("/")}`);
      const winnerName = a?.status === "sent" ? "desk-A" : "desk-B";
      const loserName = winnerName === "desk-A" ? "desk-B" : "desk-A";
      s.tx(`winner ${winnerName} claim_racepack R4`, winners[0]!.txHash!);
      s.check(losers[0]!.reason === "already-claimed", "loser refused as already-claimed");
      const record = await sterun.recordOf(need(r4.tokenId, "R4"));
      s.note(`chain: R4 ${record.state}, claimed_at ${record.claimedAt}; one pack is recorded, the second handover is what the flag is for`);

      const loserKey = loserName === "desk-A" ? deskKeys.A : deskKeys.B;
      const historyUrl = `${HORIZON}/accounts/${loserKey.publicKey()}/transactions?include_failed=true&order=asc&limit=50`;
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
      const flagged = await (loserName === "desk-A" ? deskA : deskB).call<{ lines: string[]; copied: string }>("flagged", { eventId: need(eventId, "event") });
      s.note(`${loserName} Flagged screen: ${JSON.stringify(flagged.lines)}`);
      s.note(`${loserName} "copy for organiser": ${JSON.stringify(flagged.copied)}`);
      s.check(flagged.lines.length === 1 && /Already collected elsewhere/.test(flagged.lines[0]!), "the flag appears on the losing desk");
      s.note("two desks = two OS processes, each with its own IndexedDB and queue, running the web app's scanner code; the two-phone repeat is M.3");
    });

    await ev.step("5.2", "5", "Double claim on chain: desk-A sends a claim for R2 again", "web app readClient", async (s) => {
      const before = await sterun.recordOf(need(r2.tokenId, "R2"));
      if (before.state !== "RacepackClaimed") throw new BlockedError(`R2 is ${before.state}, not RacepackClaimed, so a second claim would be a first one`);
      const result = await consoleDevice.call("attempt", { secret: deskKeys.A.secret(), method: "claimRacepack", args: [need(r2.tokenId, "R2"), deskKeys.A.publicKey()] });
      expectRevert(s, result, { code: 102, variant: "AlreadyClaimed" });
    });

    await ev.step("N.6", "N", "Organiser tries to record a finish for the no-show R8 (never claimed)", "web app readClient", async (s) => {
      const result = await consoleDevice.call("attempt", { secret: organiser.secret(), method: "recordFinish", args: [need(r8.tokenId, "R8"), 1800] });
      expectRevert(s, result, { code: 103, variant: "InvalidState" });
    });

    await ev.step("X.2", "4", "The index shows the claims and each desk's check-in count (STE-43)", "API", async (s) => {
      const id = need(eventId, "event");
      const scanners = await waitFor("claims in the index", async () => {
        const [records, list] = await Promise.all([
          api<{ records: { token_id: number; state: string }[] }>(`/events/${id}/records`),
          api<{ scanners: Record<string, unknown>[] }>(`/events/${id}/scanners`),
        ]);
        const claimed = records.body.records?.filter((x) => x.state === "RacepackClaimed").length;
        return claimed === 8 ? list.body.scanners : undefined;
      });
      s.url(`GET /events/${id}/scanners`, `${API}/events/${id}/scanners`);
      s.note(`scanners: ${JSON.stringify(scanners)}`);
    });

    // ------------------------------------------------------------ proofs 7 + 8
    const previewCsv = async (csv: string) =>
      api<{ source_sha256: string; counts: Record<string, number>; rows: { line: number; bib_no: number | null; kind: string | null; anomalies: { kind: string; severity: string; reason: string }[] }[]; publishable: { token_id: number; kind: "timed" | "untimed" | "dnf"; finish_time_s: number | null; bib_no: number }[] }>(
        `/events/${need(eventId, "event")}/results/preview`,
        { method: "POST", headers: { ...(await signedHeaders(organiser)), "content-type": "text/csv" }, body: csv },
      );

    const results = new Map<string, { kind: "timed" | "untimed" | "dnf"; time: number | null }>([
      [r1.label, { kind: "timed", time: 3161 }],
      [r2.label, { kind: "timed", time: 3320 }],
      [r3.label, { kind: "dnf", time: null }],
      [r4.label, { kind: "timed", time: 3905 }],
      [r5.label, { kind: "timed", time: 1650 }],
      [r6.label, { kind: "timed", time: 1799 }],
      [r7.label, { kind: "untimed", time: null }],
      [r8.label, { kind: "dnf", time: null }],
      [r9.label, { kind: "timed", time: 4020 }],
    ]);
    const clock = (seconds: number) => `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    const csvLine = (r: Runner, override?: string) => {
      const result = results.get(r.label)!;
      const time = override ?? (result.time === null ? "" : clock(result.time));
      const status = result.kind === "timed" ? "finished" : result.kind === "untimed" ? "untimed" : r === r8 ? "dns" : "dnf";
      return `${r.bib},${time},${status}`;
    };

    await ev.step("7.1", "7", "Results CSV with a deliberate anomaly is held at preview", "API (organiser-signed)", async (s) => {
      const csv = ["bib_no,finish_time,status", ...runners.map((r) => (r === r6 ? csvLine(r, "0:02:10") : csvLine(r))), "999,0:45:00,finished"].join("\n");
      s.note(`CSV rows: ${csv.split("\n").slice(1).join(" | ")}`);
      const res = await previewCsv(csv);
      s.url(`POST /events/${eventId}/results/preview`, `${API}/events/${eventId}/results/preview`);
      s.check(res.status === 200, `preview 200, got ${res.status} ${JSON.stringify(res.body)}`);
      s.note(`source_sha256 ${res.body.source_sha256}; counts ${JSON.stringify(res.body.counts)}`);
      for (const row of res.body.rows.filter((x) => x.anomalies.length > 0)) {
        s.note(`held: line ${row.line} bib ${row.bib_no} → ${row.anomalies.map((a) => `${a.kind}/${a.severity}: ${a.reason}`).join("; ")}`);
      }
      s.check(res.body.counts.impossible_time === 1, "R6's 2:10 5K is flagged impossible_time");
      s.check(res.body.counts.unknown_bib === 1, "bib 999 is flagged unknown_bib");
      s.check(res.body.publishable.length === 8, `8 publishable, got ${res.body.publishable.length}`);
      s.check(!res.body.publishable.some((p) => p.bib_no === r6.bib), "R6 is NOT publishable");
    });

    let publishable: { token_id: number; kind: "timed" | "untimed" | "dnf"; finish_time_s: number | null; bib_no: number }[] = [];
    await ev.step("7.2", "7", "The organiser corrects R6's time; the corrected file previews clean", "API (organiser-signed)", async (s) => {
      const csv = ["bib_no,finish_time,status", ...runners.map((r) => csvLine(r))].join("\n");
      const res = await previewCsv(csv);
      s.check(res.status === 200, `preview 200, got ${res.status}`);
      s.note(`source_sha256 ${res.body.source_sha256}; counts ${JSON.stringify(res.body.counts)}`);
      s.check(res.body.publishable.length === 9, `9 publishable, got ${res.body.publishable.length}`);
      publishable = res.body.publishable;
      const untimed = publishable.find((p) => p.token_id === r7.tokenId);
      s.check(untimed?.kind === "untimed" && untimed.finish_time_s === null, "R7 is untimed with finish_time_s null (never 0)");
      s.check(publishable.find((p) => p.token_id === r8.tokenId)?.kind === "dnf", "R8's dns is read as dnf (allowed from Entered)");
      s.url(`POST /events/${eventId}/results/preview`, `${API}/events/${eventId}/results/preview`);
    });

    await ev.step("8.1", "8", "Organiser records the 9 results, one transaction each", "SDK (what the console would send)", async (s) => {
      s.check(publishable.length === 9, "the reviewed rows are available");
      for (const row of publishable) {
        const r = runners.find((x) => x.tokenId === row.token_id)!;
        const as = SterunClient.as(organiser);
        const sent =
          row.kind === "timed"
            ? await sterun.recordFinish(row.token_id, row.finish_time_s!, as)
            : row.kind === "untimed"
              ? await sterun.recordFinishUntimed(row.token_id, as)
              : await sterun.recordDnf(row.token_id, as);
        s.tx(`${row.kind === "timed" ? `record_finish ${clock(row.finish_time_s!)}` : row.kind === "untimed" ? "record_finish_untimed" : "record_dnf"} ${r.label} (bib ${row.bib_no})`, sent.txHash);
      }
      s.note("'batch' is nine signatures: the contract has no multi-result call yet (STE-60), and the console's CSV upload screen is STE-58 (Backlog)");
    });

    await ev.step("N.7", "N", "Re-uploading the same CSV after publishing: every row is held as already_final", "API", async (s) => {
      await waitFor("results in the index", async () => {
        const res = await api<{ records: { state: string }[] }>(`/events/${need(eventId, "event")}/records`);
        return res.body.records?.every((x) => x.state === "Finished" || x.state === "Dnf") ? true : undefined;
      });
      const res = await previewCsv(["bib_no,finish_time,status", ...runners.map((r) => csvLine(r))].join("\n"));
      s.note(`counts ${JSON.stringify(res.body.counts)}`);
      s.check(res.body.counts.already_final === 9 && res.body.publishable.length === 0, "all 9 held, 0 publishable");
    });

    // ------------------------------------------------------------ proof 9
    const reference = await import(pathToFileURL(join(REPO, "docs", "specs", "reference", "node", "verify-vectors.mjs")).href) as {
      participantHash: (name: string, id: string, contact: string, salt: Uint8Array) => string;
    };
    const expectedState = (r: Runner) => (results.get(r.label)!.kind === "dnf" ? "Dnf" : "Finished");

    for (const r of runners) {
      await ev.step(`9.${r.label}`, r === r7 ? "9 + U" : "9", `Anyone can verify ${r.label}'s final record from chain and API, without a wallet`, "SDK read + API + spec reference hash", async (s) => {
        const token = need(r.tokenId, `${r.label} token`);
        const result = results.get(r.label)!;
        const chain: SterunRecord = await sterun.readOnly().recordOf(token);
        s.note(`chain: state ${chain.state}, bib ${chain.bibNo}, finish_time_s ${chain.finishTimeS}, claimed_at ${chain.claimedAt}, result_at ${chain.resultAt}`);
        s.check(chain.state === expectedState(r), `state ${expectedState(r)}`);
        s.check(chain.finishTimeS === result.time, `finish_time_s ${result.time}`);

        const detail = await api<{ record: { state: string; bib_no: number; finish_time_s: number | null; participant_hash: string; runner_address: string }; transitions: { state?: string; tx_hash?: string }[] }>(`/records/${token}`);
        s.url(`GET /records/${token}`, `${API}/records/${token}`);
        s.check(detail.body.record.state === chain.state, `API state ${detail.body.record.state} equals chain`);
        s.check(detail.body.record.bib_no === chain.bibNo, "API bib equals chain");
        s.check(detail.body.record.finish_time_s === chain.finishTimeS, `API finish_time_s ${detail.body.record.finish_time_s} equals chain ${chain.finishTimeS}`);
        const history = await api<{ records: { token_id: number }[] }>(`/runners/${r.kp.publicKey()}/records`);
        s.url(`GET /runners/${r.label}/records`, `${API}/runners/${r.kp.publicKey()}/records`);
        s.check(history.body.records.some((x) => x.token_id === token), "the runner's history lists this record");
        s.url(`${r.label} on stellar.expert`, accountUrl(r.kp.publicKey()));

        const recomputed = reference.participantHash(r.person.name, r.person.national_id, r.person.emergency_contact, Buffer.from(need(r.salt, "salt"), "hex"));
        s.check(recomputed === chain.participantHash, "spec reference hash of (name, id, contact, salt) equals the on-chain participant_hash");
        s.check(await sterun.readOnly().verify(token, recomputed), "verify(token, recomputed hash) is true");
        const wrong = reference.participantHash(`${r.person.name} X`, r.person.national_id, r.person.emergency_contact, Buffer.from(r.salt!, "hex"));
        s.check(!(await sterun.readOnly().verify(token, wrong)), "verify with one character of the name changed is false");
        s.note("recomputed hash matches; a one-character change does not verify");
        const document = await sterun.readOnly().raceRecordDocument(token);
        s.note(`public JSON (C6): ${JSON.stringify(bigintJson(document)).slice(0, 400)}`);
      });
    }

    await ev.step("X.3", "X", "The race is marked Completed", "SDK", async (s) => {
      s.tx("set_event_status Completed", (await sterun.setEventStatus(need(eventId, "event"), "Completed", SterunClient.as(organiser))).txHash);
    });

    // ------------------------------------------------------------ manual
    await ev.step("M.1", "1", "Create the race through the organiser console UI", "human + browser wallet", async (s) => {
      s.manual("Ancung", "open /org/new on a deployed web app (none exists: S.2), connect an allowlisted wallet, create a race with two distances, quota and sUSD price, open it; record the event id and the tx hashes the wallet shows", "STE-32");
    });
    await ev.step("M.2", "2", "Enter a race and pay through the entry flow UI with a browser wallet", "human + browser wallet", async (s) => {
      s.manual("Ancung", "on the deployed app, as a runner: Get test sUSD, fill the form, sign enter in Freighter; confirm the pass shows the same bib as GET /records/:id; repeat with a second wallet after the distance sells out and check the sold-out sentence", "STE-32");
    });
    await ev.step("M.3", "6", "Two physical phones as offline desks, one runner at both", "humans + 2 phones + camera", async (s) => {
      s.manual(
        "Axel (coordination) + Ancung",
        "two volunteers open /scan on two phones, connect two scanner wallets, download the roster, then switch BOTH to airplane mode; one runner shows the same pass QR to both cameras (both must show HAND OVER); turn signal back on and press Send on both phones within the same few seconds; record both phones' claims lists, the flagged screen on the losing phone, and the winner's tx hash. 6.1 ran the same code in two processes; this is the device-level repeat",
        "STE-32",
      );
    });
    await ev.step("M.4", "9", "Public runner profile page", "human + browser", async (s) => {
      s.manual("Ancung", "build the public profile (STE-24, Backlog), open it for each rehearsal runner address in the evidence header and check state, finish time ('no official time' for R7, never 0) and the verify-hash panel", "STE-24");
    });
    await ev.step("M.5", "M", "Screen footage, the team walkthrough, the demo video", "Axel", async (s) => {
      s.manual("Axel", "out of scope for this ticket by the brief: record screen footage, schedule the team walkthrough with every owner, and cut the demo video (STE-28)", "STE-28");
    });
  } finally {
    for (const device of [deskA, deskB, phones, consoleDevice]) device.stop();
  }

  // ---------------------------------------------------------------- link check
  log("\n▸ Checking every link");
  await sleep(20_000); // give stellar.expert a moment to ingest the last ledgers
  for (const step of ev.steps) {
    for (const tx of step.txs) {
      const h = await fetch(`${HORIZON}/transactions/${tx.hash}`);
      const body = h.ok ? ((await h.json()) as { successful: boolean; ledger: number }) : null;
      tx.horizon = { status: h.status, successful: body?.successful ?? null, ledger: body?.ledger ?? null };
      let expert = await fetch(`https://api.stellar.expert/explorer/testnet/tx/${tx.hash}`);
      for (let i = 0; i < 6 && expert.status !== 200; i += 1) {
        await sleep(expert.status === 429 ? 10_000 : 5_000);
        expert = await fetch(`https://api.stellar.expert/explorer/testnet/tx/${tx.hash}`);
      }
      tx.expert = { status: expert.status };
      await sleep(400);
    }
    for (const url of step.urls) {
      if (/\/records\/\d+\/pass$|\/roster$|\/results\/preview$|\/faucet$|\/participants\//.test(url.url)) continue; // authenticated or POST-only
      const res = await fetch(url.url.replace("https://stellar.expert/explorer/", "https://api.stellar.expert/explorer/"));
      url.status = res.status;
      await sleep(300);
    }
  }
  const txs = ev.steps.flatMap((s) => s.txs);
  const dead = txs.filter((t) => t.horizon?.status !== 200 || t.expert?.status !== 200);
  ev.meta.finished = new Date().toISOString();
  ev.meta["link check"] = `${txs.length - dead.length}/${txs.length} tx links resolve on Horizon and the stellar.expert API${dead.length ? `; not resolving: ${dead.map((t) => `${t.label} ${t.hash} (horizon ${t.horizon?.status}, expert ${t.expert?.status})`).join("; ")}` : ""}`;
  ev.meta["failed txs on the ledger (expected only for 6.1's losing desk, if any)"] = txs.filter((t) => t.horizon?.successful === false).map((t) => t.hash).join(", ") || "none";
  ev.write();

  const counts = ev.counts();
  log(`\nRESULT ${counts.PASS} PASS, ${counts.FAIL} FAIL, ${counts["MANUAL REQUIRED"]} MANUAL REQUIRED, ${counts.BLOCKED} BLOCKED of ${ev.steps.length}`);
  log(`evidence: ${join(RUN_DIR, "EVIDENCE.md")}`);
  log(`links: ${ev.meta["link check"]}`);
}

main().catch((error: unknown) => {
  console.error(`\n❌ rehearsal aborted: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
