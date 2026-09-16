/**
 * The parser, against the payloads the frozen vectors say a pass produces.
 *
 * Reading the vector file rather than writing the strings out here is the point:
 * this is the one place the runner's phone and the volunteer's phone have to
 * agree byte for byte, and a test that quotes its own expectation proves only
 * that the quote was copied correctly.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parsePayload } from "@/modules/scanner/lib/payload";

const vectors = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../../../../docs/specs/vectors/totp.json"), "utf8"),
) as {
  vectors: { id: string; token_id: number; time_step: number; expected_code: string; qr_payload: string }[];
};

describe("a payload from the frozen vectors", () => {
  it.each(vectors.vectors.map((v) => [v.id, v] as const))("%s", (_id, v) => {
    expect(parsePayload(v.qr_payload)).toEqual({
      tokenId: v.token_id,
      step: v.time_step,
      code: v.expected_code,
    });
  });

  it("keeps a leading zero, as six characters and not as a number", () => {
    const leading = vectors.vectors.find((v) => v.id === "tp-02-leading-zero")!;
    const scanned = parsePayload(leading.qr_payload)!;
    expect(scanned.code).toBe("079663");
    expect(scanned.code).toHaveLength(6);
  });
});

describe("anything else the camera picks up", () => {
  it("refuses it quietly, with no throw", () => {
    const refused = [
      "",
      "not json at all",
      "https://sterun.xyz/events/3",
      "[1,2,3]",
      "null",
      '{"t":1,"s":59070000}',
      '{"s":59070000,"c":"911070"}',
      '{"t":1,"c":"911070"}',
      // The bug the spec exists to prevent: the code sent as a number.
      '{"t":1,"s":59070000,"c":911070}',
      // Five characters is malformed, not merely wrong (vf-08).
      '{"t":7,"s":59070111,"c":"79663"}',
      '{"t":7,"s":59070111,"c":"0796633"}',
      '{"t":7,"s":59070111,"c":"07966a"}',
      '{"t":"1","s":59070000,"c":"911070"}',
      '{"t":1.5,"s":59070000,"c":"911070"}',
      '{"t":-1,"s":59070000,"c":"911070"}',
    ];

    for (const text of refused) {
      expect(parsePayload(text), text).toBeNull();
    }
  });

  it("does not mind a payload written with spaces, since only the keys are frozen", () => {
    // The pass writes it without spaces. Another implementation of the same
    // three keys is still a valid pass, and refusing it would turn a formatting
    // difference into a runner sent away from a desk.
    expect(parsePayload('{ "t": 1, "s": 59070000, "c": "911070" }')).toEqual({
      tokenId: 1,
      step: 59070000,
      code: "911070",
    });
  });
});
