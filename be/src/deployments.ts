/**
 * STE-6 — read the Stellar addresses out of `docs/deployments.md`.
 *
 * The addresses are NOT hardcoded here, and that is the requirement, not a
 * style preference. `docs/deployments.md` is the repo's deploy evidence
 * (working agreement point 8): it is what a reviewer clicks through, what
 * STE-30 and STE-33 wrote, and what a redeploy edits. If the backend kept its
 * own copy, the two would drift and the document would quietly stop being the
 * source of truth — which is the whole point of having it.
 *
 * So this module parses that document. That sounds fragile, and it would be if
 * it grepped loosely; instead every address is:
 *
 *   1. matched by a label that is part of the document's meaning, not its
 *      formatting (the row label, not the row number);
 *   2. validated as a real strkey with the SDK, so a truncated or prose-wrapped
 *      value fails loudly rather than reaching the network;
 *   3. cross-checked across every row that mentions it — the SAC address, for
 *      example, appears in three separate tables, and all three must agree.
 *
 * That third check is worth more than it costs: it turns this parser into a
 * consistency test over the evidence document itself. A hand-edit that updates
 * one table and forgets another fails here, in `pnpm test`, instead of at a
 * live invocation.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StrKey } from "@stellar/stellar-sdk";

/** Repo root, from this file's location — works from src/ and from dist/. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEPLOYMENTS_MD = join(REPO_ROOT, "docs", "deployments.md");

export interface Deployments {
  /** sUSD issuer account (`G…`). Needed to build the classic `changeTrust` op. */
  susdIssuer: string;
  /** Holder of the initial supply (`G…`). The faucet pays out from here. */
  susdDistributor: string;
  /** SEP-41 contract for sUSD (`C…`). What RaceRecord calls to move the fee. */
  susdSac: string;
  /** EventRegistry contract (`C…`), STE-33. */
  eventRegistry: string;
  /** RaceRecord contract (`C…`), STE-33. */
  raceRecord: string;
}

type Kind = "account" | "contract";

/**
 * How each field is found. `label` matches the start of a Markdown table row
 * (after the leading pipe); every matching row must yield the same address.
 */
const FIELDS: Record<keyof Deployments, { label: RegExp; kind: Kind; human: string }> = {
  susdIssuer: { label: /^\|\s*(?:\*\*)?Issuer\b/i, kind: "account", human: "sUSD issuer" },
  susdDistributor: {
    label: /^\|\s*(?:\*\*)?Distributor\b/i,
    kind: "account",
    human: "sUSD distributor",
  },
  susdSac: { label: /^\|\s*(?:\*\*)?SAC\b/i, kind: "contract", human: "sUSD SAC" },
  eventRegistry: {
    label: /^\|\s*\*\*EventRegistry\*\*/,
    kind: "contract",
    human: "EventRegistry contract",
  },
  raceRecord: {
    label: /^\|\s*\*\*RaceRecord\*\*/,
    kind: "contract",
    human: "RaceRecord contract",
  },
};

const isValid = (kind: Kind, value: string): boolean =>
  kind === "account" ? StrKey.isValidEd25519PublicKey(value) : StrKey.isValidContract(value);

/** Strkey-shaped tokens on a line, in order. Backticks are the usual wrapper. */
function candidates(line: string, kind: Kind): string[] {
  const prefix = kind === "account" ? "G" : "C";
  return [...line.matchAll(new RegExp(`\\b${prefix}[A-Z2-7]{55}\\b`, "g"))].map((m) => m[0]);
}

export function parseDeployments(markdown: string, source = DEPLOYMENTS_MD): Deployments {
  const lines = markdown.split("\n");
  const out: Partial<Deployments> = {};

  for (const [key, spec] of Object.entries(FIELDS) as [keyof Deployments, (typeof FIELDS)[keyof Deployments]][]) {
    const found = new Set<string>();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!spec.label.test(trimmed)) continue;
      for (const c of candidates(trimmed, spec.kind)) {
        if (!isValid(spec.kind, c)) {
          throw new Error(
            `${source}: ${spec.human} row contains "${c}", which is not a valid ${spec.kind} address`,
          );
        }
        found.add(c);
      }
    }
    if (found.size === 0) {
      throw new Error(
        `${source}: no ${spec.human} address found. Expected a table row labelled like ` +
          `${spec.label} carrying a ${spec.kind} address. If the deploy has not happened yet, ` +
          `do the deploy — do not hardcode an address here.`,
      );
    }
    if (found.size > 1) {
      throw new Error(
        `${source}: ${spec.human} is inconsistent across the document — found ${[...found]
          .map((f) => `"${f}"`)
          .join(" and ")}. One of the tables was updated and another was not; fix the document.`,
      );
    }
    out[key] = [...found][0]!;
  }

  return out as Deployments;
}

let cached: Deployments | undefined;

/** Parsed once per process; the file does not change while the server runs. */
export function loadDeployments(path = DEPLOYMENTS_MD): Deployments {
  if (path === DEPLOYMENTS_MD && cached) return cached;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(
      `cannot read ${path}: ${(e as Error).message}. The backend reads its Stellar addresses ` +
        `from the repo's deploy evidence; run it from a checkout, not from a bare dist/ copy.`,
      { cause: e },
    );
  }
  const parsed = parseDeployments(raw, path);
  if (path === DEPLOYMENTS_MD) cached = parsed;
  return parsed;
}
