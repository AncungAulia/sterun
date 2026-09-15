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

    it("falls back for a revert there is nothing useful to say about", () => {
      // InvalidDistance (#10) is a bug in this app, not something an organiser
      // can act on. Naming the variant would only be technical wording.
      expect(friendlyError(revert(10))).toBe(SOMETHING_WENT_WRONG);
    });

    it("says nothing confident about a revert from a call that is not only ours", () => {
      // The whole point of the method check. `enter` hands control to the sUSD
      // token contract, whose own errors are numbered in the same 1..=99 band,
      // so #5 out of that call is as likely to be the token refusing to move
      // money as it is EventRegistry's QuotaFull. A wrong sentence about a full
      // distance would send the organiser looking in the wrong place.
      expect(friendlyError(revert(5, "enter"))).toBe(SOMETHING_WENT_WRONG);
      expect(friendlyError(revert(18, "enter"))).toBe(SOMETHING_WENT_WRONG);
      expect(friendlyError(revert(10, "claimRacepack"))).toBe(SOMETHING_WENT_WRONG);
    });

    it("never reads a bare host string as one of our reverts", () => {
      // Nothing decoded it, so nothing knows which contract it came from. Only
      // an error the SDK produced for one of our own calls carries that.
      expect(friendlyError(new Error("HostError: Error(Contract, #18)"))).toBe(
        SOMETHING_WENT_WRONG,
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

    it("reads the nested shape Stellar Wallets Kit rejects with", () => {
      // The kit passes the wallet's own object through, and its own parseError
      // reads `e?.error?.message` before `e?.message`. Reading only the outer
      // one left an empty string here, so a declined prompt came out as the
      // generic failure sentence, which reads as something being broken.
      expect(friendlyError({ error: { code: -4, message: "User declined access" } })).toBe(
        "You declined this in your wallet. Nothing was sent.",
      );
    });

    it("still says nothing it cannot back up for a nested error that is not a refusal", () => {
      expect(friendlyError({ error: { code: -1, message: "Internal wallet error" } })).toBe(
        SOMETHING_WENT_WRONG,
      );
    });

    it("prefers the nested message over an outer one, as the kit does", () => {
      expect(
        friendlyError({
          message: "Unhandled error from the wallet",
          error: { code: -4, message: "User rejected the request" },
        }),
      ).toMatch(/you declined this/i);
    });

    it("says when there is not enough to pay with", () => {
      expect(friendlyError(new SterunNetworkError("tx failed: insufficient balance", "enter"))).toBe(
        "Your wallet does not have enough funds for this.",
      );
    });
  });

  describe("what it says when it does not know whether the step happened", () => {
    it("warns that a step with no answer may already have gone through", () => {
      // The button under this sentence repeats the step, and the first step
      // publishes a race that can never be deleted.
      const message = friendlyError(
        new SterunNetworkError(
          "createEvent was submitted but the RPC returned no transaction hash, so there is " +
            "nothing to point at as evidence",
          "createEvent",
        ),
      );

      expect(message).toMatch(/may already have gone through/i);
      expect(message).toMatch(/check your races/i);
      expect(message).not.toMatch(/transaction|hash|RPC/i);
    });

    it("says the same when the wait for the result ran out", () => {
      expect(
        friendlyError(
          new SterunNetworkError(
            "createEvent could not be simulated: Waited 30 seconds for transaction to complete, " +
              "but it did not. Returning anyway. Check the transaction status manually.",
            "createEvent",
          ),
        ),
      ).toMatch(/may already have gone through/i);
    });

    it("says the same when it was sent but never awaited", () => {
      expect(
        friendlyError(
          new Error(
            "Transaction was sent to the network, but not yet awaited. No result to show.",
          ),
        ),
      ).toMatch(/may already have gone through/i);
    });

    it("never promises nothing was sent over a cancellation that came after submitting", () => {
      // "Nothing was sent" rests on a word match, and a reader told that would
      // stop looking for a race that exists.
      const message = friendlyError(new Error("Submitted, then cancelled while pending"));

      expect(message).not.toMatch(/nothing was sent/i);
      expect(message).toMatch(/may already have gone through/i);
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
