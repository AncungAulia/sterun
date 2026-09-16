/**
 * STE-25 — one scanner desk, or one runner's phone, as its own OS process.
 *
 * The rehearsal forks this file twice as a desk ("desk-A", "desk-B") and once as
 * the runners' phones. A desk is not a mock of the scanner: every decision it
 * makes is the web app's own code, imported from `fe/src/modules/scanner/lib`:
 *
 *   roster download   fetchRoster  (the live API, wallet-signed)
 *   local storage     saveRoster / enqueueClaim / listClaims / markClaim,
 *                     over IndexedDB (fake-indexeddb, since Node has none)
 *   the verdict       parsePayload + verdictFor (TOTP checked locally)
 *   the sync          sendClaims, sending claim_racepack through the same
 *                     `readClient` the PWA uses
 *   the flagged list  refusalLine / listForOrganiser, from FlaggedPage
 *
 * Why a process per desk: two phones share nothing — not an IndexedDB, not a
 * queue, not a clock read. Two processes share nothing either, so a claim one
 * desk records cannot leak into the other desk's verdict the way it could if
 * both lived in one heap.
 *
 * What is NOT exercised, and is therefore marked MANUAL REQUIRED in the
 * evidence: the camera (the QR text is handed over instead of decoded from a
 * frame), the React screens, and a browser wallet's signing prompt (a Keypair
 * signs instead).
 *
 * Offline is enforced, not assumed: between `offline` and `online` the
 * process's `fetch` throws, so any network call a desk made while "offline"
 * would fail the step instead of quietly succeeding.
 *
 * Secrets arrive over the IPC channel and are never printed.
 */
import "fake-indexeddb/auto";

import { Keypair } from "@stellar/stellar-sdk";
import { SterunClient } from "@sterunxyz/sdk";

import { codeAt, qrPayload, timeStepOf } from "../../../fe/src/lib/totp";
import { readClient } from "../../../fe/src/lib/chain/sterun";
import { parsePayload } from "../../../fe/src/modules/scanner/lib/payload";
import { fetchRoster } from "../../../fe/src/modules/scanner/lib/roster-api";
import {
  enqueueClaim,
  listClaims,
  markClaim,
  readRoster,
  saveRoster,
} from "../../../fe/src/modules/scanner/lib/scanner-store";
import { sendClaims } from "../../../fe/src/modules/scanner/lib/send-claims";
import { verdictFor } from "../../../fe/src/modules/scanner/lib/verdict";

type Message = { id: number; cmd: string; [key: string]: unknown };

/** IPC carries JSON, so a u64 travels as `{ "$bigint": "…" }`. */
function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.$bigint === "string") return BigInt(record.$bigint);
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, revive(v)]));
  }
  return value;
}

const role = process.argv[2] ?? "device";
const realFetch = globalThis.fetch;
let offline = false;
let offlineCallsBlocked = 0;
let keypair: Keypair | null = null;

function goOffline(): void {
  offline = true;
  globalThis.fetch = (async () => {
    offlineCallsBlocked += 1;
    throw new TypeError(`${role} is offline: fetch refused`);
  }) as typeof fetch;
}

function goOnline(): void {
  offline = false;
  globalThis.fetch = realFetch;
}

function signer(): Keypair {
  if (!keypair) throw new Error(`${role} has no wallet yet`);
  return keypair;
}

const handlers: Record<string, (msg: Message) => Promise<unknown>> = {
  async wallet(msg) {
    keypair = Keypair.fromSecret(String(msg.secret));
    return { address: keypair.publicKey() };
  },

  /** A runner's phone: the pass's own code and QR text, for one step. */
  async present(msg) {
    const step = timeStepOf(Math.floor(Date.now() / 1000));
    const code = await codeAt(String(msg.secretHex), step);
    return { qr: qrPayload(Number(msg.tokenId), step, code), step };
  },

  async download(msg) {
    const eventId = Number(msg.eventId);
    const kp = signer();
    const sign = async (message: string) => Buffer.from(kp.signMessage(message)).toString("base64");
    const { roster, missingFromIndex } = await fetchRoster(eventId, kp.publicKey(), sign);
    await saveRoster({
      ...roster,
      raceName: String(msg.raceName),
      categories: msg.categories as { categoryId: number; code: string }[],
    });
    return {
      snapshotLedger: roster.snapshotLedger,
      generatedAt: roster.generatedAt,
      driftSeconds: roster.driftSeconds,
      totp: roster.totp,
      missingFromIndex,
      // Never the secret: only what a volunteer can see on the roster card.
      entries: roster.entries.map((e) => ({
        tokenId: e.tokenId,
        bibNo: e.bibNo,
        categoryId: e.categoryId,
        state: e.state,
      })),
    };
  },

  async offline() {
    goOffline();
    return { offline };
  },

  async online() {
    goOnline();
    return { offline, offlineCallsBlocked };
  },

  /** Exactly what ScanDeskPage.decide does with a QR the camera read. */
  async scan(msg) {
    const eventId = Number(msg.eventId);
    const roster = await readRoster(eventId);
    if (!roster) throw new Error(`${role} has no roster for event ${eventId}`);
    const scanned = parsePayload(String(msg.qr));
    if (!scanned) return { kind: "unreadable" };

    const nowStep = Math.floor(Date.now() / 1000 / roster.totp.stepSeconds);
    const recorded = await listClaims(eventId);
    const verdict = await verdictFor({
      presented: { via: "qr", ...scanned },
      roster,
      claims: recorded,
      nowStep,
    });

    if (verdict.kind === "green") {
      await enqueueClaim({
        tokenId: verdict.entry.tokenId,
        bibNo: verdict.entry.bibNo,
        eventId,
        scannedAt: new Date().toISOString(),
        status: "waiting",
      });
    }

    const entry = "entry" in verdict ? verdict.entry : null;
    return {
      kind: verdict.kind,
      shownBib: entry ? entry.bibNo : verdict.kind === "unknown" ? verdict.bibNo : null,
      tokenId: entry?.tokenId ?? null,
      claimedHere: verdict.kind === "claimed" ? verdict.claimedHere !== null : null,
      offline,
    };
  },

  /** useSendClaims.start, with a Keypair where the wallet kit would be. */
  async sync(msg) {
    const eventId = Number(msg.eventId);
    const goAt = Number(msg.goAt ?? 0);
    const kp = signer();
    const address = kp.publicKey();
    const claims = await listClaims(eventId);
    const wait = goAt - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const startedAt = new Date().toISOString();

    // The raw error behind a stop, for the evidence only: sendClaims itself
    // decides exactly as it does on a phone.
    const errors: { tokenId: number; name: string; message: string }[] = [];
    const stop = await sendClaims(claims, {
      send: async (tokenId) => {
        try {
          return await readClient.claimRacepack(tokenId, address, SterunClient.as(kp));
        } catch (error) {
          errors.push({
            tokenId,
            name: error instanceof Error ? error.name : typeof error,
            message: (error instanceof Error ? error.message : String(error)).slice(0, 400),
          });
          throw error;
        }
      },
      recordOf: async (tokenId) => {
        const record = await readClient.recordOf(tokenId);
        return { state: record.state, claimedAt: record.claimedAt };
      },
      mark: markClaim,
    });

    return { startedAt, finishedAt: new Date().toISOString(), stop, errors, claims: await listClaims(eventId) };
  },

  /**
   * One write through the web app's `readClient`, as `msg.secret`'s wallet.
   *
   * Used for the negative paths, so a refusal is read by the same code that
   * puts a sentence on the screen: `friendlyError` for the console and the
   * scanner, `classifyEnterFailure` (with the chain re-read the way
   * useEntryAttempt re-reads it) for the entry flow.
   */
  async attempt(msg) {
    const kp = Keypair.fromSecret(String(msg.secret));
    const method = String(msg.method);
    const args = revive(msg.args) as unknown[];
    const client = readClient as unknown as Record<string, (...a: unknown[]) => Promise<{ txHash: string }>>;
    const fn = client[method];
    if (typeof fn !== "function") throw new Error(`readClient has no ${method}`);
    try {
      const sent = await fn.call(readClient, ...args, SterunClient.as(kp));
      return { sent: true, txHash: sent.txHash };
    } catch (error) {
      const { friendlyError } = await import("../../../fe/src/lib/api/errors");
      const out: Record<string, unknown> = {
        sent: false,
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        code: (error as { code?: unknown }).code ?? null,
        variant: (error as { variant?: unknown }).variant ?? null,
        source: (error as { source?: unknown }).source ?? null,
        friendly: friendlyError(error),
      };
      if (method === "enter") {
        const { classifyEnterFailure } = await import("../../../fe/src/modules/entry/lib/enter-failure");
        const { readSusdBalance } = await import("../../../fe/src/lib/wallet/susd");
        const enter = args[0] as { eventId: number; categoryId: number; runner: string };
        const [event, category, balance] = await Promise.all([
          readClient.getEvent(enter.eventId),
          readClient.getCategory(enter.eventId, enter.categoryId),
          readSusdBalance(enter.runner),
        ]);
        out.enterFailure = classifyEnterFailure(error, {
          status: event.status,
          slotsLeft: category.quota - category.enteredCount,
          soldOutAddOns: [],
          balance,
          total: category.priceStroops,
        });
      }
      return out;
    }
  },

  async claims(msg) {
    return listClaims(Number(msg.eventId));
  },

  /** The words the flagged screen and its "copy for the organiser" button use. */
  async flagged(msg) {
    // Imported lazily: FlaggedPage is a React module, and only this command needs it.
    const { listForOrganiser, refusalLine } = await import(
      "../../../fe/src/modules/scanner/FlaggedPage"
    );
    const eventId = Number(msg.eventId);
    const refused = (await listClaims(eventId)).filter((c) => c.status === "refused");
    const roster = await readRoster(eventId);
    return {
      lines: refused.map((c) => refusalLine(c)),
      copied: listForOrganiser(roster?.raceName ?? null, refused),
    };
  },
};

process.on("message", (raw) => {
  const msg = raw as Message;
  const handler = handlers[msg.cmd];
  const reply = (body: Record<string, unknown>) => process.send?.({ id: msg.id, ...body });
  if (!handler) {
    reply({ ok: false, error: `unknown command ${msg.cmd}` });
    return;
  }
  handler(msg).then(
    (value) => reply({ ok: true, value: JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) }),
    (error: unknown) =>
      reply({
        ok: false,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      }),
  );
});

process.send?.({ id: 0, ok: true, value: { ready: role } });
