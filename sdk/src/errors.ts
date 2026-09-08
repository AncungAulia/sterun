/**
 * STE-15 (C5) — turning a contract revert into something a caller can branch on.
 *
 * ## Why this file has to exist at all
 *
 * The generated bindings return `Result<T, Error>` for every fallible method,
 * and it looks like the error is right there. It is not. Against the live
 * contracts:
 *
 *     get_event(999) -> result.unwrapErr()  ===  { message: "" }
 *                       tx.simulation.error  ===  "HostError: Error(Contract, #2)"
 *
 * The bindings' own `Errors` map is never consulted on that path, so the code —
 * the only thing that says *what went wrong* — is dropped before the caller
 * sees it. The requirement in STE-15 is typed errors the caller can tell apart,
 * so the SDK reads the simulation's error string instead and decodes it here.
 *
 * ## Why the number alone is enough
 *
 * A Soroban `ScError` carries a bare `u32` and **no contract identity**, and
 * `enter` propagates reverts from EventRegistry and from the sUSD SAC unchanged.
 * docs/specs/INTERFACE.md §3 answers that with disjoint bands:
 *
 *     1..=99     EventRegistry (C1)
 *     100..=199  RaceRecord (C2)
 *     200..=214  OpenZeppelin NonFungibleTokenError
 *
 * So `Error(Contract, #4)` out of `enter` is EventRegistry's `EventNotOpen`,
 * never RaceRecord's `InvalidState`. Anything outside the bands — a SAC revert,
 * for instance — is `unknown` on purpose: those codes belong to a contract we
 * did not write and are not ours to name.
 *
 * ## Why the tables are duplicated from be/src/chain/errors.ts
 *
 * They are not shared, and that is deliberate. `be/` deliberately does not
 * depend on the bindings (see the header of be/src/chain/reader.ts), and making
 * the indexer depend on this package to read three lookup tables would undo
 * that. Instead both copies are pinned to the same frozen document by their own
 * test: `test/errors.test.ts` here and `be/test/chain-errors.test.ts` there
 * each parse docs/specs/INTERFACE.md and assert code-for-code and
 * name-for-name. Drift is impossible because neither copy is the source of
 * truth — the frozen spec is, and both are checked against it. It is the same
 * arrangement docs/specs/reference/{node,rust} already uses.
 */

/** INTERFACE.md §1.4 — EventRegistry (C1). */
export const EVENT_REGISTRY_ERRORS = {
  1: "NotInitialized",
  2: "EventNotFound",
  3: "CategoryNotFound",
  4: "EventNotOpen",
  5: "QuotaFull",
  6: "RaceRecordNotSet",
  7: "RaceRecordAlreadySet",
  8: "InvalidQuota",
  9: "InvalidPrice",
  10: "InvalidDistance",
  11: "InvalidStatus",
  12: "ScannerAlreadyAdded",
  13: "ScannerNotFound",
} as const satisfies Readonly<Record<number, string>>;

/** INTERFACE.md §2.4 — RaceRecord (C2). */
export const RACE_RECORD_ERRORS = {
  100: "NotInitialized",
  101: "RecordNotFound",
  102: "AlreadyClaimed",
  103: "InvalidState",
  104: "NotAuthorized",
  105: "InvalidFinishTime",
} as const satisfies Readonly<Record<number, string>>;

/** INTERFACE.md §2.4 — OpenZeppelin, embedded in the RaceRecord spec. */
export const NON_FUNGIBLE_TOKEN_ERRORS = {
  200: "NonExistentToken",
  201: "IncorrectOwner",
  202: "InsufficientApproval",
  203: "InvalidApprover",
  204: "InvalidLiveUntilLedger",
  205: "MathOverflow",
  206: "TokenIDsAreDepleted",
  207: "InvalidAmount",
  208: "TokenNotFoundInOwnerList",
  209: "TokenNotFoundInGlobalList",
  210: "UnsetMetadata",
  211: "BaseUriMaxLenExceeded",
  212: "InvalidRoyaltyAmount",
  213: "NameMaxLenExceeded",
  214: "SymbolMaxLenExceeded",
} as const satisfies Readonly<Record<number, string>>;

/** Which frozen table owns a code. `unknown` is everything outside the bands. */
export type ContractErrorSource = "event-registry" | "race-record" | "openzeppelin" | "unknown";

/**
 * Every revert variant the two Sterun contracts and their embedded OZ enum can
 * produce. A union rather than `string` so `switch` over
 * {@link SterunContractError.variant} is exhaustive at compile time and a typo
 * in a comparison is a type error, not a branch that silently never runs.
 */
export type ContractErrorVariant =
  | (typeof EVENT_REGISTRY_ERRORS)[keyof typeof EVENT_REGISTRY_ERRORS]
  | (typeof RACE_RECORD_ERRORS)[keyof typeof RACE_RECORD_ERRORS]
  | (typeof NON_FUNGIBLE_TOKEN_ERRORS)[keyof typeof NON_FUNGIBLE_TOKEN_ERRORS];

export interface ContractErrorInfo {
  code: number;
  source: ContractErrorSource;
  /** The frozen variant name, or `null` for a code no table claims. */
  variant: ContractErrorVariant | null;
}

const lookup = (
  table: Readonly<Record<number, string>>,
  code: number,
): ContractErrorVariant | null => (table[code] as ContractErrorVariant | undefined) ?? null;

/**
 * Which table owns a code, from the code alone.
 *
 * Note the two contracts each own a `NotInitialized`, at 1 and at 100. They are
 * different variants of different enums that happen to share a name, which is
 * exactly why {@link ContractErrorInfo} carries `source` next to `variant`:
 * matching on the name alone would conflate them.
 */
export function classifyContractError(code: number): ContractErrorInfo {
  if (code >= 1 && code <= 99) {
    return { code, source: "event-registry", variant: lookup(EVENT_REGISTRY_ERRORS, code) };
  }
  if (code >= 100 && code <= 199) {
    return { code, source: "race-record", variant: lookup(RACE_RECORD_ERRORS, code) };
  }
  if (code >= 200 && code <= 299) {
    return { code, source: "openzeppelin", variant: lookup(NON_FUNGIBLE_TOKEN_ERRORS, code) };
  }
  return { code, source: "unknown", variant: null };
}

/**
 * Pull `#N` out of a host error string.
 *
 * Soroban RPC reports the revert inside human-readable text such as
 * `HostError: Error(Contract, #101)`; `simulateTransaction` has no structured
 * field for it, so the string is what there is. The pattern is narrow enough
 * that prose merely containing a number does not become a fake revert.
 */
export function parseContractErrorCode(message: string): number | null {
  const match = /Error\(Contract,\s*#(\d+)\)/.exec(message);
  if (!match?.[1]) return null;
  const code = Number(match[1]);
  return Number.isSafeInteger(code) ? code : null;
}

/** Base class for everything this SDK throws, so callers can catch one type. */
export class SterunError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * The contract said no, and this is which no it said.
 *
 * `variant` is the branch point — `QuotaFull` and `EventNotOpen` mean "show the
 * runner a different screen", while `NotInitialized` means "the deployment is
 * broken". `code` and `raw` are kept for the cases the bands cannot name, such
 * as a revert out of the SAC.
 */
export class SterunContractError extends SterunError {
  readonly code: number;
  readonly source: ContractErrorSource;
  readonly variant: ContractErrorVariant | null;

  constructor(
    info: ContractErrorInfo,
    /** The SDK method that was running, e.g. `enter` — not the contract function. */
    readonly method: string,
    /** The untouched host error string the RPC returned. */
    readonly raw: string,
    options?: ErrorOptions,
  ) {
    super(
      `${method} reverted with ${info.variant ?? "an unnamed error"} ` +
        `(#${info.code}, ${info.source})`,
      options,
    );
    this.code = info.code;
    this.source = info.source;
    this.variant = info.variant;
  }

  /**
   * Variant test that also checks the band, so the two `NotInitialized`s never
   * match each other.
   */
  is(variant: ContractErrorVariant, source?: ContractErrorSource): boolean {
    return this.variant === variant && (source === undefined || this.source === source);
  }

  /** `true` for the "this id does not exist" reverts a lookup may treat as empty. */
  get isNotFound(): boolean {
    return (
      this.is("EventNotFound", "event-registry") ||
      this.is("CategoryNotFound", "event-registry") ||
      this.is("RecordNotFound", "race-record") ||
      this.is("NonExistentToken", "openzeppelin")
    );
  }
}

/**
 * A call that failed for a reason that is not a contract revert: transport, a
 * malformed request, an archived ledger entry, a transaction that never made it
 * into a ledger.
 *
 * Kept distinct from {@link SterunContractError} because the two demand
 * opposite responses. A revert is an answer — retrying produces the same one. A
 * network failure is the absence of an answer, and retrying is exactly right.
 */
export class SterunNetworkError extends SterunError {
  constructor(
    message: string,
    readonly method: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Nothing was injected that could sign, and the call needs a signature. */
export class SterunSignerError extends SterunError {}

/**
 * Turn a host error string into a {@link SterunContractError} when it is one.
 *
 * `null` for failures that are not contract reverts — those must not be
 * reported as "the contract said no".
 */
export function asContractError(
  message: string,
  method: string,
  options?: ErrorOptions,
): SterunContractError | null {
  const code = parseContractErrorCode(message);
  if (code === null) return null;
  return new SterunContractError(classifyContractError(code), method, message, options);
}
