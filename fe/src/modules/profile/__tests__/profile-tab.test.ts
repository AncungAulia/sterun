import { describe, expect, it } from "vitest";

import { parseProfileTab, profileTabHref, profileTabs } from "../lib/profile-tab";

describe("profile tabs", () => {
  describe("positive", () => {
    it("opens on the entries, which is what a runner comes back for", () => {
      expect(parseProfileTab(undefined, true)).toBe("entries");
    });

    it("reads a section out of the address, so a tab can be linked to", () => {
      expect(parseProfileTab("record", true)).toBe("record");
      expect(parseProfileTab("faucet", true)).toBe("faucet");
    });

    it("leaves the default section out of the address", () => {
      expect(profileTabHref("entries")).toBe("/profile");
      expect(profileTabHref("record")).toBe("/profile?tab=record");
    });
  });

  describe("negative", () => {
    it("drops test money off testnet rather than drawing a dead tab", () => {
      expect(profileTabs(false).map((tab) => tab.id)).toEqual(["entries", "record"]);
      expect(profileTabs(true).map((tab) => tab.id)).toEqual(["entries", "record", "faucet"]);
    });

    it("lands a testnet link to the faucet on a section that exists", () => {
      // Written down while Sterun was on testnet, opened after the move.
      expect(parseProfileTab("faucet", false)).toBe("entries");
    });

    it("ignores a section that never existed, and a repeated parameter", () => {
      expect(parseProfileTab("settings", true)).toBe("entries");
      expect(parseProfileTab(["record", "faucet"], true)).toBe("record");
    });
  });
});
