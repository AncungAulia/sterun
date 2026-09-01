#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Sterun C4 (STE-10) — reference implementation #1 of `participant_hash` + TOTP.
//
// Plain Node, `node:crypto` only, ZERO npm dependencies. Run it with:
//
//     node docs/specs/reference/node/verify-vectors.mjs
//
// It recomputes every vector in `docs/specs/vectors/` from the raw inputs and
// exits non-zero on any mismatch. The sibling Rust crate in
// `docs/specs/reference/rust/` implements the same spec independently; the
// acceptance criterion for STE-10 is that both agree on every vector
// (`docs/specs/verify.sh` runs both).
//
// The normative spec is `docs/specs/HASH_AND_TOTP.md`. This file is the
// executable copy of it — if the two ever disagree, the doc plus the vectors
// win and this file is the bug.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Unicode whitespace — an EXPLICIT set, deliberately not `\s` / `String.trim()`
//
// ECMAScript's WhiteSpace production and Rust's `char::is_whitespace()` are NOT
// the same set: JS counts U+FEFF (ZWNBSP) and does not count U+0085 (NEL);
// Rust follows the Unicode `White_Space=Yes` property, which is the exact
// opposite on both code points. A spec that said "Unicode whitespace" and then
// leaned on each language's built-in would produce two different hashes for the
// same input. So the set is written out here, once, and both reference
// implementations hard-code it.
//
// This is Unicode `White_Space=Yes` — 25 code points, unchanged since Unicode
// 4.1. The Rust crate has a test that proves this list equals
// `char::is_whitespace()` over the whole scalar range.
// ---------------------------------------------------------------------------

const WHITESPACE = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, // TAB LF VT FF CR
  0x0020,                                 // SPACE
  0x0085,                                 // NEL
  0x00a0,                                 // NO-BREAK SPACE
  0x1680,                                 // OGHAM SPACE MARK
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
  0x2006, 0x2007, 0x2008, 0x2009, 0x200a, // EN QUAD .. HAIR SPACE
  0x2028,                                 // LINE SEPARATOR
  0x2029,                                 // PARAGRAPH SEPARATOR
  0x202f,                                 // NARROW NO-BREAK SPACE
  0x205f,                                 // MEDIUM MATHEMATICAL SPACE
  0x3000,                                 // IDEOGRAPHIC SPACE
]);

const NUL_CP = 0x0000;
const isWs = (cp) => WHITESPACE.has(cp);

/** Thrown for any input the spec says must never be hashed. */
export class NormalizationError extends Error {
  constructor(code, field, detail) {
    super(`${code}: ${field} — ${detail}`);
    this.code = code;   // "E_EMPTY" | "E_NUL"
    this.field = field; // "name" | "national_id" | "emergency_contact" | "salt"
  }
}

// ---------------------------------------------------------------------------
// Normalization (HASH_AND_TOTP.md §2)
// ---------------------------------------------------------------------------

/**
 * N1 NFC · N2 trim · N3 collapse internal whitespace runs to one U+0020 ·
 * N4 reject empty or U+0000.
 */
export function normBase(s, field) {
  const cps = Array.from(s.normalize('NFC'), (ch) => ch.codePointAt(0));

  let start = 0;
  let end = cps.length;
  while (start < end && isWs(cps[start])) start += 1;
  while (end > start && isWs(cps[end - 1])) end -= 1;

  let out = '';
  let pendingSpace = false;
  let sawNul = false;
  for (let i = start; i < end; i += 1) {
    const cp = cps[i];
    if (isWs(cp)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      out += ' ';
      pendingSpace = false;
    }
    if (cp === NUL_CP) sawNul = true;
    out += String.fromCodePoint(cp);
  }

  if (out.length === 0) {
    throw new NormalizationError('E_EMPTY', field, 'empty after normalization');
  }
  if (sawNul) {
    throw new NormalizationError('E_NUL', field, 'contains U+0000');
  }
  return out;
}

/** Names keep their case — a person's name is not a lookup key. */
export function normName(s) {
  return normBase(s, 'name');
}

/** N5: strip whitespace and ASCII hyphen-minus, then ASCII-uppercase. */
export function normId(s) {
  const base = normBase(s, 'national_id');
  let out = '';
  for (const ch of base) {
    const cp = ch.codePointAt(0);
    if (isWs(cp) || cp === 0x2d) continue; // '-'
    // ASCII-only uppercasing: never `toUpperCase()`, which is locale- and
    // script-dependent (Turkish dotless i, German sharp s -> SS, ...).
    out += cp >= 0x61 && cp <= 0x7a ? String.fromCharCode(cp - 32) : ch;
  }
  if (out.length === 0) {
    throw new NormalizationError('E_EMPTY', 'national_id', 'empty after stripping separators');
  }
  return out;
}

/** N6: strip whitespace and `-`, `(`, `)`. A leading `+` is preserved. */
export function normContact(s) {
  const base = normBase(s, 'emergency_contact');
  let out = '';
  for (const ch of base) {
    const cp = ch.codePointAt(0);
    if (isWs(cp) || cp === 0x2d || cp === 0x28 || cp === 0x29) continue; // '-' '(' ')'
    out += ch;
  }
  if (out.length === 0) {
    throw new NormalizationError(
      'E_EMPTY',
      'emergency_contact',
      'empty after stripping separators',
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// participant_hash (HASH_AND_TOTP.md §3)
// ---------------------------------------------------------------------------

/**
 * utf8(norm_name) 0x00 utf8(norm_id) 0x00 utf8(norm_contact) 0x00 salt(32 raw)
 *
 * Exactly three separators; none after the salt. N4 guarantees no normalized
 * field can contain 0x00, so the encoding is injective without length prefixes.
 */
export function participantPreimage(name, nationalId, emergencyContact, saltBytes) {
  if (!(saltBytes instanceof Uint8Array) || saltBytes.length !== 32) {
    throw new NormalizationError('E_EMPTY', 'salt', 'salt must be exactly 32 raw bytes');
  }
  const NUL = Buffer.from([0x00]);
  return Buffer.concat([
    Buffer.from(normName(name), 'utf8'), NUL,
    Buffer.from(normId(nationalId), 'utf8'), NUL,
    Buffer.from(normContact(emergencyContact), 'utf8'), NUL,
    Buffer.from(saltBytes),
  ]);
}

/** 32 bytes, rendered lowercase hex with no `0x` prefix. */
export function participantHash(name, nationalId, emergencyContact, saltBytes) {
  return createHash('sha256')
    .update(participantPreimage(name, nationalId, emergencyContact, saltBytes))
    .digest('hex');
}

// ---------------------------------------------------------------------------
// TOTP (HASH_AND_TOTP.md §4)
// ---------------------------------------------------------------------------

export const TIME_STEP_SECONDS = 30n;
export const DIGITS = 6;
export const TOLERANCE_STEPS = 1;

/** floor(unix_seconds / 30), unsigned 64-bit. */
export function timeStep(unixSeconds) {
  const t = BigInt(unixSeconds);
  if (t < 0n) throw new RangeError('unix_seconds must be non-negative');
  return t / TIME_STEP_SECONDS;
}

/** The counter as 8 big-endian bytes. */
export function counterBytes(step) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(step));
  return buf;
}

/**
 * RFC 4226 §5.3 dynamic truncation over a 32-byte HMAC-SHA-256 MAC, mod 10^6,
 * rendered as a 6-character string left-padded with '0'.
 *
 * The code is a STRING everywhere, never an integer: `042315` parsed as a
 * number is 42315, and a JSON number would drop the leading zero on the wire.
 */
export function codeAtStep(secretBytes, step) {
  const mac = createHmac('sha256', Buffer.from(secretBytes))
    .update(counterBytes(step))
    .digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  // `>>> 0` keeps `bin` unsigned. `mac[offset] & 0x7f` already caps it below
  // 2^31 so it cannot actually go negative, but `<<` yields a signed int32 in
  // JS and the spec should not depend on that detail.
  return String((bin >>> 0) % 1_000_000).padStart(DIGITS, '0');
}

export function codeAt(secretBytes, unixSeconds) {
  return codeAtStep(secretBytes, timeStep(unixSeconds));
}

/** Constant-time equality over two 6-character ASCII codes. */
function codesEqual(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false; // length is public, not a secret
  return timingSafeEqual(ab, bb);
}

const SIX_DIGITS = /^[0-9]{6}$/;

/**
 * Accept iff `presented` equals the code for time_step-1, time_step or
 * time_step+1 (a window of up to 90 seconds). Every candidate is compared with
 * no early exit, so acceptance timing does not leak which step matched.
 */
export function verifyCode(secretBytes, unixSeconds, presented) {
  if (typeof presented !== 'string' || !SIX_DIGITS.test(presented)) return false;
  const step = timeStep(unixSeconds);
  let ok = false;
  for (let d = -TOLERANCE_STEPS; d <= TOLERANCE_STEPS; d += 1) {
    const candidate = step + BigInt(d);
    if (candidate < 0n) continue;
    ok = codesEqual(codeAtStep(secretBytes, candidate), presented) || ok;
  }
  return ok;
}

/** Compact QR payload: exactly three keys, this order, no whitespace. */
export function qrPayload(tokenId, step, code) {
  if (!SIX_DIGITS.test(code)) throw new RangeError(`code must be 6 digits, got ${code}`);
  return `{"t":${BigInt(tokenId)},"s":${BigInt(step)},"c":"${code}"}`;
}

// ---------------------------------------------------------------------------
// Hex helpers (lowercase, no prefix)
// ---------------------------------------------------------------------------

export function fromHex(hex) {
  if (!/^[0-9a-f]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new RangeError(`not lowercase hex: ${hex}`);
  }
  return Buffer.from(hex, 'hex');
}

export const toHex = (bytes) => Buffer.from(bytes).toString('hex');

// ---------------------------------------------------------------------------
// Vector runner
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
export const VECTOR_DIR = join(HERE, '..', '..', 'vectors');

const readVectors = (file) => JSON.parse(readFileSync(join(VECTOR_DIR, file), 'utf8'));

class Report {
  constructor() {
    this.rows = [];
  }

  check(id, what, actual, expected) {
    this.rows.push({ id, what, ok: actual === expected, actual, expected });
  }

  get failures() {
    return this.rows.filter((r) => !r.ok);
  }

  print() {
    const pad = (s, n) => String(s).padEnd(n);
    const idW = Math.max(6, ...this.rows.map((r) => r.id.length));
    const whatW = Math.max(5, ...this.rows.map((r) => r.what.length));
    console.log(`${pad('STATUS', 6)}  ${pad('VECTOR', idW)}  CHECK`);
    console.log('-'.repeat(6 + 2 + idW + 2 + whatW));
    for (const r of this.rows) {
      console.log(`${pad(r.ok ? 'PASS' : 'FAIL', 6)}  ${pad(r.id, idW)}  ${r.what}`);
      if (!r.ok) {
        console.log(`        expected: ${r.expected}`);
        console.log(`        actual:   ${r.actual}`);
      }
    }
  }
}

function runParticipantHash(report) {
  const doc = readVectors('participant_hash.json');
  for (const v of doc.vectors) {
    const salt = fromHex(v.input.salt_hex);
    report.check(v.id, 'norm_name', normName(v.input.name), v.normalized.name);
    report.check(v.id, 'norm_id', normId(v.input.national_id), v.normalized.national_id);
    report.check(
      v.id,
      'norm_contact',
      normContact(v.input.emergency_contact),
      v.normalized.emergency_contact,
    );
    const preimage = participantPreimage(
      v.input.name,
      v.input.national_id,
      v.input.emergency_contact,
      salt,
    );
    report.check(v.id, 'preimage', toHex(preimage), v.preimage_hex);
    report.check(
      v.id,
      'sha256',
      createHash('sha256').update(preimage).digest('hex'),
      v.expected_hash_hex,
    );
  }

  // NFC: the precomposed and decomposed spellings must land on ONE hash.
  for (const v of doc.vectors) {
    if (!v.same_hash_as) continue;
    const other = doc.vectors.find((x) => x.id === v.same_hash_as);
    if (!other) throw new Error(`${v.id}: same_hash_as names unknown vector ${v.same_hash_as}`);
    report.check(v.id, `same hash as ${other.id}`, v.expected_hash_hex, other.expected_hash_hex);
  }
  // ...and a vector flagged as differing only by salt must NOT collide.
  for (const v of doc.vectors) {
    if (!v.differs_from) continue;
    const other = doc.vectors.find((x) => x.id === v.differs_from);
    if (!other) throw new Error(`${v.id}: differs_from names unknown vector ${v.differs_from}`);
    report.check(
      v.id,
      `hash differs from ${other.id}`,
      String(v.expected_hash_hex !== other.expected_hash_hex),
      'true',
    );
  }

  for (const v of doc.rejects) {
    let got = 'accepted';
    try {
      participantPreimage(
        v.input.name,
        v.input.national_id,
        v.input.emergency_contact,
        fromHex(v.input.salt_hex),
      );
    } catch (e) {
      if (!(e instanceof NormalizationError)) throw e;
      got = `${e.field}/${e.code}`;
    }
    report.check(v.id, 'rejected', got, `${v.expected_error.field}/${v.expected_error.code}`);
  }
}

function runTotp(report) {
  const doc = readVectors('totp.json');
  for (const v of doc.vectors) {
    const secret = fromHex(v.secret_hex);
    const step = timeStep(v.unix_seconds);
    report.check(v.id, 'time_step', step.toString(), String(v.time_step));
    report.check(v.id, 'counter_bytes', toHex(counterBytes(step)), v.counter_bytes_hex);
    const code = codeAtStep(secret, step);
    report.check(v.id, 'code', code, v.expected_code);
    report.check(v.id, 'qr_payload', qrPayload(v.token_id, step, code), v.qr_payload);
  }

  for (const v of doc.verification) {
    const secret = fromHex(v.secret_hex);
    report.check(
      v.id,
      'verify',
      String(verifyCode(secret, v.verify_at_unix_seconds, v.presented_code)),
      String(v.expected_valid),
    );
  }
}

function main() {
  const report = new Report();
  runParticipantHash(report);
  runTotp(report);
  report.print();

  const { failures, rows } = report;
  console.log('');
  if (failures.length > 0) {
    console.log(`node reference: FAIL — ${failures.length}/${rows.length} checks mismatched`);
    process.exit(1);
  }
  console.log(`node reference: PASS — ${rows.length}/${rows.length} checks`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
