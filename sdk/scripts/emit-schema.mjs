/**
 * STE-19 — write schema/race-record-v1.0.json from the zod definition.
 *
 * The JSON Schema is generated, never hand-written, so the runtime validator and
 * the published document cannot disagree. test/schema.test.ts regenerates and
 * compares, so editing the JSON by hand is a red test.
 *
 *     node scripts/emit-schema.mjs           # write
 *     node scripts/emit-schema.mjs --check   # verify, exit 1 on drift
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { raceRecordJsonSchema } from "../dist/schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_FILE = resolve(HERE, "..", "schema", "race-record-v1.0.json");

const rendered = `${JSON.stringify(raceRecordJsonSchema(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = readFileSync(SCHEMA_FILE, "utf8");
  if (current !== rendered) {
    console.error(
      "drift: schema/race-record-v1.0.json is not what src/schema.ts generates.\n" +
        "Run `node scripts/emit-schema.mjs` after building.",
    );
    process.exit(1);
  }
  console.log("schema/race-record-v1.0.json is up to date");
} else {
  mkdirSync(dirname(SCHEMA_FILE), { recursive: true });
  writeFileSync(SCHEMA_FILE, rendered);
  console.log(`wrote ${SCHEMA_FILE}`);
}
