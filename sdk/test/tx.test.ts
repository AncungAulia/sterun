/**
 * STE-15 — the read/write pipeline, driven entirely by fakes.
 *
 * `AssembledLike` is a structural seam, so these tests replace the network with
 * plain objects and still exercise the real `runRead`/`runWrite`. That matters
 * because the interesting half of this module is the failure half — a revert
 * mid-flight, a signer that is not there, a transaction that never lands — and
 * every one of those is expensive, slow or impossible to provoke on demand
 * against a live testnet. Here they are three lines each, and they run in
 * typescript.yml, which must never go red because testnet had a bad afternoon.
 *
 * The live counterpart is scripts/e2e.ts, which proves the same code path
 * against the real contracts. Fakes prove the branches; the e2e proves the
 * fakes were not lying about the shape.
 */
import { describe, expect, it, vi } from "vitest";
import {
  SterunContractError,
  SterunNetworkError,
  SterunSignerError,
} from "../src/errors.js";
import { runRead, runWrite, simulationError, type AssembledLike } from "../src/tx.js";

/** The bindings' `Result`, in the two shapes it actually takes. */
const ok = <T>(value: T) => ({ unwrap: () => value, isErr: () => false });
const err = <T>() => ({
  unwrap: (): T => {
    throw new Error("unwrap on Err");
  },
  isErr: () => true,
});

/** A simulation that succeeded. The SDK's success response carries no `error`. */
const simulated = { transactionData: {}, result: {} };

function assembled<T>(overrides: Partial<AssembledLike<T>> = {}): AssembledLike<T> {
  return {
    simulation: simulated,
    result: undefined as T,
    signAndSend: async () => ({
      result: undefined as T,
      sendTransactionResponse: { hash: "abc123" },
      getTransactionResponse: { txHash: "abc123", ledger: 42 },
    }),
    ...overrides,
  };
}

describe("simulationError", () => {
  it("finds the error on a failed simulation and nothing on a successful one", () => {
    expect(simulationError({ error: "HostError: Error(Contract, #5)" })).toBe(
      "HostError: Error(Contract, #5)",
    );
    expect(simulationError(simulated)).toBeUndefined();
  });

  it("treats absent, empty and non-object simulations as no error", () => {
    // An empty string is the case worth naming: `if (tx.simulation.error)` and
    // `if ("error" in tx.simulation)` disagree about it, and the second is
    // wrong — an empty message is not a revert anybody can act on.
    expect(simulationError({ error: "" })).toBeUndefined();
    expect(simulationError(undefined)).toBeUndefined();
    expect(simulationError(null)).toBeUndefined();
    expect(simulationError("nope")).toBeUndefined();
    expect(simulationError({ error: 500 })).toBeUndefined();
  });
});

describe("runRead", () => {
  it("returns a plain value untouched", async () => {
    await expect(runRead("totalSupply", async () => assembled({ result: 4 }))).resolves.toBe(4);
  });

  it("unwraps a Result", async () => {
    await expect(runRead("getEvent", async () => assembled({ result: ok("event") }))).resolves.toBe(
      "event",
    );
  });

  it("turns a revert into a typed error with the band decoded", async () => {
    const promise = runRead("getEvent", async () =>
      assembled({ simulation: { error: "HostError: Error(Contract, #2)" } }),
    );
    await expect(promise).rejects.toBeInstanceOf(SterunContractError);
    await expect(promise).rejects.toMatchObject({
      code: 2,
      source: "event-registry",
      variant: "EventNotFound",
      method: "getEvent",
    });
  });

  it("never reports a transport failure as a contract revert", async () => {
    // The distinction the caller acts on: a revert is an answer and retrying
    // gives the same one; a network failure is the absence of an answer.
    const promise = runRead("getEvent", async () =>
      assembled({ simulation: { error: "socket hang up" } }),
    );
    await expect(promise).rejects.toBeInstanceOf(SterunNetworkError);
    await expect(promise).rejects.not.toBeInstanceOf(SterunContractError);
  });

  it("decodes a revert that arrives as a throw from building, not as a field", async () => {
    // Building an AssembledTransaction simulates, so some failures surface as
    // exceptions instead of a populated `simulation.error`.
    const promise = runRead("recordOf", async () => {
      throw new Error("HostError: Error(Contract, #101)");
    });
    await expect(promise).rejects.toMatchObject({ variant: "RecordNotFound", code: 101 });
  });

  it("checks the simulation before it looks at the result", async () => {
    // The live bindings return BOTH a failed simulation and an Err result. If
    // the order were reversed the caller would get "inconsistent RPC response"
    // instead of RecordNotFound — a true statement that helps nobody.
    const promise = runRead("recordOf", async () =>
      assembled({
        simulation: { error: "HostError: Error(Contract, #101)" },
        result: err(),
      }),
    );
    await expect(promise).rejects.toMatchObject({ variant: "RecordNotFound" });
  });

  it("refuses to hand back an Err as if it were a value", async () => {
    const promise = runRead("recordOf", async () => assembled({ result: err() }));
    await expect(promise).rejects.toBeInstanceOf(SterunNetworkError);
    await expect(promise).rejects.toThrow(/inconsistent/);
  });
});

describe("runWrite", () => {
  it("signs, sends, and reports the value with its transaction hash", async () => {
    const result = await runWrite("createEvent", async () =>
      assembled({
        result: ok(7),
        signAndSend: async () => ({
          result: ok(7),
          sendTransactionResponse: { hash: "deadbeef" },
          getTransactionResponse: { txHash: "deadbeef", ledger: 991 },
        }),
      }),
    );
    expect(result).toEqual({ value: 7, txHash: "deadbeef", ledger: 991 });
  });

  it("falls back to the send hash when the ledger is not reported yet", async () => {
    const result = await runWrite("addCategory", async () =>
      assembled({
        result: ok(0),
        signAndSend: async () => ({ result: ok(0), sendTransactionResponse: { hash: "f00d" } }),
      }),
    );
    expect(result).toEqual({ value: 0, txHash: "f00d", ledger: null });
  });

  it("never signs a call that is already going to revert", async () => {
    // A wallet prompt the user can only reject is a bad prompt. Simulation is
    // checked first, so QuotaFull costs no signature at all.
    const signAndSend = vi.fn();
    const promise = runWrite("enter", async () =>
      assembled({
        simulation: { error: "HostError: Error(Contract, #5)" },
        signAndSend,
      }),
    );
    await expect(promise).rejects.toMatchObject({ variant: "QuotaFull", source: "event-registry" });
    expect(signAndSend).not.toHaveBeenCalled();
  });

  it("decodes a revert that only happens after a clean simulation", async () => {
    // Between simulating and landing, somebody else can take the last slot.
    // QuotaFull has to mean QuotaFull whichever half of the call produced it.
    const promise = runWrite("enter", async () =>
      assembled({
        signAndSend: async () => {
          throw new Error("HostError: Error(Contract, #5)");
        },
      }),
    );
    await expect(promise).rejects.toMatchObject({ variant: "QuotaFull", code: 5 });
  });

  it("reports a missing signer as a missing signer, not as a chain failure", async () => {
    const promise = runWrite("enter", async () =>
      assembled({
        signAndSend: async () => {
          throw new Error("NoSignerError: You must provide a signTransaction function");
        },
      }),
    );
    await expect(promise).rejects.toBeInstanceOf(SterunSignerError);
    await expect(promise).rejects.toThrow(/Keypair in Node|wallet's signTransaction/);
  });

  it("still decodes a revert whose message happens to mention signTransaction", async () => {
    // The signer heuristic reads a message, so it must not swallow a real
    // revert that mentions the same word.
    const promise = runWrite("enter", async () =>
      assembled({
        signAndSend: async () => {
          throw new Error("signTransaction failed: HostError: Error(Contract, #102)");
        },
      }),
    );
    await expect(promise).rejects.toBeInstanceOf(SterunContractError);
    await expect(promise).rejects.toMatchObject({ variant: "AlreadyClaimed" });
  });

  it("passes a per-call signer through to signAndSend", async () => {
    const signAndSend = vi.fn(async () => ({
      result: ok(1),
      getTransactionResponse: { txHash: "h", ledger: 1 },
    }));
    const signer = { address: "G…", signTransaction: async () => ({ signedTxXdr: "" }) };
    await runWrite("enter", async () => assembled({ result: ok(1), signAndSend }), {
      signTransaction: signer,
    });
    expect(signAndSend).toHaveBeenCalledWith({ signTransaction: signer });
  });

  it("passes no signer option at all when none was given, so the client's own is used", async () => {
    const signAndSend = vi.fn(async () => ({
      result: ok(1),
      getTransactionResponse: { txHash: "h", ledger: 1 },
    }));
    await runWrite("enter", async () => assembled({ result: ok(1), signAndSend }));
    expect(signAndSend).toHaveBeenCalledWith({});
  });

  it("refuses to report success without a transaction hash to point at", async () => {
    // "It worked" with no hash is unverifiable, and docs/deployments.md is
    // built out of hashes.
    const promise = runWrite("enter", async () =>
      assembled({ result: ok(1), signAndSend: async () => ({ result: ok(1) }) }),
    );
    await expect(promise).rejects.toBeInstanceOf(SterunNetworkError);
    await expect(promise).rejects.toThrow(/no transaction hash/);
  });

  it("decodes a revert carried by the SentTransaction result getter", async () => {
    const promise = runWrite("recordFinish", async () =>
      assembled({
        signAndSend: async () => ({
          get result(): never {
            throw new Error("HostError: Error(Contract, #103)");
          },
          getTransactionResponse: { txHash: "h", ledger: 1 },
        }),
      }),
    );
    await expect(promise).rejects.toMatchObject({ variant: "InvalidState", source: "race-record" });
  });
});
