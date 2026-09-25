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

import type { StepContext } from "./evidence";

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

export async function susdBalance(address: string, asset: Asset): Promise<bigint> {
  const { balanceEntry } = await server.getAssetBalance(address, asset, PASSPHRASE);
  return balanceEntry ? BigInt(balanceEntry.amount) : 0n;
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
