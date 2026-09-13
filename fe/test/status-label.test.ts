import { describe, expect, it } from "vitest";

import { statusLabel } from "@/lib/status-label";
import { EVENT_STATUSES } from "@sterunxyz/sdk";

describe("statusLabel", () => {
  describe("positive", () => {
    it("renames Draft to something a runner can read", () => {
      // "Draft" is a word about documents. A race is not a document, and the
      // organiser reading this has not drafted anything — the race exists, its
      // entries are simply not open.
      expect(statusLabel("Draft")).toBe("Not open yet");
    });

    it("leaves the four statuses that already read plainly", () => {
      expect(statusLabel("Open")).toBe("Open for entry");
      expect(statusLabel("Closed")).toBe("Entries closed");
      expect(statusLabel("Completed")).toBe("Finished");
      expect(statusLabel("Cancelled")).toBe("Cancelled");
    });
  });

  describe("edge", () => {
    it("has a label for every status the contract can hold", () => {
      // Walks the SDK rather than a list written here, so a sixth status would
      // fail this test instead of rendering an empty chip on a real event.
      for (const status of EVENT_STATUSES) {
        expect(statusLabel(status)).not.toBe("");
      }
    });

    it("never says the word Draft", () => {
      for (const status of EVENT_STATUSES) {
        expect(statusLabel(status)).not.toMatch(/draft/i);
      }
    });
  });
});
