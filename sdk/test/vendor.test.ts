/**
 * STE-19 — the vendored bindings are byte-identical to the generated ones.
 *
 * `@sterun/sdk` is published, and a `file:` dependency cannot be, so the binding
 * code ships inside this package. A copy of generated code is a liability
 * exactly as long as nothing checks it: regenerate the bindings after a contract
 * change, forget the SDK, and the published client keeps speaking the old
 * interface while every other check in the repo goes green.
 *
 * This makes that a red test instead. It is also what lets sc/bindings/README's
 * "never hand-edit generator output" stay true of the copies.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

const VENDORED = [
  { pkg: "event-registry", file: "event-registry.ts" },
  { pkg: "race-record", file: "race-record.ts" },
] as const;

describe("sdk/vendor mirrors sc/bindings", () => {
  it.each(VENDORED)("$file is byte-identical to sc/bindings/$pkg/src/index.ts", ({ pkg, file }) => {
    const generated = readFileSync(
      resolve(REPO_ROOT, "sc", "bindings", pkg, "src", "index.ts"),
      "utf8",
    );
    const vendored = readFileSync(resolve(HERE, "..", "vendor", file), "utf8");
    expect(vendored).toBe(generated);
  });

  it("still carries the frozen export surface it is supposed to", () => {
    // A cheap sanity check that the copy is the real thing and not a stub: the
    // 18 functions INTERFACE.md §4 says RaceRecord exports, and nothing that
    // could move a record.
    const vendored = readFileSync(resolve(HERE, "..", "vendor", "race-record.ts"), "utf8");
    for (const method of [
      "enter",
      "claim_racepack",
      "record_finish",
      "record_dnf",
      "extend_record_ttl",
      "record_of",
      "records_of",
      "verify",
      "owner_of",
    ]) {
      expect(vendored).toContain(`${method}: (`);
    }
    for (const forbidden of ["transfer:", "transfer_from:", "approve:", "burn:", "burn_from:"]) {
      expect(vendored).not.toContain(forbidden);
    }
  });
});
