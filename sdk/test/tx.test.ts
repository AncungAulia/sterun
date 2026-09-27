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
import { readFileSync } from "node:fs";
import { rpc } from "@stellar/stellar-sdk";
import {
  ledgerFailureCode,
  runRead,
  runWrite,
  simulationError,
  type AssembledLike,
} from "../src/tx.js";

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

  it("sends what it simulated, without swapping the signer in at the last moment", async () => {
    // The signer is supplied when the transaction is assembled, which is also
    // what makes the simulation run as the right account and record that
    // account's auth entries. Handing a different signer to signAndSend would
    // sign something other than what was simulated, so nothing is passed here.
    const signAndSend = vi.fn(async () => ({
      result: ok(1),
      getTransactionResponse: { txHash: "h", ledger: 1 },
    }));
    await runWrite("enter", async () => assembled({ result: ok(1), signAndSend }));
    expect(signAndSend).toHaveBeenCalledWith();
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

/**
 * STE-61 — a write that simulated cleanly and then failed on the ledger.
 *
 * The fixture is the real `getTransaction` response for the losing desk in the
 * STE-25 rehearsal (run 2): two scanner desks claimed one runner's race pack in
 * the same ledger, the chain kept one claim, and this transaction FAILED with
 * `AlreadyClaimed` (#102). It goes through stellar-sdk's own RPC parser — only
 * the HTTP request is replaced — so the shape tested here is the shape
 * `SentTransaction` really hands `runWrite`.
 */
describe("a transaction that failed on the ledger (STE-61)", () => {
  const raw = JSON.parse(
    readFileSync(new URL("./fixtures/failed-claim-already-claimed.rpc.json", import.meta.url), "utf8"),
  ).result as { txHash: string; ledger: number };

  /** The fixture, parsed exactly the way SentTransaction's poll parses it. */
  async function parsedResponse() {
    const server = new rpc.Server("https://soroban-testnet.stellar.org");
    (server as unknown as { _getTransaction: () => Promise<unknown> })._getTransaction = async () => raw;
    return server.getTransaction(raw.txHash);
  }

  /** A SentTransaction for that response, with stellar-sdk 17's crashing `result` getter. */
  async function failedSend(resultGetter = vi.fn()) {
    const response = await parsedResponse();
    return {
      resultGetter,
      tx: assembled<ReturnType<typeof ok<undefined>>>({
        signAndSend: async () =>
          ({
            get result() {
              resultGetter();
              throw new TypeError("Cannot read properties of undefined (reading 'type')");
            },
            sendTransactionResponse: { hash: raw.txHash },
            getTransactionResponse: response,
          }) as never,
      }),
    };
  }

  it("parses the real response as FAILED, with the diagnostic events the reason is in", async () => {
    const response = (await parsedResponse()) as { status: string; diagnosticEventsXdr?: unknown[] };
    expect(response.status).toBe("FAILED");
    expect(Array.isArray(response.diagnosticEventsXdr)).toBe(true);
  });

  it("throws the contract error the ledger recorded, as a ledger failure with its transaction", async () => {
    const { tx } = await failedSend();
    const error = await runWrite("claimRacepack", async () => tx).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SterunContractError);
    const contractError = error as SterunContractError;
    expect(contractError.code).toBe(102);
    expect(contractError.is("AlreadyClaimed", "race-record")).toBe(true);
    expect(contractError.phase).toBe("ledger");
    expect(contractError.txHash).toBe(raw.txHash);
    expect(contractError.ledger).toBe(raw.ledger);
    expect(contractError.message).toMatch(/failed on the ledger with AlreadyClaimed/);
    expect(contractError.message).not.toMatch(/could not be simulated/);
  });

  it("never touches the result getter of a FAILED transaction, which is what crashed", async () => {
    const { tx, resultGetter } = await failedSend();
    await runWrite("claimRacepack", async () => tx).catch(() => undefined);
    expect(resultGetter).not.toHaveBeenCalled();
  });

  it("still names the transaction when a ledger failure carries no readable reason", async () => {
    const error = await runWrite("enter", async () =>
      assembled({
        signAndSend: async () =>
          ({
            get result(): never {
              throw new TypeError("Cannot read properties of undefined (reading 'type')");
            },
            getTransactionResponse: { status: "FAILED", txHash: "beef", ledger: 7, diagnosticEventsXdr: [] },
          }) as never,
      }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SterunNetworkError);
    expect((error as SterunNetworkError).txHash).toBe("beef");
    expect((error as Error).message).toMatch(/failed on the ledger in transaction beef/);
  });

  it("keeps a simulation refusal labelled as a simulation refusal", async () => {
    const error = await runWrite("claimRacepack", async () =>
      assembled({ simulation: { error: "HostError: Error(Contract, #102)" } }),
    ).catch((e: unknown) => e);
    expect((error as SterunContractError).phase).toBe("simulation");
    expect((error as SterunContractError).txHash).toBeUndefined();
  });
});

describe("ledgerFailureCode", () => {
  const event = (topics: unknown[]) => ({ event: { body: { v0: { topics } } } });

  it("reads 102 from the real rehearsal transaction's events", async () => {
    const raw = JSON.parse(
      readFileSync(new URL("./fixtures/failed-claim-already-claimed.rpc.json", import.meta.url), "utf8"),
    ).result;
    const server = new rpc.Server("https://soroban-testnet.stellar.org");
    (server as unknown as { _getTransaction: () => Promise<unknown> })._getTransaction = async () => raw;
    const response = (await server.getTransaction(raw.txHash)) as { diagnosticEventsXdr?: unknown };
    expect(ledgerFailureCode(response.diagnosticEventsXdr)).toBe(102);
  });

  it("prefers host_fn_failed over an earlier frame's error", () => {
    expect(
      ledgerFailureCode([
        event([{ symbol: "error" }, { error: { contract: 5 } }]),
        event([{ symbol: "host_fn_failed" }, { error: { contract: 102 } }]),
      ]),
    ).toBe(102);
  });

  it("falls back to any contract error topic when there is no host_fn_failed", () => {
    expect(ledgerFailureCode([event([{ symbol: "error" }, { error: { contract: 5 } }])])).toBe(5);
  });

  it("is null for no events, no errors, or something that is not a list", () => {
    expect(ledgerFailureCode([])).toBeNull();
    expect(ledgerFailureCode([event([{ symbol: "mint" }])])).toBeNull();
    expect(ledgerFailureCode(undefined)).toBeNull();
    expect(ledgerFailureCode({ not: "a list" })).toBeNull();
  });
});

