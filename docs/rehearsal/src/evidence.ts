/**
 * STE-25 — the evidence log, written while the rehearsal runs.
 *
 * Every step is appended the moment it ends and both files are rewritten, so a
 * run that dies at step 40 still leaves 39 steps of evidence on disk. Nothing is
 * composed afterwards from memory: the table IS the run.
 *
 * Status words, and what each promises:
 *
 *   PASS             the step did what the scenario expects, and the evidence
 *                    column points at the transaction or URL that shows it
 *   FAIL             it did not; the error is recorded verbatim with the step
 *   MANUAL REQUIRED  a human has to do this (a browser wallet prompt, a camera,
 *                    a page that is not deployed). Never simulated.
 *   BLOCKED          could not run because an earlier step failed
 *
 * A negative path that is refused the way it should be is a PASS: the thing
 * under test is the refusal.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Status = "PASS" | "FAIL" | "MANUAL REQUIRED" | "BLOCKED";

export interface TxRef {
  label: string;
  hash: string;
  /** Filled in by the link check at the end of the run. */
  horizon?: { status: number; successful: boolean | null; ledger: number | null };
  expert?: { status: number };
}

export interface UrlRef {
  label: string;
  url: string;
  status?: number;
}

export interface StepRecord {
  id: string;
  /** Which of the nine proofs in STE-25 this step belongs to, or a tag. */
  proof: string;
  title: string;
  driver: string;
  status: Status;
  startedAt: string;
  endedAt: string;
  txs: TxRef[];
  urls: UrlRef[];
  observations: string[];
  error?: string;
  /** Who must act, for FAIL and MANUAL REQUIRED. */
  owner?: string;
  ticket?: string;
}

export class BlockedError extends Error {}

export const EXPERT = "https://stellar.expert/explorer/testnet";
export const txUrl = (hash: string) => `${EXPERT}/tx/${hash}`;
export const accountUrl = (address: string) => `${EXPERT}/account/${address}`;
export const contractUrl = (address: string) => `${EXPERT}/contract/${address}`;

export class StepContext {
  readonly txs: TxRef[] = [];
  readonly urls: UrlRef[] = [];
  readonly observations: string[] = [];
  status: Status | null = null;
  owner?: string;
  ticket?: string;

  tx(label: string, hash: string): void {
    this.txs.push({ label, hash });
    console.log(`    tx  ${label}: ${txUrl(hash)}`);
  }

  url(label: string, url: string): void {
    this.urls.push({ label, url });
    console.log(`    url ${label}: ${url}`);
  }

  note(text: string): void {
    this.observations.push(text);
    console.log(`    · ${text}`);
  }

  /** Something a person must do. The step ends as MANUAL REQUIRED, never PASS. */
  manual(owner: string, what: string, ticket?: string): void {
    this.status = "MANUAL REQUIRED";
    this.owner = owner;
    if (ticket) this.ticket = ticket;
    this.note(`MANUAL REQUIRED (${owner}): ${what}`);
  }

  check(condition: unknown, message: string): void {
    if (!condition) throw new Error(`expected: ${message}`);
  }
}

export class Evidence {
  readonly steps: StepRecord[] = [];
  readonly meta: Record<string, unknown> = {};

  constructor(
    private readonly dir: string,
    private readonly forbidden: () => string[],
    /** The heading and the script named under it; the rehearsal's by default. */
    private readonly header: { title: string; script: string; legend?: string } = {
      title: "STE-25 mock race rehearsal — evidence",
      script: "docs/rehearsal/run.sh",
    },
  ) {
    mkdirSync(dir, { recursive: true });
  }

  async step(
    id: string,
    proof: string,
    title: string,
    driver: string,
    body: (s: StepContext) => Promise<void>,
    options: { owner?: string; ticket?: string } = {},
  ): Promise<StepRecord> {
    const startedAt = new Date().toISOString();
    console.log(`\n▸ [${id}] ${title}`);
    const s = new StepContext();
    let status: Status;
    let error: string | undefined;
    try {
      await body(s);
      status = s.status ?? "PASS";
    } catch (e) {
      if (e instanceof BlockedError) {
        status = "BLOCKED";
      } else {
        status = "FAIL";
      }
      error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    const record: StepRecord = {
      id,
      proof,
      title,
      driver,
      status,
      startedAt,
      endedAt: new Date().toISOString(),
      txs: s.txs,
      urls: s.urls,
      observations: s.observations,
      ...(error ? { error } : {}),
      ...((s.owner ?? options.owner) && status !== "PASS" ? { owner: s.owner ?? options.owner } : {}),
      ...((s.ticket ?? options.ticket) ? { ticket: s.ticket ?? options.ticket } : {}),
    };
    this.steps.push(record);
    console.log(`  ${status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "…"} ${status}${error ? ` — ${error}` : ""}`);
    this.write();
    return record;
  }

  write(): void {
    const json = JSON.stringify({ meta: this.meta, steps: this.steps }, null, 2);
    const md = this.markdown();
    for (const text of [json, md]) this.guard(text);
    writeFileSync(join(this.dir, "evidence.json"), `${json}\n`);
    writeFileSync(join(this.dir, "EVIDENCE.md"), md);
  }

  /** Refuses to write a file that contains a secret seed or any known secret value. */
  private guard(text: string): void {
    if (/\bS[A-Z2-7]{55}\b/.test(text)) throw new Error("refusing to write evidence: it contains a Stellar secret seed");
    for (const secret of this.forbidden()) {
      if (secret && text.includes(secret)) throw new Error("refusing to write evidence: it contains a secret value");
    }
  }

  counts(): Record<Status, number> {
    const out: Record<Status, number> = { PASS: 0, FAIL: 0, "MANUAL REQUIRED": 0, BLOCKED: 0 };
    for (const step of this.steps) out[step.status] += 1;
    return out;
  }

  private markdown(): string {
    const esc = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
    const c = this.counts();
    const lines: string[] = [];
    lines.push(`# ${this.header.title}`);
    lines.push("");
    lines.push(`Generated by \`${this.header.script}\` **while the run was in progress**, one step at a time.`);
    lines.push("Nothing in this file was written by hand. Scenario and how to re-run: [`../../README.md`](../../README.md).");
    lines.push("");
    lines.push("| | |");
    lines.push("| --- | --- |");
    for (const [key, value] of Object.entries(this.meta)) {
      lines.push(`| ${esc(key)} | ${esc(typeof value === "string" ? value : JSON.stringify(value))} |`);
    }
    lines.push(
      `| result | **${c.PASS} PASS**, **${c.FAIL} FAIL**, **${c["MANUAL REQUIRED"]} MANUAL REQUIRED**, **${c.BLOCKED} BLOCKED** of ${this.steps.length} steps |`,
    );
    lines.push("");
    lines.push(
      this.header.legend ??
        "Proof numbers refer to the nine evidence items in the STE-25 ticket; `S` = setup, `N` = negative path, `B` = bib agreement, `Q` = second batch, `U` = untimed finish, `F` = forwarded-QR fraud attempt (STE-67), `C` = cleanup (STE-68), `M` = manual, `X` = extra check.",
    );
    lines.push("");
    lines.push("## Steps");
    lines.push("");
    lines.push("| # | Proof | Step | Driver | Status | Evidence |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const step of this.steps) {
      const links = [
        ...step.txs.map((t) => `[${esc(t.label)}](${txUrl(t.hash)})${t.horizon ? (t.horizon.successful === false ? " (failed tx)" : "") : ""}`),
        ...step.urls.map((u) => `[${esc(u.label)}](${u.url})`),
      ];
      const status = step.status === "PASS" ? "✅ PASS" : step.status === "FAIL" ? "❌ FAIL" : step.status === "BLOCKED" ? "⛔ BLOCKED" : "✋ MANUAL REQUIRED";
      lines.push(`| ${step.id} | ${step.proof} | ${esc(step.title)} | ${esc(step.driver)} | ${status} | ${links.join("<br>") || "—"} |`);
    }
    lines.push("");
    lines.push("## Observations per step");
    lines.push("");
    for (const step of this.steps) {
      lines.push(`### ${step.id} — ${step.title}`);
      lines.push("");
      lines.push(`Status **${step.status}** · ${step.startedAt} → ${step.endedAt}${step.owner ? ` · owner **${step.owner}**` : ""}${step.ticket ? ` · ${step.ticket}` : ""}`);
      lines.push("");
      if (step.error) {
        lines.push("```");
        lines.push(step.error);
        lines.push("```");
        lines.push("");
      }
      for (const observation of step.observations) lines.push(`- ${observation}`);
      if (step.observations.length) lines.push("");
    }
    return `${lines.join("\n")}\n`;
  }
}
