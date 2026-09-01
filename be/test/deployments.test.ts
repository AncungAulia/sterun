/**
 * The parser's job is to make docs/deployments.md the single source of truth
 * for addresses. These tests hold it to that in both directions: it must read
 * the real document correctly, and it must refuse anything ambiguous rather
 * than guess — a wrong address here would send real (testnet) money to the
 * wrong place, silently.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEPLOYMENTS_MD, loadDeployments, parseDeployments } from "../src/deployments.js";

const real = readFileSync(DEPLOYMENTS_MD, "utf8");

describe("parseDeployments — the committed document", () => {
  it("resolves all five addresses from docs/deployments.md", () => {
    // Not asserted against constants copied from the document: that would test
    // the copy, not the parse. These are the values STE-30 and STE-33 put
    // on-chain, and the point is that the parser recovers exactly them.
    expect(loadDeployments()).toEqual({
      susdIssuer: "GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW",
      susdDistributor: "GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO",
      susdSac: "CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU",
      eventRegistry: "CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64",
      raceRecord: "CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4",
    });
  });

  it("caches, so the server does not re-read the file per request", () => {
    expect(loadDeployments()).toBe(loadDeployments());
  });

  it("is not confused by the abbreviated addresses the prose uses", () => {
    // The document writes things like `CDL6A734…GTA64` in explanatory tables.
    // Those must never be mistaken for an address.
    expect(real).toContain("CDL6A734…GTA64");
    expect(loadDeployments().eventRegistry).toHaveLength(56);
  });
});

const MINIMAL = `
| Issuer (\`G...\`) | \`GCYJNYCUMUTLTOI7C2TPGSZBPBMTJU4UP4TW7JPDMOF4OB36I2PAFQCW\` |
| Distributor (\`G...\`) | \`GBDMKNY7GNUNF7WKUYKNW4HKCQJUHXXBXS7OSD2DSLKRIR5TI6EF3JPO\` |
| SAC contract address | \`CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU\` |
| **EventRegistry** (C1) | \`CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64\` |
| **RaceRecord** (C2) | \`CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4\` |
`;

describe("parseDeployments — refusing to guess", () => {
  it("accepts a minimal document with one row per address", () => {
    expect(parseDeployments(MINIMAL).susdSac).toBe(
      "CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU",
    );
  });

  it("fails when an address is missing entirely, naming what it wanted", () => {
    const doc = MINIMAL.split("\n").filter((l) => !l.includes("RaceRecord")).join("\n");
    expect(() => parseDeployments(doc, "test.md")).toThrow(/RaceRecord contract/);
    expect(() => parseDeployments(doc, "test.md")).toThrow(/do not hardcode/);
  });

  it("fails when two tables disagree — the drift this parser exists to catch", () => {
    const doc =
      MINIMAL +
      "| **RaceRecord** (stale copy) | `CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64` |\n";
    expect(() => parseDeployments(doc, "test.md")).toThrow(/inconsistent across the document/);
  });

  it("fails on a well-shaped but invalid strkey instead of passing it on", () => {
    // Right prefix, right length, wrong checksum — exactly the corruption a
    // hand-edit produces, and exactly what a regex alone would let through.
    const broken = MINIMAL.replace(
      "CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU",
      "CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOZ",
    );
    expect(() => parseDeployments(broken, "test.md")).toThrow(/not a valid contract address/);
  });

  it("ignores a contract-shaped token on a row it was not asked about", () => {
    const doc = MINIMAL + "| Some other note | CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4 |\n";
    expect(parseDeployments(doc, "test.md").raceRecord).toBe(
      "CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4",
    );
  });

  it("reports an unreadable file as a repo-layout problem, not ENOENT", () => {
    expect(() => loadDeployments("/nonexistent/deployments.md")).toThrow(/run it from a checkout/);
  });
});
