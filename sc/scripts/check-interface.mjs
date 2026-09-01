#!/usr/bin/env node
//
// STE-14 (C3) — the freeze regression guard.
//
// `docs/specs/INTERFACE.md` is FROZEN at v1.0.0. A frozen document that nobody
// re-checks is just a document: the wasm can drift away from it in one commit
// and nothing goes red. This script closes that gap by reading BOTH sides
// mechanically and diffing them:
//
//   side A  `stellar contract info interface --wasm ... --output json`
//           (the SCSpecEntry stream carried inside the artifact that ships)
//   side B  the tables in `docs/specs/INTERFACE.md`
//   side C  `sc/bindings/*/src/index.ts` (the generated TypeScript handoff)
//
// What is asserted, and why each one is here:
//
//   functions   name + argument names/types/order + return type, BOTH ways.
//               This is the ABI James's SterunClient (STE-15) compiles against.
//   errors      code -> name, BOTH ways. Error codes are public ABI and are
//               never renumbered (CLAUDE.md, INTERFACE.md §3).
//   events      name + topic prefix + which fields are topics (in order) +
//               which are data. This is what the indexer (STE-16) filters on.
//   types       documented struct fields and enum variants, in spec order.
//   bindings    every function reachable from the generated client, every
//               error code present in its generated error map.
//
// NOT asserted: the wasm sha256. Rust builds are not bit-for-bit reproducible
// across machines and toolchains, and INTERFACE.md §0 says so out loud. A hash
// difference is printed as a WARN with that explanation; only the interface
// content is a hard failure. That is the honest guarantee: *the shape* is
// reproducible, the bytes are not.
//
// Usage (needs `stellar contract build` to have run first):
//
//   node sc/scripts/check-interface.mjs
//
// Exits non-zero on any mismatch, printing every difference rather than the
// first one, so a spec-change PR sees its whole blast radius at once.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(SC_DIR, "..");
const INTERFACE_MD = join(REPO, "docs", "specs", "INTERFACE.md");

// The two contracts, and where each one's freeze lives inside INTERFACE.md.
const CONTRACTS = [
  {
    name: "EventRegistry",
    wasm: join(SC_DIR, "target/wasm32v1-none/release/event_registry.wasm"),
    bindings: join(SC_DIR, "bindings/event-registry/src/index.ts"),
    sections: { fns: "1.1", types: "1.2", events: "1.3", errors: "1.4" },
    // `DataKey` is the storage schema. `#[contracttype]` exports it into the
    // spec, but it is not part of the surface a client calls, so INTERFACE.md
    // deliberately does not document it. Anything NEW showing up here is a
    // real spec change and must fail.
    internalTypes: ["DataKey"],
  },
  {
    name: "RaceRecord",
    wasm: join(SC_DIR, "target/wasm32v1-none/release/race_record.wasm"),
    bindings: join(SC_DIR, "bindings/race-record/src/index.ts"),
    sections: { fns: "2.1", types: "2.2", events: "2.3", errors: "2.4" },
    internalTypes: [],
  },
];

const problems = [];
const warnings = [];
const fail = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

// ---------------------------------------------------------------------------
// side A — read the spec out of the built wasm
// ---------------------------------------------------------------------------

/** Render an SCSpecTypeDef the way INTERFACE.md writes it (Soroban Rust names). */
function renderType(t) {
  if (t === undefined || t === null) return "()";
  if (typeof t === "string") {
    const scalar = {
      void: "()",
      bool: "bool",
      u32: "u32",
      i32: "i32",
      u64: "u64",
      i64: "i64",
      u128: "u128",
      i128: "i128",
      u256: "u256",
      i256: "i256",
      symbol: "Symbol",
      string: "String",
      address: "Address",
      bytes: "Bytes",
      timepoint: "Timepoint",
      duration: "Duration",
      error: "Error",
      val: "Val",
    };
    if (scalar[t]) return scalar[t];
    throw new Error(`unknown scalar spec type ${JSON.stringify(t)}`);
  }
  if (t.bytes_n) return `BytesN<${t.bytes_n.n}>`;
  if (t.udt) return t.udt.name;
  if (t.option) return `Option<${renderType(t.option.value_type)}>`;
  if (t.vec) return `Vec<${renderType(t.vec.element_type)}>`;
  if (t.map) return `Map<${renderType(t.map.key_type)}, ${renderType(t.map.value_type)}>`;
  if (t.tuple) return `(${t.tuple.value_types.map(renderType).join(", ")})`;
  if (t.result)
    return `Result<${renderType(t.result.ok_type)}, ${renderType(t.result.error_type)}>`;
  throw new Error(`unknown spec type ${JSON.stringify(t)}`);
}

function readWasmSpec(wasmPath) {
  const raw = execFileSync(
    "stellar",
    ["contract", "info", "interface", "--wasm", wasmPath, "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const entries = JSON.parse(raw);

  const fns = new Map();
  const errors = new Map(); // enum name -> Map(code -> variant name)
  const events = new Map();
  const structs = new Map();
  const unions = new Map();

  for (const e of entries) {
    if (e.function_v0) {
      const f = e.function_v0;
      fns.set(f.name, {
        args: f.inputs.map((i) => `${i.name}: ${renderType(i.type_)}`),
        ret: f.outputs.length === 0 ? "()" : renderType(f.outputs[0]),
      });
    } else if (e.udt_error_enum_v0) {
      const m = new Map();
      for (const c of e.udt_error_enum_v0.cases) m.set(c.value, c.name);
      errors.set(e.udt_error_enum_v0.name, m);
    } else if (e.event_v0) {
      const ev = e.event_v0;
      events.set(ev.name, {
        prefix: ev.prefix_topics,
        topics: ev.params
          .filter((p) => p.location === "topic_list")
          .map((p) => `${p.name}: ${renderType(p.type_)}`),
        data: ev.params
          .filter((p) => p.location !== "topic_list")
          .map((p) => `${p.name}: ${renderType(p.type_)}`),
      });
    } else if (e.udt_struct_v0) {
      structs.set(
        e.udt_struct_v0.name,
        e.udt_struct_v0.fields.map((f) => `${f.name}: ${renderType(f.type_)}`),
      );
    } else if (e.udt_union_v0) {
      unions.set(
        e.udt_union_v0.name,
        e.udt_union_v0.cases.map((c) => (c.void_v0 ? c.void_v0.name : c.tuple_v0.name)),
      );
    } else if (e.udt_enum_v0) {
      unions.set(
        e.udt_enum_v0.name,
        e.udt_enum_v0.cases.map((c) => c.name),
      );
    }
  }
  return { fns, errors, events, structs, unions };
}

// ---------------------------------------------------------------------------
// side B — read the freeze out of INTERFACE.md
// ---------------------------------------------------------------------------

const MD = readFileSync(INTERFACE_MD, "utf8");

/** Everything under `### <number> ...` up to the next heading of any level. */
function section(number) {
  const lines = MD.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^#{2,3} ${number}[. ]`).test(l));
  if (start === -1) throw new Error(`INTERFACE.md has no section ${number}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,3} /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

/**
 * Markdown table rows as arrays of trimmed cells, header + separator dropped.
 * A section may hold several tables (§2.4 has ours and OpenZeppelin's), so a
 * separator line drops only the header row directly above it — not everything
 * collected so far.
 */
function tableRows(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|") || !t.endsWith("|")) continue;
    const cells = t.slice(1, -1).split("|").map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) {
      out.pop(); // separator: the line above it was this table's header
      continue;
    }
    out.push(cells);
  }
  return out;
}

const ticks = (cell) => [...cell.matchAll(/`([^`]*)`/g)].map((m) => m[1]);
const firstTick = (cell) => (ticks(cell)[0] ?? null);
const EMPTY = /^(—|-|\*\(kosong\)\*)$/;

function mdFunctions(sec) {
  const fns = new Map();
  for (const cells of tableRows(section(sec))) {
    const name = firstTick(cells[0]);
    if (!name || !/^[a-z_][a-z0-9_]*$/.test(name)) continue;
    const argCell = cells[1] ?? "—";
    const retCell = cells[2] ?? "—";
    const args = EMPTY.test(argCell.trim())
      ? []
      : (firstTick(argCell) ?? "").split(",").map((a) => a.trim()).filter(Boolean);
    const ret = EMPTY.test(retCell.trim()) ? "()" : (firstTick(retCell) ?? retCell);
    fns.set(name, { args, ret });
  }
  return fns;
}

function mdErrors(sec) {
  const m = new Map();
  for (const cells of tableRows(section(sec))) {
    if (!/^\d+$/.test(cells[0])) continue;
    const name = firstTick(cells[1] ?? "");
    if (!name) continue;
    m.set(Number(cells[0]), name);
  }
  return m;
}

function mdEvents(sec) {
  const events = new Map();
  for (const cells of tableRows(section(sec))) {
    const name = firstTick(cells[0] ?? "");
    if (!name || !/^[A-Z][A-Za-z0-9]*$/.test(name)) continue;
    const topicTicks = ticks(cells[1] ?? "");
    const prefix = [];
    const topics = [];
    for (const t of topicTicks) {
      const quoted = t.match(/^"(.*)"$/);
      if (quoted) prefix.push(quoted[1]);
      else topics.push(t.trim());
    }
    const dataCell = (cells[2] ?? "").trim();
    const data = EMPTY.test(dataCell) ? [] : ticks(dataCell).map((d) => d.trim());
    events.set(name, { prefix, topics, data });
  }
  return events;
}

/** `Name { field: Type, ... }` and `Name = A | B | C` out of the ```text blocks. */
function mdTypes(sec) {
  const text = section(sec);
  const structs = new Map();
  const unions = new Map();
  for (const [, name, body] of text.matchAll(/^([A-Z][A-Za-z0-9]*)\s*\{\n([\s\S]*?)\n\}/gm)) {
    const fields = [];
    for (let line of body.split("\n")) {
      line = line.replace(/\/\/.*$/, "").trim().replace(/,$/, "");
      if (!line) continue;
      const m = line.match(/^([a-z_][a-z0-9_]*):\s*(.+)$/);
      if (m) fields.push(`${m[1]}: ${m[2].trim()}`);
    }
    structs.set(name, fields);
  }
  for (const [, name, rhs] of text.matchAll(/^([A-Z][A-Za-z0-9]*)\s*=\s*(.+)$/gm)) {
    unions.set(name, rhs.split("|").map((v) => v.trim()).filter(Boolean));
  }
  return { structs, unions };
}

/** §0 provenance table: contract -> { hash, bytes }. */
function mdWasmArtifacts() {
  const out = new Map();
  for (const cells of tableRows(section("0"))) {
    const label = cells[0] ?? "";
    const hash = firstTick(cells[2] ?? "");
    if (!hash || !/^[0-9a-f]{64}$/.test(hash)) continue;
    const bytes = Number((cells[3] ?? "").replace(/[^\d]/g, ""));
    out.set(label.startsWith("EventRegistry") ? "EventRegistry" : "RaceRecord", { hash, bytes });
  }
  return out;
}

// ---------------------------------------------------------------------------
// side C — read the generated TypeScript bindings
// ---------------------------------------------------------------------------

function readBindings(path) {
  if (!existsSync(path)) return null;
  const src = readFileSync(path, "utf8");
  // Client methods are the `name: (...)  => Promise<AssembledTransaction<...>>`
  // members of `export interface Client`. `__constructor` is not one of them:
  // the generator turns it into the static `Client.deploy({...})` argument.
  const methods = new Set(
    [...src.matchAll(/^ {2}([a-z_][a-z0-9_]*): \([^\n]*AssembledTransaction</gm)].map((m) => m[1]),
  );
  const hasDeploy = /static async deploy</.test(src);
  // Each `#[contracterror]` enum becomes its own exported const of
  // `code: {message:"Variant"}` pairs (`Error` is emitted as `Errors`).
  const errorCodes = new Map();
  for (const [, block] of src.matchAll(/^export const [A-Za-z]+ = \{\n([\s\S]*?)^\}/gm)) {
    for (const [, code, name] of block.matchAll(/^\s*(\d+): \{message:"([A-Za-z]+)"\}/gm)) {
      errorCodes.set(Number(code), name);
    }
  }
  return { methods, hasDeploy, errorCodes };
}

// ---------------------------------------------------------------------------
// the diff
// ---------------------------------------------------------------------------

function diffKeys(what, docSet, wasmSet, ctx) {
  for (const k of docSet) if (!wasmSet.has(k)) fail(`${ctx}: ${what} \`${k}\` is frozen in INTERFACE.md but MISSING from the built wasm`);
  for (const k of wasmSet) if (!docSet.has(k)) fail(`${ctx}: ${what} \`${k}\` exists in the built wasm but is NOT in the frozen INTERFACE.md`);
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("==============================================================");
console.log(" STE-14 — frozen interface vs built wasm vs generated bindings");
console.log(` freeze : ${INTERFACE_MD.replace(REPO + "/", "")}`);
console.log("==============================================================\n");

const artifacts = mdWasmArtifacts();

for (const c of CONTRACTS) {
  console.log(`--- ${c.name} ---------------------------------------------`);
  if (!existsSync(c.wasm)) {
    fail(`${c.name}: ${c.wasm} not found — run \`cd sc && stellar contract build\` first`);
    console.log("  wasm missing, skipped\n");
    continue;
  }

  const wasm = readWasmSpec(c.wasm);

  // -- wasm identity: reported, never enforced (see header comment).
  const bytes = readFileSync(c.wasm);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const frozen = artifacts.get(c.name);
  const size = statSync(c.wasm).size;
  if (frozen && frozen.hash === sha) {
    console.log(`  wasm sha256   ${sha} (${size} B) — matches INTERFACE.md §0`);
  } else if (frozen) {
    console.log(`  wasm sha256   ${sha} (${size} B)`);
    warn(
      `${c.name}: wasm sha256 differs from INTERFACE.md §0 (${frozen.hash}). ` +
        `NOT a failure — Rust builds are not bit-for-bit reproducible across machines. ` +
        `The interface comparison below is the binding guarantee.`,
    );
  }

  // -- functions
  const docFns = mdFunctions(c.sections.fns);
  diffKeys("function", new Set(docFns.keys()), new Set(wasm.fns.keys()), c.name);
  for (const [name, doc] of docFns) {
    const got = wasm.fns.get(name);
    if (!got) continue;
    if (!eq(doc.args, got.args))
      fail(`${c.name}.${name}: arguments drifted\n      frozen: (${doc.args.join(", ")})\n      wasm  : (${got.args.join(", ")})`);
    if (doc.ret !== got.ret)
      fail(`${c.name}.${name}: return type drifted — frozen \`${doc.ret}\`, wasm \`${got.ret}\``);
  }
  console.log(`  functions     ${docFns.size} frozen, ${wasm.fns.size} in wasm`);

  // -- errors (every #[contracterror] enum of this contract, merged by code)
  const docErrs = mdErrors(c.sections.errors);
  const wasmErrs = new Map();
  for (const m of wasm.errors.values()) for (const [k, v] of m) wasmErrs.set(k, v);
  diffKeys("error code", new Set(docErrs.keys()), new Set(wasmErrs.keys()), c.name);
  for (const [code, name] of docErrs) {
    const got = wasmErrs.get(code);
    if (got && got !== name)
      fail(`${c.name}: error ${code} is \`${name}\` in INTERFACE.md but \`${got}\` in the wasm — error codes are never renumbered`);
  }
  console.log(`  error codes   ${docErrs.size} frozen, ${wasmErrs.size} in wasm`);

  // -- events
  const docEvents = mdEvents(c.sections.events);
  diffKeys("event", new Set(docEvents.keys()), new Set(wasm.events.keys()), c.name);
  for (const [name, doc] of docEvents) {
    const got = wasm.events.get(name);
    if (!got) continue;
    if (!eq(doc.prefix, got.prefix))
      fail(`${c.name}.${name}: topic prefix drifted — frozen ${JSON.stringify(doc.prefix)}, wasm ${JSON.stringify(got.prefix)}`);
    // Topics keep declaration order — that is the order they appear on the
    // wire, and it is what an indexer's topic filter is positional about.
    if (!eq(doc.topics, got.topics))
      fail(`${c.name}.${name}: topic fields drifted\n      frozen: [${doc.topics.join(", ")}]\n      wasm  : [${got.topics.join(", ")}]`);
    // Data is an ScMap keyed by field name, so the wire order is alphabetical
    // regardless of declaration order (INTERFACE.md §1.3 says so, and its
    // worked `category_added` XDR example shows it). Compare as sets, then
    // separately hold the doc to listing them in that same wire order so the
    // table keeps matching what an indexer actually decodes.
    const docData = [...doc.data].sort();
    if (!eq(docData, [...got.data].sort()))
      fail(`${c.name}.${name}: data fields drifted\n      frozen: [${doc.data.join(", ")}]\n      wasm  : [${got.data.join(", ")}]`);
    else if (!eq(doc.data, docData))
      fail(`${c.name}.${name}: INTERFACE.md lists the data fields as [${doc.data.join(", ")}] but the ScMap wire order is alphabetical: [${docData.join(", ")}]`);
  }
  console.log(`  events        ${docEvents.size} frozen, ${wasm.events.size} in wasm`);

  // -- types. Documented ones must match exactly. Undocumented public UDTs are
  //    only tolerated when listed as internal, so a new one forces a spec PR.
  const docTypes = mdTypes(c.sections.types);
  for (const [name, fields] of docTypes.structs) {
    const got = wasm.structs.get(name);
    if (!got) fail(`${c.name}: struct \`${name}\` is frozen in INTERFACE.md but MISSING from the wasm`);
    else if (!eq(fields, got))
      fail(`${c.name}: struct \`${name}\` fields drifted\n      frozen: [${fields.join(", ")}]\n      wasm  : [${got.join(", ")}]`);
  }
  for (const [name, variants] of docTypes.unions) {
    const got = wasm.unions.get(name);
    if (!got) fail(`${c.name}: enum \`${name}\` is frozen in INTERFACE.md but MISSING from the wasm`);
    else if (!eq(variants, got))
      fail(`${c.name}: enum \`${name}\` variants drifted\n      frozen: [${variants.join(" | ")}]\n      wasm  : [${got.join(" | ")}]`);
  }
  for (const name of [...wasm.structs.keys(), ...wasm.unions.keys()]) {
    if (docTypes.structs.has(name) || docTypes.unions.has(name)) continue;
    if (c.internalTypes.includes(name)) continue;
    fail(`${c.name}: type \`${name}\` is exported by the wasm but is neither frozen in INTERFACE.md nor listed as internal in this script`);
  }
  console.log(
    `  types         ${docTypes.structs.size} struct(s) + ${docTypes.unions.size} enum(s) frozen` +
      (c.internalTypes.length ? `, internal: ${c.internalTypes.join(", ")}` : ""),
  );

  // -- generated bindings
  const b = readBindings(c.bindings);
  if (!b) {
    fail(`${c.name}: generated bindings not found at ${c.bindings.replace(REPO + "/", "")} — run the regenerate command in sc/bindings/README.md`);
  } else {
    for (const name of docFns.keys()) {
      if (name === "__constructor") {
        if (!b.hasDeploy)
          fail(`${c.name}: bindings expose no \`Client.deploy\`, so \`__constructor\` is unreachable`);
        continue;
      }
      if (!b.methods.has(name))
        fail(`${c.name}: frozen function \`${name}\` has no method in the generated bindings`);
    }
    for (const [code, name] of docErrs) {
      const got = b.errorCodes.get(code);
      if (got === undefined) fail(`${c.name}: frozen error ${code} (\`${name}\`) is missing from the generated bindings' error map`);
      else if (got !== name) fail(`${c.name}: bindings map error ${code} to \`${got}\`, INTERFACE.md freezes \`${name}\``);
    }
    console.log(
      `  bindings      ${b.methods.size} client method(s) + Client.deploy, ${b.errorCodes.size} error code(s)`,
    );
  }
  console.log();
}

for (const w of warnings) console.log(`WARN  ${w}\n`);

if (problems.length) {
  console.log("==============================================================");
  console.log(` INTERFACE FREEZE VIOLATED — ${problems.length} problem(s)`);
  console.log("==============================================================");
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(
    "\nThe freeze is v1.0.0 and is NOT edited to match the code. Either revert the\n" +
      "contract change, or open a spec-change PR: approval from @Axel + @fable, a new\n" +
      "entry in docs/specs/CHANGELOG.md, and regenerated bindings (see §7 of\n" +
      "docs/specs/INTERFACE.md). Error codes are never renumbered.",
  );
  process.exit(1);
}

console.log("==============================================================");
console.log(" INTERFACE OK — built wasm and generated bindings still match");
console.log(" the frozen docs/specs/INTERFACE.md v1.0.0.");
console.log("==============================================================");
