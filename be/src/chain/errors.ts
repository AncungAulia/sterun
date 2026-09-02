/**
 * STE-16 — reading a contract revert out of an RPC error string.
 *
 * A Soroban `ScError` carries a bare `u32` and **no contract identity**, and
 * `enter` propagates reverts from EventRegistry and from the SAC unchanged. The
 * project's answer is disjoint code bands (docs/specs/INTERFACE.md §3): the
 * number alone says where it came from.
 *
 *   1..=99     EventRegistry (C1)
 *   100..=199  RaceRecord (C2)
 *   200..=214  OpenZeppelin NonFungibleTokenError
 *
 * So `Error(Contract, #4)` out of `enter` is EventRegistry's `EventNotOpen`,
 * never RaceRecord's `InvalidState`. Getting this backwards in an indexer means
 * logging the wrong cause for every failed read, which is the kind of wrong
 * that survives a long time.
 *
 * The two maps below are the frozen tables. `test/chain-errors.test.ts` parses
 * docs/specs/INTERFACE.md and asserts they match it code-for-code and
 * name-for-name, so this file cannot quietly drift from the spec it claims to
 * implement.
 */

/** INTERFACE.md §1.4 — EventRegistry (C1). */
export const EVENT_REGISTRY_ERRORS: Readonly<Record<number, string>> = {
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
};

/** INTERFACE.md §2.4 — RaceRecord (C2). */
export const RACE_RECORD_ERRORS: Readonly<Record<number, string>> = {
  100: "NotInitialized",
  101: "RecordNotFound",
  102: "AlreadyClaimed",
  103: "InvalidState",
  104: "NotAuthorized",
  105: "InvalidFinishTime",
};

/** INTERFACE.md §2.4 — OpenZeppelin, embedded in the RaceRecord spec. */
export const NON_FUNGIBLE_TOKEN_ERRORS: Readonly<Record<number, string>> = {
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
};

export type ErrorSource = "event-registry" | "race-record" | "openzeppelin" | "unknown";

export interface ContractErrorInfo {
  code: number;
  source: ErrorSource;
  /** The frozen variant name, or `null` for a code no table claims. */
  name: string | null;
}

/**
 * Which table owns a code, from the code alone.
 *
 * `unknown` for anything outside the frozen bands — including the SAC's own
 * error codes, which belong to a contract we did not write and whose numbering
 * is not ours to name.
 */
export function classifyContractError(code: number): ContractErrorInfo {
  if (code >= 1 && code <= 99) {
    return { code, source: "event-registry", name: EVENT_REGISTRY_ERRORS[code] ?? null };
  }
  if (code >= 100 && code <= 199) {
    return { code, source: "race-record", name: RACE_RECORD_ERRORS[code] ?? null };
  }
  if (code >= 200 && code <= 299) {
    return { code, source: "openzeppelin", name: NON_FUNGIBLE_TOKEN_ERRORS[code] ?? null };
  }
  return { code, source: "unknown", name: null };
}

/**
 * Pull `#N` out of an RPC simulation error.
 *
 * Soroban RPC returns the revert inside a human-readable string such as
 * `HostError: Error(Contract, #101)`. There is no structured field for it in
 * `simulateTransaction`'s error response, so the string is what we have —
 * matched narrowly enough that a message merely mentioning a number does not
 * turn into a fake revert.
 */
export function parseContractErrorCode(message: string): number | null {
  const match = /Error\(Contract,\s*#(\d+)\)/.exec(message);
  if (!match?.[1]) return null;
  const code = Number(match[1]);
  return Number.isSafeInteger(code) ? code : null;
}

/**
 * A contract revert, decoded as far as the bands allow.
 *
 * Carries the raw message too: for anything outside our bands (a SAC revert,
 * a host error that is not a contract error at all) the original text is the
 * only useful thing left.
 */
export class ContractRevertError extends Error {
  readonly code: number;
  readonly source: ErrorSource;
  readonly variant: string | null;

  constructor(
    info: ContractErrorInfo,
    readonly context: string,
    readonly raw: string,
  ) {
    super(
      `${context} reverted with ${info.name ?? "an unnamed error"} ` +
        `(#${info.code}, ${info.source})`,
    );
    this.name = "ContractRevertError";
    this.code = info.code;
    this.source = info.source;
    this.variant = info.name ?? null;
  }

  /** `true` for the "this id does not exist" reverts a walk is allowed to skip. */
  get isNotFound(): boolean {
    return (
      (this.source === "event-registry" &&
        (this.variant === "EventNotFound" || this.variant === "CategoryNotFound")) ||
      (this.source === "race-record" && this.variant === "RecordNotFound") ||
      (this.source === "openzeppelin" && this.variant === "NonExistentToken")
    );
  }
}

/**
 * Turn a simulation failure into a {@link ContractRevertError} when it is one.
 *
 * Returns `null` for failures that are not contract reverts — a transport
 * error, a malformed request, an archived entry — because those must not be
 * reported as "the contract said no".
 */
export function asContractRevert(message: string, context: string): ContractRevertError | null {
  const code = parseContractErrorCode(message);
  if (code === null) return null;
  return new ContractRevertError(classifyContractError(code), context, message);
}
