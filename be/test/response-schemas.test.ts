/**
 * One guard over EVERY response schema in the API.
 *
 * `test/routes.test.ts` already checks the vault's own schemas (STE-11 check 4).
 * This file is the version that does not need updating when a router is added:
 * it collects the schemas from every route module and asserts the properties
 * that must hold across the whole surface.
 *
 * Fastify serialises strictly from these schemas — a field the schema does not
 * name cannot reach a client even if a future change starts putting it on the
 * object — so these are security controls, not documentation.
 */
import { describe, expect, it } from "vitest";
import { RESPONSE_SCHEMAS as DIRECTORY_SCHEMAS } from "../src/routes/directory.js";
import { RESPONSE_SCHEMAS as VAULT_SCHEMAS } from "../src/routes/participants.js";
import { RESPONSE_SCHEMAS as AUTH_SCHEMAS } from "../src/routes/auth.js";
import { RESPONSE_SCHEMAS as RESULTS_SCHEMAS } from "../src/routes/results.js";
import { RESPONSE_SCHEMAS as ROSTER_SCHEMAS } from "../src/routes/roster.js";

const ALL = {
  ...Object.fromEntries(Object.entries(VAULT_SCHEMAS).map(([k, v]) => [`participants.${k}`, v])),
  ...Object.fromEntries(Object.entries(DIRECTORY_SCHEMAS).map(([k, v]) => [`directory.${k}`, v])),
  ...Object.fromEntries(Object.entries(ROSTER_SCHEMAS).map(([k, v]) => [`roster.${k}`, v])),
  ...Object.fromEntries(Object.entries(RESULTS_SCHEMAS).map(([k, v]) => [`results.${k}`, v])),
  ...Object.fromEntries(Object.entries(AUTH_SCHEMAS).map(([k, v]) => [`auth.${k}`, v])),
};

/** Every property name the schema (or anything nested in it) can emit. */
function propertyNames(schema: unknown, into = new Set<string>()): Set<string> {
  if (typeof schema !== "object" || schema === null) return into;
  const node = schema as Record<string, unknown>;
  if (node.properties && typeof node.properties === "object") {
    for (const key of Object.keys(node.properties as Record<string, unknown>)) into.add(key);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((v) => propertyNames(v, into));
    else propertyNames(value, into);
  }
  return into;
}

describe("no response anywhere can carry PII", () => {
  it.each(Object.entries(ALL))("%s names no PII field", (_name, schema) => {
    const names = propertyNames(schema);
    for (const forbidden of [
      "name",
      "full_name",
      "national_id",
      "nik",
      "emergency_contact",
      "phone",
      "email",
      "date_of_birth",
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("has no schema named `name`, which is why the event's name is `event_name`", () => {
    // Stated as its own test because it looks like a style choice and is not:
    // one rule with no exceptions is checkable, and a rule with an allow-list
    // of "this `name` is fine" stops catching anything.
    const all = new Set<string>();
    for (const schema of Object.values(ALL)) propertyNames(schema, all);
    expect(all).not.toContain("name");
    expect(all).toContain("event_name");
  });
});

describe("every response object is closed", () => {
  it.each(Object.entries(ALL))("%s sets additionalProperties: false throughout", (_name, schema) => {
    const closed = (node: unknown): boolean => {
      if (typeof node !== "object" || node === null) return true;
      const obj = node as Record<string, unknown>;
      if (obj.type === "object" && obj.additionalProperties !== false) return false;
      return Object.values(obj).every((value) =>
        Array.isArray(value) ? value.every(closed) : closed(value),
      );
    };
    expect(closed(schema)).toBe(true);
  });
});

describe("secrets appear in exactly the two places they are meant to", () => {
  it("only the submit response and the roster bundle can carry a totp_secret", () => {
    const carriers = Object.entries(ALL)
      .filter(([, schema]) => propertyNames(schema).has("totp_secret"))
      .map(([name]) => name);
    expect(carriers.sort()).toEqual(["participants.submitResponse", "roster.rosterResponse"]);
  });

  it("only the submit response can carry a salt", () => {
    // The salt is shown to the runner once and never again — not even to a
    // scanner, who has no use for it.
    const carriers = Object.entries(ALL)
      .filter(([, schema]) => propertyNames(schema).has("salt"))
      .map(([name]) => name);
    expect(carriers).toEqual(["participants.submitResponse"]);
  });
});

describe("values that do not fit in a JSON number are strings", () => {
  /** Collect `{ property: declaredType }` for every leaf in a schema. */
  function typesByProperty(schema: unknown, into = new Map<string, unknown>()): Map<string, unknown> {
    if (typeof schema !== "object" || schema === null) return into;
    const node = schema as Record<string, unknown>;
    const properties = node.properties as Record<string, Record<string, unknown>> | undefined;
    if (properties) {
      for (const [key, value] of Object.entries(properties)) into.set(key, value.type);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((v) => typesByProperty(v, into));
      else typesByProperty(value, into);
    }
    return into;
  }

  it.each([
    "starts_at",
    "entered_at",
    "claimed_at",
    "result_at",
    "occurred_at",
    "price_stroops",
    "amountStroops",
  ])("declares %s as a string, never a number", (property) => {
    const types = new Map<string, unknown>();
    for (const schema of Object.values(ALL)) typesByProperty(schema, types);
    const declared = types.get(property);
    if (declared === undefined) return; // not part of this API surface
    const asArray = Array.isArray(declared) ? declared : [declared];
    // u64 timestamps and i128 stroops both exceed Number.MAX_SAFE_INTEGER, and
    // a JSON number is an IEEE double. One stroop of drift is a failed `enter`.
    expect(asArray).not.toContain("integer");
    expect(asArray).not.toContain("number");
    expect(asArray).toContain("string");
  });
});
