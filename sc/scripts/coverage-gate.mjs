#!/usr/bin/env node
//
// STE-14 (C3) — turn "coverage di atas 80%" into something a third party can
// read without installing Rust, and into a gate that actually fails.
//
// CLAUDE.md requires `cargo llvm-cov` above 80% for the contracts. Until now
// that number only existed on whoever's laptop last ran it. This script:
//
//   1. reads the machine-readable report (`cargo llvm-cov report --json
//      --summary-only`), so nothing is retyped by hand;
//   2. renders it as a Markdown table on stdout AND, in CI, appends it to
//      `$GITHUB_STEP_SUMMARY` — the number is then on the job page, readable
//      by anyone with the PR link;
//   3. FAILS the job when either contract's `lib.rs` drops below the
//      threshold, on regions or on lines.
//
// Only the two `lib.rs` files are gated. `test.rs` coverage is close to
// meaningless (test code covers itself), and `registry.rs` is the
// `#[contractclient]` trait declaration — a macro input with no executable
// body of its own, so llvm-cov reports one uncovered region for it forever;
// gating it would be gating a lie.
//
// Usage:
//   cd sc
//   cargo llvm-cov --no-report
//   cargo llvm-cov report --summary-only                       # human table
//   cargo llvm-cov report --json --summary-only --output-path target/coverage.json
//   node scripts/coverage-gate.mjs target/coverage.json
//
// Env:
//   COVERAGE_MIN         threshold in percent (default 80)
//   GITHUB_STEP_SUMMARY  when set, the table is appended to that file too
//
// To convince yourself the gate is real rather than decorative, raise the bar
// above the current number and watch it go red:
//   COVERAGE_MIN=99 node scripts/coverage-gate.mjs target/coverage.json

import { appendFileSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const MIN = Number(process.env.COVERAGE_MIN ?? "80");
const reportPath = process.argv[2] ?? "target/coverage.json";
const SC_DIR = resolve(new URL("..", import.meta.url).pathname);

// The files whose coverage is a product claim, and must not silently rot.
const GATED = ["contracts/event_registry/src/lib.rs", "contracts/race_record/src/lib.rs"];

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (e) {
  console.error(`coverage-gate: cannot read ${reportPath}: ${e.message}`);
  console.error("Run `cargo llvm-cov report --json --summary-only --output-path <path>` first.");
  process.exit(2);
}

const data = report?.data?.[0];
if (!data?.files) {
  console.error(`coverage-gate: ${reportPath} is not an llvm-cov summary export`);
  process.exit(2);
}

const pct = (n) => (Number.isFinite(n) ? n.toFixed(2) + "%" : "n/a");
const rows = data.files
  .map((f) => ({
    path: relative(SC_DIR, f.filename),
    regions: f.summary.regions.percent,
    lines: f.summary.lines.percent,
    functions: f.summary.functions.percent,
    gated: false,
  }))
  .sort((a, b) => a.path.localeCompare(b.path));

const failures = [];
for (const want of GATED) {
  const row = rows.find((r) => r.path === want);
  if (!row) {
    failures.push(`\`${want}\` is not in the coverage report at all — did the tests build?`);
    continue;
  }
  row.gated = true;
  if (row.regions < MIN)
    failures.push(`\`${want}\` regions ${pct(row.regions)} is below the ${MIN}% floor`);
  if (row.lines < MIN)
    failures.push(`\`${want}\` lines ${pct(row.lines)} is below the ${MIN}% floor`);
}

const md = [];
md.push(`## Contract coverage (\`cargo llvm-cov\`)`);
md.push("");
md.push(`Floor: **${MIN}%** regions and lines, on each contract's \`lib.rs\` (marked 🔒).`);
md.push("");
md.push("| File | Regions | Lines | Functions | |");
md.push("| --- | ---: | ---: | ---: | :--- |");
for (const r of rows) {
  const ok = !r.gated || (r.regions >= MIN && r.lines >= MIN);
  md.push(
    `| \`${r.path}\` | ${pct(r.regions)} | ${pct(r.lines)} | ${pct(r.functions)} | ${
      r.gated ? (ok ? "🔒 pass" : "🔒 **FAIL**") : ""
    } |`,
  );
}
const t = data.totals;
md.push(
  `| **TOTAL** | **${pct(t.regions.percent)}** | **${pct(t.lines.percent)}** | **${pct(
    t.functions.percent,
  )}** | |`,
);
md.push("");
if (failures.length) {
  md.push(`### ❌ Coverage gate FAILED`);
  md.push("");
  for (const f of failures) md.push(`- ${f}`);
  md.push("");
  md.push(
    "Add tests for the uncovered paths. Do not lower the floor: CLAUDE.md fixes it at 80%.",
  );
} else {
  md.push(`### ✅ Coverage gate passed — both contracts above ${MIN}%.`);
}
md.push("");

const out = md.join("\n");
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + "\n");
}

process.exit(failures.length ? 1 : 0);
