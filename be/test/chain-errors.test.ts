/**
 * STE-16 — contract reverts, and the bands that say where they came from.
 *
 * The most valuable test in this file is the last describe block: it parses the
 * error tables out of `docs/specs/INTERFACE.md` and asserts that the maps in
 * `src/chain/errors.ts` match them code-for-code and name-for-name. Those maps
 * are a hand-typed copy of a frozen ABI, and a hand-typed copy of anything
 * drifts. This makes the drift a red test in `pnpm test` rather than a wrong
 * error name in a log six weeks later.
 *
 * The `sc/` side has its own guard for the same property from the other
 * direction (`error_codes_of_the_two_contracts_are_disjoint_bands`), so the
 * numbering is now pinned from the contract, from the document, and from here.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ContractRevertError,
  EVENT_REGISTRY_ERRORS,
  NON_FUNGIBLE_TOKEN_ERRORS,
  RACE_RECORD_ERRORS,
  asContractRevert,
  classifyContractError,
  parseContractErrorCode,
} from "../src/chain/errors.js";

describe("parsing a revert out of an RPC message", () => {
  it("reads the code out of the string RPC actually returns", () => {
    expect(parseContractErrorCode("HostError: Error(Contract, #101)")).toBe(101);
    expect(parseContractErrorCode("Error(Contract, #4)")).toBe(4);
    // The RPC's spacing is not something we control.
    expect(parseContractErrorCode("Error(Contract,#5)")).toBe(5);
  });

  it("does not invent a revert from a message that merely contains a number", () => {
    expect(parseContractErrorCode("connection reset after 3 attempts")).toBeNull();
    expect(parseContractErrorCode("Error(WasmVm, MissingValue)")).toBeNull();
    expect(parseContractErrorCode("")).toBeNull();
  });

  it("returns a typed revert only when there is one", () => {
    expect(asContractRevert("Error(Contract, #5)", "enter")).toBeInstanceOf(ContractRevertError);
    expect(asContractRevert("socket hang up", "enter")).toBeNull();
  });
});

describe("bands decide which table a code belongs to", () => {
  it("reads #4 out of enter as EventRegistry's EventNotOpen, not RaceRecord's", () => {
    // The example from INTERFACE.md §3, and the one that would be wrong if the
    // bands were ignored: `enter` propagates the registry's revert unchanged.
    expect(classifyContractError(4)).toEqual({
      code: 4,
      source: "event-registry",
      name: "EventNotOpen",
    });
  });

  it.each([
    [1, "event-registry", "NotInitialized"],
    [5, "event-registry", "QuotaFull"],
    [13, "event-registry", "ScannerNotFound"],
    [100, "race-record", "NotInitialized"],
    [102, "race-record", "AlreadyClaimed"],
    [105, "race-record", "InvalidFinishTime"],
    [200, "openzeppelin", "NonExistentToken"],
    [214, "openzeppelin", "SymbolMaxLenExceeded"],
  ])("classifies #%i as %s/%s", (code, source, name) => {
    expect(classifyContractError(code)).toEqual({ code, source, name });
  });

  it("keeps the band even for a code no table names yet", () => {
    // A new variant added in the contract's band before this file catches up:
    // still attributable, just unnamed. Guessing a name would be worse.
    expect(classifyContractError(50)).toEqual({ code: 50, source: "event-registry", name: null });
    expect(classifyContractError(150)).toEqual({ code: 150, source: "race-record", name: null });
  });

  it("refuses to attribute a code outside every band", () => {
    // The SAC's own errors land here: a contract we did not write, whose
    // numbering is not ours to name.
    expect(classifyContractError(0)).toEqual({ code: 0, source: "unknown", name: null });
    expect(classifyContractError(1000)).toEqual({ code: 1000, source: "unknown", name: null });
  });
});

describe("ContractRevertError", () => {
  it("says the name, the number and the source in one line", () => {
    const error = asContractRevert("Error(Contract, #5)", "reserve_slot(0, 0)");
    expect(error?.message).toBe(
      "reserve_slot(0, 0) reverted with QuotaFull (#5, event-registry)",
    );
    expect(error?.variant).toBe("QuotaFull");
  });

  it("marks the four not-found reverts a walk may skip", () => {
    for (const code of [2, 3, 101, 200]) {
      expect(asContractRevert(`Error(Contract, #${code})`, "x")?.isNotFound).toBe(true);
    }
  });

  it("does not mark a genuine failure as not-found", () => {
    for (const code of [4, 5, 102, 103, 104]) {
      expect(asContractRevert(`Error(Contract, #${code})`, "x")?.isNotFound).toBe(false);
    }
  });

  it("keeps the raw message for codes outside our bands", () => {
    const error = asContractRevert("Error(Contract, #999) from the SAC", "transfer");
    expect(error?.source).toBe("unknown");
    expect(error?.raw).toContain("from the SAC");
  });
});

/**
 * INTERFACE.md renders each error table as `| code | Name | when |`. Parsing it
 * is deliberately narrow: a heading change should break this test loudly rather
 * than silently match nothing and pass.
 */
function tableFromInterface(section: string): Map<number, string> {
  const doc = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "specs", "INTERFACE.md"),
    "utf8",
  );
  const start = doc.indexOf(section);
  if (start === -1) throw new Error(`INTERFACE.md has no section headed ${JSON.stringify(section)}`);
  const rest = doc.slice(start + section.length);
  // Stop at the next heading, or at the horizontal rule that closes the section.
  const end = rest.search(/\n(#{1,4} |---\n)/);
  const body = end === -1 ? rest : rest.slice(0, end);

  const table = new Map<number, string>();
  for (const line of body.split("\n")) {
    const match = /^\|\s*(\d+)\s*\|\s*`?([A-Za-z]+)`?\s*\|/.exec(line.trim());
    if (match?.[1] && match[2]) table.set(Number(match[1]), match[2]);
  }
  if (table.size === 0) throw new Error(`no error rows parsed under ${JSON.stringify(section)}`);
  return table;
}

describe("the frozen tables in docs/specs/INTERFACE.md", () => {
  it("matches EVENT_REGISTRY_ERRORS exactly (§1.4)", () => {
    expect(Object.fromEntries(tableFromInterface("### 1.4 Error"))).toEqual(
      EVENT_REGISTRY_ERRORS,
    );
  });

  it("matches RACE_RECORD_ERRORS and the OpenZeppelin codes exactly (§2.4)", () => {
    // §2.4 renders both tables one after the other, so parse them together and
    // compare against the union — which is also how a caller sees them, since
    // an ScError carries no hint about which of the two it is.
    expect(Object.fromEntries(tableFromInterface("### 2.4 Error"))).toEqual({
      ...RACE_RECORD_ERRORS,
      ...NON_FUNGIBLE_TOKEN_ERRORS,
    });
  });

  it("keeps the three tables in disjoint bands", () => {
    const bands = [
      [Object.keys(EVENT_REGISTRY_ERRORS).map(Number), 1, 99],
      [Object.keys(RACE_RECORD_ERRORS).map(Number), 100, 199],
      [Object.keys(NON_FUNGIBLE_TOKEN_ERRORS).map(Number), 200, 299],
    ] as const;
    for (const [codes, low, high] of bands) {
      for (const code of codes) {
        expect(code).toBeGreaterThanOrEqual(low);
        expect(code).toBeLessThanOrEqual(high);
      }
    }
  });
});
