import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONTRACTS } from "@/lib/env";
import { readClient } from "@/lib/sterun";

describe("readClient", () => {
  describe("positive", () => {
    it("points at the contracts configured for this deployment", () => {
      expect(readClient.contracts).toEqual({
        eventRegistry: CONTRACTS.eventRegistry,
        raceRecord: CONTRACTS.raceRecord,
      });
    });

    it("exposes the registry reads the directory is built on", () => {
      expect(typeof readClient.eventCount).toBe("function");
      expect(typeof readClient.getEvent).toBe("function");
      expect(typeof readClient.listCategories).toBe("function");
    });
  });

  describe("negative", () => {
    it("never pulls the wallet into the public read path", () => {
      // Every public page reads through this module. Wiring a signer in here
      // would make the directory ask a visitor to connect a wallet before it
      // would show them a race, which is the opposite of the point.
      const source = readFileSync(join(import.meta.dirname, "..", "src/lib/sterun.ts"), "utf8");
      // Comments stripped: the rule is about what the module does, and the
      // comment above the client explains precisely why it does not do this.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

      expect(code).not.toContain("./wallet");
      expect(code).not.toContain("signTransaction");
      expect(code).not.toContain("publicKey");
    });
  });
});
