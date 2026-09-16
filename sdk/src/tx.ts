/**
 * STE-15 (C5) — the one place a contract call turns into either a value or a
 * typed error.
 *
 * Every method on {@link SterunClient} funnels through `runRead` or `runWrite`,
 * so there is exactly one implementation of "what does failure look like" and
 * exactly one thing to test. The two differ in one way only: a read is a
 * simulation and needs no wallet; a write signs the simulated transaction and
 * waits for a ledger.
 *
 * ## Why the error comes from `simulation.error` and never from `result`
 *
 * The bindings' `result` getter is not a usable error channel. Probed against
 * the live contracts:
 *
 *     get_event(999)   -> result.unwrapErr() === { message: "" }
 *     owner_of(9999)   -> result === Err { error: { message:
 *                           "Indicates a non-existent `token_id`." } }
 *
 * The first drops the code entirely. The second returns an `Err` from a method
 * the types say returns `string`, carrying the Rust *doc comment* rather than
 * the variant name — useless for branching, and not even stable, since editing
 * a comment in the contract would change it.
 *
 * `simulation.error`, meanwhile, is uniform across both: it is always
 * `HostError: Error(Contract, #N)`, for `Result`-returning methods and
 * panicking ones alike. That string is the input to errors.ts, and the band the
 * number falls in says which contract it came from.
 *
 * ## Why the seam is structural
 *
 * `AssembledLike` and `SentLike` describe only the members used here, so a real
 * `AssembledTransaction` satisfies them without an adapter and a plain object
 * satisfies them in tests. The whole client is therefore testable — including
 * every revert path, which is the hard half — without a network, which is what
 * lets these tests live in `typescript.yml` next to everything else.
 */
import {
  SterunContractError,
  SterunNetworkError,
  SterunSignerError,
  asContractError,
  classifyContractError,
} from "./errors.js";

/** The bindings' `Result`, structurally. */
interface ResultLike<T> {
  unwrap(): T;
  isErr(): boolean;
}

const isResultLike = <T>(value: unknown): value is ResultLike<T> =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ResultLike<T>).unwrap === "function" &&
  typeof (value as ResultLike<T>).isErr === "function";

export interface SentLike<T> {
  result: T;
  sendTransactionResponse?: { hash?: string } | undefined;
  getTransactionResponse?:
    | {
        txHash?: string;
        ledger?: number;
        /** `"SUCCESS"` or `"FAILED"` once the transaction is in a ledger. */
        status?: string;
        /** Parsed diagnostic events; where a ledger failure's contract error is. */
        diagnosticEventsXdr?: unknown;
      }
    | undefined;
}

/**
 * The contract error a transaction failed on the ledger with, read from its
 * diagnostic events, or `null` when none carries one.
 *
 * A transaction that simulated cleanly and then failed on the ledger (STE-61:
 * two scanner desks claiming one race pack in the same ledger) has no
 * `simulation.error` and no return value. The reason is in the diagnostic
 * events the RPC returns with it, as
 *
 *     topics: [ symbol "host_fn_failed", error { contract: 102 } ]
 *
 * preceded by frame-exit events carrying the same error. `host_fn_failed` is the
 * host's verdict on the whole invocation, so it wins; any other contract error
 * topic is the fallback.
 *
 * The events are read through their JSON form. The XDR objects stellar-sdk 17
 * parses them into expose fields, not the accessor methods older versions had,
 * and the JSON form is the one shape both describe the same way.
 */
export function ledgerFailureCode(diagnosticEvents: unknown): number | null {
  if (!Array.isArray(diagnosticEvents)) return null;
  let fallback: number | null = null;
  for (const event of diagnosticEvents) {
    let json: unknown;
    try {
      json = JSON.parse(
        JSON.stringify(event, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
      );
    } catch {
      continue;
    }
    const topics = (json as { event?: { body?: { v0?: { topics?: unknown } } } } | null)?.event?.body
      ?.v0?.topics;
    if (!Array.isArray(topics)) continue;
    const symbol = (topics[0] as { symbol?: unknown } | null)?.symbol;
    for (const topic of topics) {
      const code = (topic as { error?: { contract?: unknown } } | null)?.error?.contract;
      if (typeof code !== "number" || !Number.isSafeInteger(code)) continue;
      if (symbol === "host_fn_failed") return code;
      fallback ??= code;
    }
  }
  return fallback;
}

/**
 * The part of `AssembledTransaction` this module touches.
 *
 * `simulation` is `unknown` rather than `{ error?: string }` on purpose. The
 * SDK types it as a union of a success response and an error response, and the
 * success half declares no `error` member at all — so a narrower structural
 * type does not match, and widening it with a cast would be asserting something
 * about a shape we are precisely trying to interrogate. {@link simulationError}
 * does the narrowing at runtime, where the answer actually is.
 */
export interface AssembledLike<T> {
  simulation?: unknown;
  readonly result: T;
  signAndSend(options?: { signTransaction?: unknown; force?: boolean }): Promise<SentLike<T>>;
}

/** The host error string of a failed simulation, or `undefined` if it succeeded. */
export function simulationError(simulation: unknown): string | undefined {
  if (typeof simulation !== "object" || simulation === null) return undefined;
  const error = (simulation as { error?: unknown }).error;
  return typeof error === "string" && error.length > 0 ? error : undefined;
}

/** What a mutating call gives back once it is in a ledger. */
export interface SentResult<T> {
  /** The contract's return value, already unwrapped and converted. */
  value: T;
  /** Transaction hash — the thing you paste into stellar.expert. */
  txHash: string;
  /** Ledger sequence the transaction landed in, when the RPC reported one. */
  ledger: number | null;
}

/**
 * Throw for a simulation that failed, in the right shape.
 *
 * A revert becomes a {@link SterunContractError} with its band decoded; a
 * failure that is not a revert (transport, malformed request, archived entry)
 * becomes a {@link SterunNetworkError}. Callers act on those two very
 * differently — one is an answer, the other is the absence of one — so they are
 * never collapsed into a single type.
 */
function throwSimulationFailure(method: string, error: string, cause?: unknown): never {
  const contractError = asContractError(error, method, cause ? { cause } : undefined);
  if (contractError) throw contractError;
  throw new SterunNetworkError(
    `${method} could not be simulated: ${error}`,
    method,
    cause ? { cause } : undefined,
  );
}

/** Unwrap the bindings' `Result` when there is one; pass plain values through. */
function unwrapValue<T>(method: string, result: T | ResultLike<T>): T {
  if (!isResultLike<T>(result)) return result;
  if (!result.isErr()) return result.unwrap();
  // Only reachable if a simulation reported no error yet still produced an Err.
  // Nothing observed does this, but silently returning an Err as a value would
  // hand the caller a broken object typed as a good one.
  throw new SterunNetworkError(
    `${method} returned an error result without a simulation error — ` +
      `the RPC response was inconsistent`,
    method,
  );
}

/**
 * A view call. Simulation only: nothing is signed, nothing is submitted, and no
 * account needs funds — which is what makes `verify`, `recordsOf` and the
 * directory reads work with no wallet connected at all.
 */
export async function runRead<T>(
  method: string,
  assemble: () => Promise<AssembledLike<T | ResultLike<T>>>,
): Promise<T> {
  let tx: AssembledLike<T | ResultLike<T>>;
  try {
    tx = await assemble();
  } catch (e) {
    // Building already simulates, so a revert can surface as a throw here too.
    const message = e instanceof Error ? e.message : String(e);
    throwSimulationFailure(method, message, e);
  }

  const error = simulationError(tx.simulation);
  if (error) throwSimulationFailure(method, error);
  return unwrapValue(method, tx.result);
}

/**
 * A mutating call: simulate, sign, submit, wait for a ledger.
 *
 * The simulation is checked before anything is signed, so a call that is going
 * to revert — a full quota, an event that is not `Open`, a race pack already
 * collected — costs the caller a wallet prompt they would only have rejected
 * anyway, and produces the same typed error a read would.
 *
 * A revert can still happen *after* a clean simulation: between simulating and
 * landing, somebody else can take the last slot. That failure arrives from the
 * send phase and is decoded the same way, so `QuotaFull` means `QuotaFull`
 * whichever half of the call produced it.
 */
export async function runWrite<T>(
  method: string,
  assemble: () => Promise<AssembledLike<T | ResultLike<T>>>,
): Promise<SentResult<T>> {
  let tx: AssembledLike<T | ResultLike<T>>;
  try {
    tx = await assemble();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throwSimulationFailure(method, message, e);
  }

  const simError = simulationError(tx.simulation);
  if (simError) throwSimulationFailure(method, simError);

  let sent: SentLike<T | ResultLike<T>>;
  try {
    // The signer is not passed here: it was supplied when the transaction was
    // assembled, which is also what made the simulation run as the right
    // account. Handing a different one in at send time would sign something
    // other than what was simulated.
    sent = await tx.signAndSend();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/NoSigner|no signer|signTransaction/i.test(message) && !/Error\(Contract/.test(message)) {
      throw new SterunSignerError(
        `${method} needs a signer. Pass one to the SterunClient constructor, or per call: ` +
          `a Keypair in Node, or the wallet's signTransaction in a browser.`,
        { cause: e },
      );
    }
    throwSimulationFailure(method, message, e);
  }

  // A transaction can simulate cleanly and still fail on the ledger — two desks
  // claiming one race pack, two runners taking the last place, in one ledger.
  // Checked before `result` is touched: for a FAILED transaction stellar-sdk 17
  // still sets `returnValue: undefined`, and its `result` getter then crashes
  // with "Cannot read properties of undefined (reading 'type')". That TypeError
  // used to be reported here as a *simulation* failure, and the contract error
  // the ledger recorded was lost (STE-61).
  const response = sent.getTransactionResponse;
  if (response?.status === "FAILED") {
    const txHash = response.txHash ?? sent.sendTransactionResponse?.hash ?? "unknown";
    const ledger = response.ledger ?? null;
    const code = ledgerFailureCode(response.diagnosticEventsXdr);
    if (code !== null) {
      throw new SterunContractError(
        classifyContractError(code),
        method,
        `HostError: Error(Contract, #${code})`,
        undefined,
        { txHash, ledger },
      );
    }
    throw new SterunNetworkError(
      `${method} failed on the ledger in transaction ${txHash}, and the RPC response does not ` +
        `say why; look the transaction up to find out`,
      method,
      undefined,
      { txHash },
    );
  }

  let value: T;
  try {
    value = unwrapValue(method, sent.result);
  } catch (e) {
    // `result` on a failed SentTransaction throws with the host error inside.
    const message = e instanceof Error ? e.message : String(e);
    throwSimulationFailure(method, message, e);
  }

  const txHash = sent.getTransactionResponse?.txHash ?? sent.sendTransactionResponse?.hash;
  if (!txHash) {
    throw new SterunNetworkError(
      `${method} was submitted but the RPC returned no transaction hash, so there is ` +
        `nothing to point at as evidence`,
      method,
    );
  }

  return { value, txHash, ledger: sent.getTransactionResponse?.ledger ?? null };
}
