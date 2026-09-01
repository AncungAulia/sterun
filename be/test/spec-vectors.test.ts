/**
 * The backend's hash and TOTP implementation, held to the FROZEN vectors.
 *
 * These tests read `docs/specs/vectors/*.json` — the same files the Rust
 * reference implementation, the Node reference implementation, and the
 * contract's own `cargo test` read. That shared file is the entire point: the
 * backend, the two references, the Soroban host and (later) the scanner PWA all
 * have to produce identical bytes, and the only way to know they do is to run
 * them all against one artefact nobody is allowed to regenerate.
 *
 * If one of these fails, the implementation in be/src/spec/ is wrong. Do not
 * touch the vectors: they are frozen (docs/specs/CLAUDE.md), and a hash change
 * invalidates every participant_hash already on-chain.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/deployments.js";
import { NormalizationError, normContact, normId, normName } from "../src/spec/normalize.js";
import { SPEC_WHITESPACE_COUNT } from "../src/spec/whitespace.js";
import {
  participantHash,
  participantPreimage,
  saltFromHex,
} from "../src/spec/participant-hash.js";
import {
  codeAt,
  codeAtStep,
  codesEqual,
  counterBytes,
  qrPayload,
  secretFromHex,
  timeStep,
  verifyCode,
} from "../src/spec/totp.js";

const vectors = <T>(file: string): T =>
  JSON.parse(readFileSync(join(REPO_ROOT, "docs", "specs", "vectors", file), "utf8")) as T;

interface HashVector {
  id: string;
  input: { name: string; national_id: string; emergency_contact: string; salt_hex: string };
  normalized: { name: string; national_id: string; emergency_contact: string };
  preimage_hex: string;
  preimage_len: number;
  expected_hash_hex: string;
}
interface RejectVector {
  id: string;
  input: { name: string; national_id: string; emergency_contact: string; salt_hex: string };
  expected_error: { field: string; code: string };
}
const hashFile = vectors<{
  version: string;
  vectors: HashVector[];
  rejects: RejectVector[];
}>("participant_hash.json");

describe("participant_hash — frozen vectors", () => {
  it("is running against v1.0.0 of the vector file", () => {
    // Guards the case where someone bumps the vectors and the tests keep
    // passing because they only ever assert self-consistency.
    expect(hashFile.version).toBe("1.0.0");
    expect(hashFile.vectors).toHaveLength(5);
    expect(hashFile.rejects).toHaveLength(4);
  });

  it.each(hashFile.vectors.map((v) => [v.id, v] as const))(
    "%s — normalisation, preimage and hash all match",
    (_id, v) => {
      const input = {
        name: v.input.name,
        nationalId: v.input.national_id,
        emergencyContact: v.input.emergency_contact,
      };
      const salt = saltFromHex(v.input.salt_hex);

      // Asserting the normalised strings and the preimage, not just the final
      // hash: when a hash mismatches, this says which of the three steps drifted
      // instead of leaving 32 bytes of "wrong".
      expect(normName(input.name)).toBe(v.normalized.name);
      expect(normId(input.nationalId)).toBe(v.normalized.national_id);
      expect(normContact(input.emergencyContact)).toBe(v.normalized.emergency_contact);

      const preimage = participantPreimage(input, salt);
      expect(preimage.toString("hex")).toBe(v.preimage_hex);
      expect(preimage.length).toBe(v.preimage_len);
      expect(participantHash(input, salt)).toBe(v.expected_hash_hex);
    },
  );

  it("gives one hash to one person however their name is encoded (ph-02 vs ph-03)", () => {
    const [precomposed, decomposed] = ["ph-02-nfc-precomposed", "ph-03-nfc-decomposed"].map(
      (id) => hashFile.vectors.find((v) => v.id === id)!,
    );
    // Not a redundant restatement of the loop above: this is the property the
    // spec exists for. macOS keyboards emit decomposed, Windows and most
    // databases store precomposed, and a runner registers on one device and is
    // scanned from another.
    expect(precomposed!.expected_hash_hex).toBe(decomposed!.expected_hash_hex);
    expect(precomposed!.input.name).not.toBe(decomposed!.input.name);
  });

  it("gives different hashes to the same person under different salts (ph-05)", () => {
    const base = hashFile.vectors.find((v) => v.id === "ph-01-ascii-plain")!;
    const other = hashFile.vectors.find((v) => v.id === "ph-05-salt-only-differs")!;
    expect(other.input.name).toBe(base.input.name);
    expect(other.input.salt_hex).not.toBe(base.input.salt_hex);
    expect(other.expected_hash_hex).not.toBe(base.expected_hash_hex);
  });

  it.each(hashFile.rejects.map((v) => [v.id, v] as const))(
    "%s — refuses to hash, with the frozen field and code",
    (_id, v) => {
      const input = {
        name: v.input.name,
        nationalId: v.input.national_id,
        emergencyContact: v.input.emergency_contact,
      };
      try {
        participantHash(input, saltFromHex(v.input.salt_hex));
        throw new Error("expected the vector to be rejected");
      } catch (e) {
        expect(e).toBeInstanceOf(NormalizationError);
        const err = e as NormalizationError;
        expect(err.field).toBe(v.expected_error.field);
        expect(err.code).toBe(v.expected_error.code);
      }
    },
  );
});

describe("participant_hash — the encoding traps the spec calls out", () => {
  it("hashes the 32 raw salt bytes, never the 64 hex characters", () => {
    const v = hashFile.vectors[0]!;
    const input = {
      name: v.input.name,
      nationalId: v.input.national_id,
      emergencyContact: v.input.emergency_contact,
    };
    const wrong = Buffer.from(v.input.salt_hex, "utf8"); // 64 bytes of ASCII
    expect(wrong.length).toBe(64);
    // The classic bug produces a hash that looks entirely normal, which is why
    // it survives review. It must not survive the type.
    expect(() => participantHash(input, wrong)).toThrow(/exactly 32 raw bytes/);
  });

  it.each(["", "0x" + "a".repeat(62), "A".repeat(64), "a".repeat(63), "a".repeat(65)])(
    "rejects salt hex %j rather than coercing it",
    (bad) => {
      expect(() => saltFromHex(bad)).toThrow(/64 lowercase hex/);
    },
  );

  it("pins the whitespace set at the 25 code points the spec names", () => {
    expect(SPEC_WHITESPACE_COUNT).toBe(25);
  });
});

interface TotpVector {
  id: string;
  secret_hex: string;
  token_id: number;
  unix_seconds: number;
  time_step: number;
  counter_bytes_hex: string;
  expected_code: string;
  qr_payload: string;
}
interface VerifyVector {
  id: string;
  secret_hex: string;
  presented_code: string;
  presented_code_time_step: number;
  verify_at_unix_seconds: number;
  verify_at_time_step: number;
  expected_valid: boolean;
}
const totpFile = vectors<{
  version: string;
  vectors: TotpVector[];
  verification: VerifyVector[];
}>("totp.json");

describe("TOTP — frozen vectors", () => {
  it("is running against v1.0.0 of the vector file", () => {
    expect(totpFile.version).toBe("1.0.0");
    expect(totpFile.vectors).toHaveLength(4);
    expect(totpFile.verification).toHaveLength(8);
  });

  it.each(totpFile.vectors.map((v) => [v.id, v] as const))(
    "%s — step, counter bytes, code and QR payload all match",
    (_id, v) => {
      const secret = secretFromHex(v.secret_hex);
      const step = timeStep(v.unix_seconds);
      expect(step).toBe(BigInt(v.time_step));
      expect(counterBytes(step).toString("hex")).toBe(v.counter_bytes_hex);
      expect(codeAtStep(secret, step)).toBe(v.expected_code);
      expect(codeAt(secret, v.unix_seconds)).toBe(v.expected_code);
      expect(qrPayload(v.token_id, step, v.expected_code)).toBe(v.qr_payload);
    },
  );

  it("keeps the leading zero of tp-02, as a string, all the way into the QR", () => {
    const v = totpFile.vectors.find((x) => x.id === "tp-02-leading-zero")!;
    expect(v.expected_code).toMatch(/^0/);
    expect(v.expected_code).toHaveLength(6);
    // The bug this vector exists for: a code that ever becomes a number loses
    // the zero and every scan of that pass fails.
    expect(String(Number(v.expected_code))).not.toBe(v.expected_code);
    expect(JSON.parse(v.qr_payload).c).toBe(v.expected_code);
    expect(typeof JSON.parse(v.qr_payload).c).toBe("string");
  });

  it("emits the payload with exactly three keys in the frozen order, no spaces", () => {
    const payload = qrPayload(1, 59070000n, "911070");
    expect(payload).toBe('{"t":1,"s":59070000,"c":"911070"}');
    expect(payload).not.toMatch(/\s/);
    expect(Object.keys(JSON.parse(payload))).toEqual(["t", "s", "c"]);
  });

  it("holds the code steady for the rest of its 30s window (tp-04 is tp-01, 29s later)", () => {
    const [a, b] = ["tp-01-baseline", "tp-04-same-step-as-tp-01"].map(
      (id) => totpFile.vectors.find((v) => v.id === id)!,
    );
    // Same secret, a different instant inside the same step. This is what "the
    // code is valid for the rest of its window" means mechanically, and it is
    // why a scanner may see the same six digits twice in a row without that
    // being a replay.
    expect(b!.unix_seconds).toBeGreaterThan(a!.unix_seconds);
    expect(b!.unix_seconds - a!.unix_seconds).toBeLessThan(30);
    expect(b!.time_step).toBe(a!.time_step);

    const secret = secretFromHex(a!.secret_hex);
    expect(codeAt(secret, b!.unix_seconds)).toBe(codeAt(secret, a!.unix_seconds));
    expect(qrPayload(b!.token_id, timeStep(b!.unix_seconds), b!.expected_code)).toBe(a!.qr_payload);
  });

  it("gives different codes to different secrets at the same step", () => {
    // The property tp-04 does NOT test, checked directly rather than assumed.
    const step = timeStep(totpFile.vectors[0]!.unix_seconds);
    const codes = new Set(
      totpFile.vectors.map((v) => codeAtStep(secretFromHex(v.secret_hex), step)),
    );
    const distinctSecrets = new Set(totpFile.vectors.map((v) => v.secret_hex));
    expect(codes.size).toBe(distinctSecrets.size);
  });
});

describe("TOTP verification — the ±1 step window", () => {
  it.each(totpFile.verification.map((v) => [v.id, v] as const))(
    "%s — verdict matches the frozen expectation",
    (_id, v) => {
      expect(verifyCode(secretFromHex(v.secret_hex), v.presented_code, v.verify_at_unix_seconds)).toBe(
        v.expected_valid,
      );
    },
  );

  it("covers both directions of the window and both refusals just outside it", () => {
    // Reading the vector set itself, so a future edit that quietly drops the
    // out-of-window cases fails here rather than silently weakening the suite.
    const ids = totpFile.verification.map((v) => v.id);
    expect(totpFile.verification.filter((v) => v.expected_valid)).not.toHaveLength(0);
    expect(totpFile.verification.filter((v) => !v.expected_valid)).not.toHaveLength(0);
    expect(ids.some((id) => id.includes("previous"))).toBe(true);
    expect(ids.some((id) => id.includes("next"))).toBe(true);
  });

  it("rejects a code of the wrong length instead of throwing from timingSafeEqual", () => {
    const secret = secretFromHex(totpFile.vectors[0]!.secret_hex);
    // timingSafeEqual throws on a length mismatch, and a thrown exception is
    // itself a timing signal. A 5-character code is simply invalid.
    expect(codesEqual("12345", "123456")).toBe(false);
    expect(verifyCode(secret, "91107", totpFile.vectors[0]!.unix_seconds)).toBe(false);
    expect(verifyCode(secret, "", totpFile.vectors[0]!.unix_seconds)).toBe(false);
  });

  it("refuses a negative clock rather than computing a step from it", () => {
    expect(() => timeStep(-1)).toThrow(/non-negative/);
  });
});
