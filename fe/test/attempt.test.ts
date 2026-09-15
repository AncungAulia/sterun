/**
 * Sign and pay as a reducer: details first, payment second, retries that never
 * resend details, and no answer turned into a check.
 */
import { describe, expect, it } from "vitest";

import {
  INITIAL_ATTEMPT,
  attemptReducer,
  nextStep,
  type AttemptEvent,
  type AttemptState,
} from "@/modules/entry/attempt";
import type { EnterFailure } from "@/modules/entry/enter-failure";

const submitted = {
  participantId: "p",
  participantHash: "a".repeat(64),
  salt: "b".repeat(64),
  totpSecret: "c".repeat(64),
};

const run = (...events: AttemptEvent[]): AttemptState => events.reduce(attemptReducer, INITIAL_ATTEMPT);

describe("the happy path", () => {
  it("asks for identity first", () => {
    const state = run({ type: "start" });
    expect(state).toEqual({ phase: "confirming-identity" });
    expect(nextStep(state)).toBe("submit");
  });

  it("pays with what the vault returned", () => {
    const state = run({ type: "start" }, { type: "submitted", submitted });
    expect(state).toEqual({ phase: "paying", submitted });
    expect(nextStep(state)).toBe("enter");
  });

  it("ends entered with the token", () => {
    const state = run({ type: "start" }, { type: "submitted", submitted }, { type: "entered", tokenId: 7 });
    expect(state).toEqual({ phase: "entered", tokenId: 7 });
    expect(nextStep(state)).toBeNull();
  });
});

describe("the identity step stops", () => {
  it("a decline sends nothing, and trying again repeats only that step", () => {
    const failed = run({ type: "start" }, { type: "submit-failed", message: "x", declined: true });
    expect(failed).toEqual({ phase: "failed", submitted: null, failure: { kind: "declined" } });
    expect(nextStep(attemptReducer(failed, { type: "start" }))).toBe("submit");
  });

  it("a vault refusal keeps its sentence", () => {
    const failed = run(
      { type: "start" },
      { type: "submit-failed", message: "Check your date of birth.", declined: false },
    );
    expect(failed).toEqual({
      phase: "failed",
      submitted: null,
      failure: { kind: "submit-failed", message: "Check your date of birth." },
    });
  });
});

describe("the payment step stops", () => {
  const paying = run({ type: "start" }, { type: "submitted", submitted });

  it("a decline keeps the details already sent, so trying again only pays", () => {
    const failed = attemptReducer(paying, { type: "enter-failed", failure: { kind: "declined" } });
    const retried = attemptReducer(failed, { type: "start" });
    expect(retried).toEqual({ phase: "paying", submitted });
    expect(nextStep(retried)).toBe("enter");
  });

  it.each<[EnterFailure]>([
    [{ kind: "sold-out" }],
    [{ kind: "closed" }],
    [{ kind: "short", needed: 5n }],
    [{ kind: "add-on-sold-out", names: ["Towel"] }],
    [{ kind: "other", message: "Something went wrong. Please try again." }],
  ])("%o is a failure that keeps the details", (failure) => {
    expect(attemptReducer(paying, { type: "enter-failed", failure })).toEqual({
      phase: "failed",
      submitted,
      failure,
    });
  });

  it("sends details again only after they change", () => {
    const failed = attemptReducer(paying, { type: "enter-failed", failure: { kind: "sold-out" } });
    const edited = attemptReducer(failed, { type: "details-changed" });
    expect(edited).toEqual({ phase: "ready", submitted: null });
    expect(nextStep(attemptReducer(edited, { type: "start" }))).toBe("submit");
  });

  it("no answer becomes a check, never a failure", () => {
    const checking = attemptReducer(paying, { type: "enter-failed", failure: { kind: "no-answer" } });
    expect(checking).toEqual({ phase: "checking", submitted });
    expect(nextStep(checking)).toBe("check");
  });
});

describe("the check", () => {
  const checking: AttemptState = { phase: "checking", submitted };

  it("found means entered", () => {
    expect(attemptReducer(checking, { type: "found", tokenId: 3 })).toEqual({ phase: "entered", tokenId: 3 });
  });

  it("not found means it did not go through, and nothing was charged", () => {
    expect(attemptReducer(checking, { type: "not-found" })).toEqual({ phase: "not-through", submitted });
  });

  it("a failed read is its own state", () => {
    expect(attemptReducer(checking, { type: "check-error" })).toEqual({ phase: "check-failed", submitted });
  });

  it("check again checks, without paying", () => {
    const again = attemptReducer({ phase: "check-failed", submitted }, { type: "check-again" });
    expect(again).toEqual(checking);
    expect(nextStep(again)).toBe("check");
  });

  it("paying cannot start from a failed check, so nobody pays twice by accident", () => {
    const failed: AttemptState = { phase: "check-failed", submitted };
    expect(attemptReducer(failed, { type: "start" })).toBe(failed);
  });

  it("pays again from not-through with the same details", () => {
    expect(attemptReducer({ phase: "not-through", submitted }, { type: "start" })).toEqual({
      phase: "paying",
      submitted,
    });
  });
});

describe("events that do not belong", () => {
  it("are ignored, returning the same state", () => {
    expect(attemptReducer(INITIAL_ATTEMPT, { type: "entered", tokenId: 1 })).toBe(INITIAL_ATTEMPT);
    expect(attemptReducer(INITIAL_ATTEMPT, { type: "found", tokenId: 1 })).toBe(INITIAL_ATTEMPT);

    const entered: AttemptState = { phase: "entered", tokenId: 1 };
    expect(attemptReducer(entered, { type: "start" })).toBe(entered);
    expect(attemptReducer(entered, { type: "details-changed" })).toBe(entered);

    const identity: AttemptState = { phase: "confirming-identity" };
    expect(attemptReducer(identity, { type: "start" })).toBe(identity);
  });

  it("there is no step to run while idle, failed or finished", () => {
    expect(nextStep(INITIAL_ATTEMPT)).toBeNull();
    expect(nextStep({ phase: "failed", submitted: null, failure: { kind: "declined" } })).toBeNull();
    expect(nextStep({ phase: "not-through", submitted })).toBeNull();
  });
});
