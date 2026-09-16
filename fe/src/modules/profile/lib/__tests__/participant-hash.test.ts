/**
 * The browser's participant_hash against docs/specs/vectors/participant_hash.json,
 * the same file the backend and the Rust reference answer. Every vector and every
 * refusal in it is a case here, read from the file rather than copied, so a test
 * cannot agree with an expectation somebody typed wrong.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  NormalizationError,
  SPEC_WHITESPACE_COUNT,
  participantHash,
  participantPreimage,
  saltBytes,
  type ParticipantDetails,
} from "@/modules/profile/lib/participant-hash";

interface Input {
  name: string;
  national_id: string;
  emergency_contact: string;
  salt_hex: string;
}

const spec = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../../../../docs/specs/vectors/participant_hash.json"), "utf8"),
) as {
  vectors: { id: string; input: Input; preimage_hex: string; expected_hash_hex: string }[];
  rejects: { id: string; input: Input; expected_error: { field: string; code: string } }[];
};

const details = (input: Input): ParticipantDetails => ({
  name: input.name,
  nationalId: input.national_id,
  emergencyContact: input.emergency_contact,
  receiptCode: input.salt_hex,
});

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

describe("the frozen vectors", () => {
  it.each(spec.vectors.map((v) => [v.id, v] as const))("%s", async (_id, v) => {
    expect(hex(participantPreimage(details(v.input)))).toBe(v.preimage_hex);
    expect(await participantHash(details(v.input))).toBe(v.expected_hash_hex);
  });

  it("hashes one person typed two Unicode ways to one hash", async () => {
    const precomposed = spec.vectors.find((v) => v.id === "ph-02-nfc-precomposed")!;
    const decomposed = spec.vectors.find((v) => v.id === "ph-03-nfc-decomposed")!;
    expect(precomposed.input.name).not.toBe(decomposed.input.name);
    expect(await participantHash(details(precomposed.input))).toBe(await participantHash(details(decomposed.input)));
  });
});

describe("the frozen refusals", () => {
  it.each(spec.rejects.map((r) => [r.id, r] as const))("%s", (_id, r) => {
    let thrown: unknown;
    try {
      participantPreimage(details(r.input));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(NormalizationError);
    expect(thrown).toMatchObject({ field: r.expected_error.field, code: r.expected_error.code });
  });
});

describe("the traps the spec names", () => {
  const plain = spec.vectors.find((v) => v.id === "ph-01-ascii-plain")!;

  it("keeps the case of a name, so a lower-case name is a different person", async () => {
    const lower = { ...details(plain.input), name: plain.input.name.toLowerCase() };
    expect(await participantHash(lower)).not.toBe(plain.expected_hash_hex);
  });

  it("holds whitespace to the 25 code points, NEL in and U+FEFF out", async () => {
    expect(SPEC_WHITESPACE_COUNT).toBe(25);

    const withNel = { ...details(plain.input), name: `${plain.input.name}` };
    expect(await participantHash(withNel)).toBe(plain.expected_hash_hex);

    const withBom = { ...details(plain.input), name: `﻿${plain.input.name}` };
    expect(await participantHash(withBom)).not.toBe(plain.expected_hash_hex);
  });

  it("uppercases an id with ASCII rules only, leaving other letters alone", () => {
    const id = { ...details(plain.input), nationalId: "ab-ß 12" };
    const bytes = participantPreimage(id);
    const text = new TextDecoder().decode(bytes.slice(0, bytes.indexOf(0, bytes.indexOf(0) + 1)));
    expect(text.endsWith("ABß12")).toBe(true);
  });

  it("hashes the receipt code's bytes, not its text", async () => {
    const asText = { ...details(plain.input), receiptCode: plain.input.salt_hex };
    const bytes = participantPreimage(asText);
    expect(bytes.slice(-32)).toEqual(saltBytes(plain.input.salt_hex));
    expect(bytes.length).toBe(77);
  });
});

describe("a receipt code as people paste it", () => {
  const plain = spec.vectors.find((v) => v.id === "ph-01-ascii-plain")!;

  it("reads it with spaces, a line break or capitals, since the bytes are the same", async () => {
    const code = plain.input.salt_hex;
    const messy = `  ${code.slice(0, 32).toUpperCase()}\n${code.slice(32)} `;
    expect(await participantHash({ ...details(plain.input), receiptCode: messy })).toBe(plain.expected_hash_hex);
  });

  it("refuses anything that is not 32 bytes of hex", () => {
    for (const code of ["", "abc", `${plain.input.salt_hex}0`, `0x${plain.input.salt_hex.slice(2)}`, "z".repeat(64)]) {
      expect(() => saltBytes(code), code).toThrow(NormalizationError);
    }
  });
});
