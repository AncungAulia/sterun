/**
 * STE-16 — the reduced name that goes into a roster bundle.
 *
 * Two things are being checked, and the second one is the point:
 *
 *   it does the job — a volunteer can tell one runner from another;
 *   it cannot be turned back into a legal name — the characters are gone, not
 *   hidden, so this is not "obfuscated PII" and there is no key that undoes it.
 */
import { describe, expect, it } from "vitest";
import { MAX_FRAGMENT_LENGTH, nameFragment } from "../src/roster/name-fragment.js";
import { NormalizationError } from "../src/spec/normalize.js";

describe("the reduction", () => {
  it("keeps the given name and initials the rest", () => {
    expect(nameFragment("Budi Santoso")).toBe("Budi S.");
  });

  it("leaves a single-word name whole — there is nothing to reduce", () => {
    expect(nameFragment("Sukarno")).toBe("Sukarno");
  });

  it("initials every name after the first, including particles", () => {
    expect(nameFragment("Ana Maria de la Cruz")).toBe("Ana M. d. l. C.");
  });

  it("keeps case, because a name's capitalisation is part of it", () => {
    expect(nameFragment("siti NURHALIZA")).toBe("siti N.");
  });
});

describe("normalisation", () => {
  it("collapses whitespace, so a pasted double space produces the same fragment", () => {
    expect(nameFragment("Budi  Santoso")).toBe("Budi S.");
    expect(nameFragment("\tBudi\nSantoso ")).toBe("Budi S.");
  });

  it("collapses the whitespace the spec defines, not the one JavaScript does", () => {
    // Written as escapes on purpose: a literal U+00A0 in a source file is
    // invisible in review, and eslint's no-irregular-whitespace rejects it.
    // U+00A0 is Unicode whitespace and is NOT ECMAScript whitespace, so an
    // implementation built on \s would keep it and treat the whole string as
    // one token — the divergence docs/specs/HASH_AND_TOTP.md §2.1 warns about.
    expect(nameFragment("Budi\u00A0Santoso")).toBe("Budi S.");
    // U+3000 IDEOGRAPHIC SPACE, the one a CJK keyboard produces.
    expect(nameFragment("Budi\u3000Santoso")).toBe("Budi S.");
  });

  it("normalises to NFC, so two encodings of the same name agree", () => {
    // "Jose\u0301" (e + combining acute) and "Jos\u00e9" (precomposed) render
    // identically and are different byte sequences.
    expect(nameFragment("Jose\u0301 Rizal")).toBe(nameFragment("Jos\u00e9 Rizal"));
  });
});

describe("refusals", () => {
  it.each([["empty", ""], ["only spaces", "   "], ["a NUL", "Budi\u0000Santoso"]])(
    "refuses %s, the same way the hash would",
    (_label, input) => {
      // Same moment, same error type: a name the spec will not hash is a name
      // this will not reduce, so a submit fails once rather than half-way.
      expect(() => nameFragment(input)).toThrow(NormalizationError);
    },
  );
});

describe("bounds", () => {
  it("never exceeds the length the roster schema allows", () => {
    const long = `${"Bartholomew".repeat(10)} ${"X ".repeat(40)}`;
    const fragment = nameFragment(long);
    expect(fragment.length).toBeLessThanOrEqual(MAX_FRAGMENT_LENGTH);
  });

  it("marks a truncated fragment rather than silently cutting it", () => {
    expect(nameFragment("Bartholomew".repeat(10))).toMatch(/…$/);
  });
});

describe("it is not reversible", () => {
  it("drops every character of every surname but the first", () => {
    const fragment = nameFragment("Budi Santoso Wijaya");
    expect(fragment).toBe("Budi S. W.");
    for (const gone of ["antoso", "ijaya", "Santoso", "Wijaya"]) {
      expect(fragment).not.toContain(gone);
    }
  });

  it("maps different surnames to the same fragment", () => {
    // The evidence that information is destroyed rather than encoded: two
    // different people produce one fragment, so no function can recover either.
    expect(nameFragment("Budi Santoso")).toBe(nameFragment("Budi Sudarsono"));
  });

  it("does not split an astral first character in half", () => {
    // U+1D4AE is a surrogate pair in UTF-16, so `token[0]` would yield a lone
    // surrogate — which JSON cannot round-trip and a scanner renders as a
    // replacement character.
    const fragment = nameFragment("Budi \u{1D4AE}antoso");
    expect(fragment).toBe("Budi \u{1D4AE}.");
    // 7 code points in 8 UTF-16 units: the pair survived whole.
    expect([...fragment].length).toBe(7);
    expect(fragment.length).toBe(8);
    // A lone surrogate would come back as U+FFFD here.
    expect(JSON.parse(JSON.stringify(fragment))).toBe(fragment);
  });
});
