/**
 * The one mapping from a thrown thing to a sentence on screen.
 *
 * Worth its own file because the failures it covers are the ones nobody can
 * reproduce on demand: a wallet refusal, a revert from a contract, a store that
 * is down. Testing the mapping directly is how those sentences get checked at
 * all.
 */
import { SterunContractError, SterunNetworkError, classifyContractError } from "@sterunxyz/sdk";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { SOMETHING_WENT_WRONG, friendlyError } from "@/lib/errors";
import { PlainError } from "@/lib/plain-error";

/** A revert as the SDK hands one over. */
function revert(code: number, method = "createEvent"): SterunContractError {
  return new SterunContractError(
    classifyContractError(code),
    method,
    `HostError: Error(Contract, #${code})`,
  );
}

describe("friendlyError", () => {
  describe("what it says about a contract refusing", () => {
    it("tells an organiser their wallet is not allowed to publish yet", () => {
      // NotAllowlistedOrganiser (#18). The way out is a message to the team,
      // not a retry, so it cannot read as a generic failure.
      expect(friendlyError(revert(18))).toMatch(/cannot publish races yet/i);
      expect(friendlyError(revert(18))).toMatch(/Sterun team/i);
    });

    it("says a distance is full rather than naming a quota", () => {
      expect(friendlyError(revert(5, "enter"))).toBe("This distance is full. There are no places left.");
    });

    it("says an item has sold out", () => {
      expect(friendlyError(revert(15, "enter"))).toBe("That item has sold out.");
    });

    it("says a race is not open for entries", () => {
      expect(friendlyError(revert(4, "enter"))).toBe("This race is not open for entries.");
    });

    it("falls back for a revert there is nothing useful to say about", () => {
      // InvalidDistance (#10) is a bug in this app, not something an organiser
      // can act on. Naming the variant would only be technical wording.
      expect(friendlyError(revert(10))).toBe(SOMETHING_WENT_WRONG);
    });

    it("reads the code out of a host error that never reached the SDK", () => {
      // A revert can surface as an ordinary error still carrying the host
      // string, and it is the same refusal however it arrived.
      expect(friendlyError(new Error("HostError: Error(Contract, #18)"))).toMatch(
        /cannot publish races yet/i,
      );
    });

    it("never reads a plain number in prose as a revert", () => {
      expect(friendlyError(new Error("failed after 18 attempts"))).toBe(SOMETHING_WENT_WRONG);
    });

    it("does not confuse the two contracts that share a variant name", () => {
      // Both enums own a NotInitialized, at 1 and at 100, and neither has a
      // message here. Matching on the name alone would conflate them.
      expect(friendlyError(revert(1))).toBe(SOMETHING_WENT_WRONG);
      expect(friendlyError(revert(100))).toBe(SOMETHING_WENT_WRONG);
    });
  });

  describe("what it says about the wallet", () => {
    it("treats a declined prompt as a cancellation, not a failure", () => {
      expect(friendlyError(new Error("User declined access"))).toBe(
        "You declined this in your wallet. Nothing was sent.",
      );
    });

    it("recognises the other words wallets use for the same thing", () => {
      for (const said of [
        "User rejected the request",
        "Request cancelled by the user",
        "Permission denied",
      ]) {
        expect(friendlyError(new Error(said))).toMatch(/you declined this/i);
      }
    });

    it("reads a wallet error that is a bare object rather than an Error", () => {
      expect(friendlyError({ code: -4, message: "User declined access" })).toMatch(
        /you declined this/i,
      );
    });

    it("says when there is not enough to pay with", () => {
      expect(friendlyError(new SterunNetworkError("tx failed: insufficient balance", "enter"))).toBe(
        "Your wallet does not have enough funds for this.",
      );
    });
  });

  describe("what it passes through", () => {
    it("keeps a sentence this app wrote for the screen", () => {
      expect(friendlyError(new PlainError("Your race details were uploaded but could not be checked."))).toBe(
        "Your race details were uploaded but could not be checked.",
      );
    });

    it("keeps what the backend helper already turned into plain words", () => {
      // lib/api.ts never passes the server's own text on, so what an ApiError
      // carries is already written for a reader.
      expect(friendlyError(new ApiError(503, "http-error", "Something went wrong on our side."))).toBe(
        "Something went wrong on our side.",
      );
    });

    it("still has something to say when one of ours arrives empty", () => {
      expect(friendlyError(new PlainError(""))).toBe(SOMETHING_WENT_WRONG);
    });
  });

  describe("what it refuses to show", () => {
    it("hides the SDK's own wording, which is written for a log", () => {
      const message = friendlyError(new SterunNetworkError("createEvent could not be simulated: fetch failed", "createEvent"));

      expect(message).toBe(SOMETHING_WENT_WRONG);
      expect(message).not.toMatch(/simulated|createEvent/);
    });

    it("hides a raw network failure", () => {
      expect(friendlyError(new TypeError("Failed to fetch"))).toBe(SOMETHING_WENT_WRONG);
    });

    it("says something for a thrown value that is not an error at all", () => {
      expect(friendlyError(undefined)).toBe(SOMETHING_WENT_WRONG);
      expect(friendlyError(null)).toBe(SOMETHING_WENT_WRONG);
      expect(friendlyError("boom")).toBe(SOMETHING_WENT_WRONG);
      expect(friendlyError({})).toBe(SOMETHING_WENT_WRONG);
    });
  });
});
