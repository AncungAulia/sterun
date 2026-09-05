/**
 * STE-15 — contract reverts, and the bands that say where they came from.
 *
 * The last describe block is the one that matters most: it parses the error
 * tables out of docs/specs/INTERFACE.md and asserts that the maps in
 * src/errors.ts match them code-for-code and name-for-name.
 *
 * Those maps are a hand-typed copy of a frozen ABI, and a hand-typed copy of
 * anything drifts. `be/test/chain-errors.test.ts` pins its own copy against the
 * same document from the other side of the repo, and `sc/` pins the numbering
 * from the contract itself. Neither copy is the source of truth — the frozen
 * document is — so the two cannot drift apart without one of these going red.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Errors as RegistryBindingErrors } from "event-registry";
import {
  Errors as RecordBindingErrors,
  NonFungibleTokenError as NonFungibleBindingErrors,
} from "race-record";
import {
  EVENT_REGISTRY_ERRORS,
  NON_FUNGIBLE_TOKEN_ERRORS,
  RACE_RECORD_ERRORS,
  SterunContractError,
  SterunError,
  asContractError,
  classifyContractError,
  parseContractErrorCode,
} from "../src/errors.js";

describe("reading a revert out of a host error string", () => {
  it("reads the code out of what RPC actually returns", () => {
    expect(parseContractErrorCode("HostError: Error(Contract, #101)")).toBe(101);
    expect(parseContractErrorCode("Error(Contract, #4)")).toBe(4);
    // Spacing is the RPC's business, not ours.
    expect(parseContractErrorCode("Error(Contract,#5)")).toBe(5);
  });

  it("finds the code inside the long diagnostic dump the RPC really sends", () => {
    // This is the shape observed live, not a tidied-up version of it.
    const raw = [
      "HostError: Error(Contract, #200)",
      "",
      "Event log (newest first):",
      '   0: [Diagnostic Event] topics:[error, Error(Contract, #200)], data:"escalating"',
      "   1: [Diagnostic Event] topics:[fn_call, C…, owner_of], data:9999",
    ].join("\n");
    expect(parseContractErrorCode(raw)).toBe(200);
  });

  it("does not invent a revert from a message that merely contains a number", () => {
    expect(parseContractErrorCode("connection reset after 3 attempts")).toBeNull();
    expect(parseContractErrorCode("Error(WasmVm, MissingValue)")).toBeNull();
    expect(parseContractErrorCode("")).toBeNull();
  });

  it("returns a typed error only when there is a revert to type", () => {
    expect(asContractError("Error(Contract, #5)", "enter")).toBeInstanceOf(SterunContractError);
    expect(asContractError("socket hang up", "enter")).toBeNull();
  });
});

describe("bands decide which table a code belongs to", () => {
  it("reads #4 out of enter as EventRegistry's EventNotOpen, not RaceRecord's", () => {
    // INTERFACE.md §3's own worked example, and the one that would be wrong if
    // the bands were ignored: enter propagates the registry's revert unchanged.
    expect(classifyContractError(4)).toEqual({
      code: 4,
      source: "event-registry",
      variant: "EventNotOpen",
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
  ])("classifies #%i as %s/%s", (code, source, variant) => {
    expect(classifyContractError(code)).toEqual({ code, source, variant });
  });

  it("keeps the two NotInitialized variants apart", () => {
    // Same name, different enums, different contracts. Matching on the name
    // alone would conflate "the registry was never wired" with "the record
    // contract was never wired" — different deployments, different fixes.
    const registry = asContractError("Error(Contract, #1)", "createEvent");
    const record = asContractError("Error(Contract, #100)", "enter");
    expect(registry?.is("NotInitialized", "event-registry")).toBe(true);
    expect(registry?.is("NotInitialized", "race-record")).toBe(false);
    expect(record?.is("NotInitialized", "race-record")).toBe(true);
    expect(record?.is("NotInitialized", "event-registry")).toBe(false);
  });

  it("keeps the band even for a code no table names yet", () => {
    // A variant added to a contract before this file catches up: still
    // attributable, just unnamed. Guessing a name would be worse.
    expect(classifyContractError(50)).toEqual({ code: 50, source: "event-registry", variant: null });
    expect(classifyContractError(150)).toEqual({ code: 150, source: "race-record", variant: null });
  });

  it("refuses to attribute a code outside every band", () => {
    // The sUSD SAC's own errors land here: a contract we did not write, whose
    // numbering is not ours to name.
    expect(classifyContractError(0)).toEqual({ code: 0, source: "unknown", variant: null });
    expect(classifyContractError(1000)).toEqual({ code: 1000, source: "unknown", variant: null });
  });
});

describe("SterunContractError", () => {
  it("says the variant, the number and the source in one line", () => {
    const error = asContractError("Error(Contract, #5)", "enter");
    expect(error?.message).toBe("enter reverted with QuotaFull (#5, event-registry)");
    expect(error?.variant).toBe("QuotaFull");
    expect(error?.method).toBe("enter");
  });

  it("is catchable as the SDK's own base type", () => {
    expect(asContractError("Error(Contract, #5)", "enter")).toBeInstanceOf(SterunError);
    expect(asContractError("Error(Contract, #5)", "enter")).toBeInstanceOf(Error);
  });

  it("marks the four not-found reverts a lookup may treat as empty", () => {
    for (const code of [2, 3, 101, 200]) {
      expect(asContractError(`Error(Contract, #${code})`, "x")?.isNotFound).toBe(true);
    }
  });

  it("does not mark a genuine refusal as not-found", () => {
    // QuotaFull, EventNotOpen, AlreadyClaimed, InvalidState, NotAuthorized:
    // every one of these means "show the user something", not "treat as absent".
    for (const code of [4, 5, 102, 103, 104]) {
      expect(asContractError(`Error(Contract, #${code})`, "x")?.isNotFound).toBe(false);
    }
  });

  it("keeps the untouched host string for codes outside our bands", () => {
    const error = asContractError("Error(Contract, #999) raised by the SAC", "enter");
    expect(error?.source).toBe("unknown");
    expect(error?.variant).toBeNull();
    expect(error?.raw).toContain("raised by the SAC");
    expect(error?.message).toContain("an unnamed error");
  });

  it("carries the original failure as `cause` when there was one", () => {
    const original = new Error("underlying");
    const error = asContractError("Error(Contract, #5)", "enter", { cause: original });
    expect(error?.cause).toBe(original);
  });
});

/**
 * INTERFACE.md renders each error table as `| code | Name | when |`. The parse
 * is deliberately narrow: a heading change should break this loudly rather than
 * silently match nothing and pass.
 */
function tableFromInterface(section: string): Map<number, string> {
  const doc = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "specs", "INTERFACE.md"),
    "utf8",
  );
  const start = doc.indexOf(section);
  if (start === -1) throw new Error(`INTERFACE.md has no section headed ${JSON.stringify(section)}`);
  const rest = doc.slice(start + section.length);
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
    expect(Object.fromEntries(tableFromInterface("### 1.4 Error"))).toEqual(EVENT_REGISTRY_ERRORS);
  });

  it("matches RACE_RECORD_ERRORS and the OpenZeppelin codes exactly (§2.4)", () => {
    // §2.4 renders both tables one after the other, so parse them together and
    // compare against the union — which is also how a caller meets them, since
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

  it("agrees with the bindings' own generated error maps", () => {
    // A third pin, and a different kind. The bindings are generated from the
    // wasm, so this asserts our tables match the *artefact*, where the other
    // two assert they match the *document*. sc/scripts/check-interface.mjs
    // already checks document against artefact; this closes the triangle from
    // the SDK's side, which is the side that has to name the error at runtime.
    expect(flatten(RegistryBindingErrors)).toEqual(EVENT_REGISTRY_ERRORS);
    expect(flatten(RecordBindingErrors)).toEqual(RACE_RECORD_ERRORS);
    expect(flatten(NonFungibleBindingErrors)).toEqual(NON_FUNGIBLE_TOKEN_ERRORS);
  });
});

const flatten = (table: Record<number, { message: string }>): Record<number, string> =>
  Object.fromEntries(Object.entries(table).map(([code, { message }]) => [code, message]));
