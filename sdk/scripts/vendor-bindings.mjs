/**
 * STE-19 — copy the generated bindings into sdk/vendor/, byte for byte.
 *
 * Why a copy exists at all: `@sterun/sdk` is published to npm, and a `file:`
 * dependency cannot be. The published tarball has to carry the binding code
 * itself, so it is vendored here rather than depended on.
 *
 * Why it is a *byte-identical* copy and not an adaptation: sc/bindings/README.md
 * forbids hand-editing generator output, and an adapted copy would quietly stop
 * being the thing the wasm produced. test/vendor.test.ts compares these files to
 * their sources and fails on a single changed byte, so "regenerate the bindings
 * and forget the SDK" is a red test rather than a subtly stale client.
 *
 *     node scripts/vendor-bindings.mjs           # refresh
 *     node scripts/vendor-bindings.mjs --check   # verify, exit 1 on drift
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

export const VENDORED = [
  { pkg: "event-registry", file: "event-registry.ts" },
  { pkg: "race-record", file: "race-record.ts" },
];

export const sourcePath = (pkg) =>
  resolve(REPO_ROOT, "sc", "bindings", pkg, "src", "index.ts");
export const vendorPath = (file) => resolve(HERE, "..", "vendor", file);

const check = process.argv.includes("--check");
let drifted = 0;

mkdirSync(resolve(HERE, "..", "vendor"), { recursive: true });
for (const { pkg, file } of VENDORED) {
  const source = readFileSync(sourcePath(pkg), "utf8");
  if (check) {
    let current;
    try {
      current = readFileSync(vendorPath(file), "utf8");
    } catch {
      // Missing counts as drift: the copy has to exist for the package to build.
      current = null;
    }
    if (current !== source) {
      console.error(`drift: sdk/vendor/${file} differs from sc/bindings/${pkg}/src/index.ts`);
      drifted += 1;
    }
  } else {
    writeFileSync(vendorPath(file), source);
    console.log(`vendored sc/bindings/${pkg}/src/index.ts -> sdk/vendor/${file}`);
  }
}

if (check && drifted > 0) {
  console.error("\nRun `node scripts/vendor-bindings.mjs` from sdk/ to refresh.");
  process.exit(1);
}
