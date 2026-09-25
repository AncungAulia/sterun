/**
 * What the rehearsal (mock-race.ts) and the demo seed (seed.ts) share: where
 * they point, the accounts they create, and the handful of chain and API calls
 * both make the same way.
 *
 * Moved out of mock-race.ts for STE-68 so the seed reuses these rather than
 * carrying a second copy that could drift. Nothing in here decides what a step
 * proves; that stays in each script.
 */
import { readFileSync } from "node:fs";

import { Asset, BASE_FEE, Keypair, Operation, TransactionBuilder, rpc } from "@stellar/stellar-sdk";
import { TESTNET } from "@sterunxyz/sdk";

import { wasmExports } from "./claims";
import type { Evidence, StepContext } from "./evidence";
import { readBalance, readHasTrustline } from "./trustline";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const REPO = process.env.STERUN_REPO_ROOT ?? process.cwd();
/**
 * `api.sterun.xyz` is the name the deployed web app reads from (STE-31/32);
 * `api-sterun.jameshub.fun` is the same box under its first name.
 */
export const API = (process.env.STERUN_API_URL ?? "https://api.sterun.xyz").replace(/\/+$/, "");
export const APP = (process.env.STERUN_APP_URL ?? "https://app.sterun.xyz").replace(/\/+$/, "");
export const HORIZON = "https://horizon-testnet.stellar.org";
export const FRIENDBOT = "https://friendbot.stellar.org";
export const RPC_URL = TESTNET.rpcUrl;
export const PASSPHRASE = TESTNET.networkPassphrase;

export const SUSD = 10_000_000n;

export const log = (message: string) => console.log(message);
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const bigintJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

/** IPC carries JSON, so a u64 travels to a device as `{ "$bigint": "…" }`. */
export const big = (value: bigint) => ({ $bigint: value.toString() });

/** Reads KEY=value lines. Values are never printed; only names are. */
export function readEnvFile(path: string): Map<string, string> {
  const out = new Map<string, string>();
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    out.set(match[1]!, match[2]!.replace(/^(['"])(.*)\1$/, "$2"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Secrets that must never reach the evidence files
// ---------------------------------------------------------------------------

/** Every secret the run has handled; the evidence writer refuses a file holding any. */
export const secrets: string[] = [];
export const remember = <T extends string>(secret: T): T => {
  secrets.push(secret);
  return secret;
};

export function newAccount(): Keypair {
  const kp = Keypair.random();
  remember(kp.secret());
  return kp;
}

// ---------------------------------------------------------------------------
// Chain and API helpers
// ---------------------------------------------------------------------------

export const server = new rpc.Server(RPC_URL);

export async function friendbot(address: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT}?addr=${encodeURIComponent(address)}`);
  if (!res.ok) throw new Error(`friendbot answered ${res.status} for ${address}`);
}

export async function addTrustline(kp: Keypair, asset: Asset): Promise<string> {
  const account = await server.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(120)
    .build();
  tx.sign(kp);
  const sent = await server.sendTransaction(tx);
  if (sent.status !== "PENDING") throw new Error(`changeTrust send status ${sent.status}`);
  const final = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`changeTrust ${final.status}`);
  return sent.hash;
}

/**
 * Does the deployed wasm behind `contractId` export `fn`? Read from the wasm's
 * own contract spec on chain; `null` when it could not be read, which callers
 * must treat as "do not assume".
 */
export async function contractExports(contractId: string, fn: string): Promise<boolean | null> {
  let wasm: Uint8Array;
  try {
    wasm = await server.getContractWasmByContractId(contractId);
  } catch {
    return null;
  }
  return wasmExports(wasm, fn);
}

/** Does `address` hold a trustline for `asset`? See `trustline.ts` for the why. */
export async function hasTrustline(address: string, asset: Asset): Promise<boolean> {
  return readHasTrustline(server, address, asset, PASSPHRASE);
}

/** The address's balance of `asset`; no trustline is a zero balance, not a failure. */
export async function susdBalance(address: string, asset: Asset): Promise<bigint> {
  return readBalance(server, address, asset, PASSPHRASE);
}

export async function signedHeaders(kp: Keypair): Promise<Record<string, string>> {
  const res = await fetch(`${API}/auth/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: kp.publicKey() }),
  });
  if (!res.ok) throw new Error(`/auth/challenge answered ${res.status}`);
  const { nonce } = (await res.json()) as { nonce: string };
  return {
    "x-sterun-address": kp.publicKey(),
    "x-sterun-nonce": nonce,
    "x-sterun-signature": Buffer.from(kp.signMessage(nonce)).toString("base64"),
  };
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON; keep the text
  }
  return { status: res.status, body: body as T };
}

/** `POST /faucet` for `kp`, signed the way the web app's "Get test sUSD" signs it. */
export const postFaucet = (kp: Keypair) => async () =>
  api<unknown>("/faucet", {
    method: "POST",
    headers: { ...(await signedHeaders(kp)), "content-type": "application/json" },
    body: "{}",
  });

export async function waitFor<T>(what: string, read: () => Promise<T | undefined>, timeoutMs = 180_000, everyMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (value !== undefined) return value;
    } catch (error) {
      last = error;
    }
    await sleep(everyMs);
  }
  throw new Error(`timed out after ${timeoutMs / 1000}s waiting for ${what}${last ? ` (last error: ${String(last)})` : ""}`);
}

/** A contract revert expected at simulation: no transaction exists, so the evidence is the error. */
export function expectRevert(
  s: StepContext,
  result: Record<string, unknown>,
  expected: { code: number; variant: string },
): void {
  if (result.sent) {
    s.tx("UNEXPECTEDLY ACCEPTED", String(result.txHash));
    throw new Error(`expected ${expected.variant}(${expected.code}), but the call was accepted`);
  }
  s.note(`refused: ${String(result.message)}`);
  s.note(`sentence the web app shows: "${String(result.friendly)}"`);
  if (result.enterFailure) s.note(`entry flow classification: ${JSON.stringify(result.enterFailure)}`);
  s.note("refused at simulation, so no transaction was submitted and no hash exists; the refusal text above is the evidence");
  s.check(result.code === expected.code, `code ${expected.code} (${expected.variant}), got ${String(result.code)} ${String(result.variant)}`);
}

/**
 * Every tx in the evidence is looked up on Horizon and the stellar.expert API,
 * and every public URL is fetched, so the evidence says which links a reader
 * can actually open. Written into `ev.meta`.
 */
export async function checkLinks(ev: Evidence, failedLabel: string): Promise<void> {
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
  ev.meta[failedLabel] = txs.filter((t) => t.horizon?.successful === false).map((t) => t.hash).join(", ") || "none";
  ev.write();
}
