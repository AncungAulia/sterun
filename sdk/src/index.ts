/**
 * `@sterun/sdk` — call the Sterun race-record contracts from TypeScript.
 *
 * STE-15, component C5 of docs/SYSTEM_DESIGN.md. The contracts are frozen at
 * docs/specs/INTERFACE.md v1.0.0; everything exported here is a client for
 * exactly that surface and nothing more.
 *
 * ```ts
 * import { SterunClient, TESTNET } from "@sterun/sdk";
 *
 * const sterun = new SterunClient({
 *   ...TESTNET,
 *   contracts: {
 *     eventRegistry: process.env.EVENT_REGISTRY!,
 *     raceRecord: process.env.RACE_RECORD!,
 *   },
 * });
 *
 * // No wallet needed for any of this.
 * const event = await sterun.getEvent(0);
 * const records = await sterun.recordsOfDetailed(runnerAddress);
 * ```
 */
export {
  SterunClient,
  type SterunClientOptions,
  type SterunContracts,
  type SterunSigner,
  type CallOptions,
  type CreateEventArgs,
  type AddCategoryArgs,
  type EnterArgs,
} from "./client.js";

export {
  EVENT_STATUSES,
  RECORD_STATES,
  STROOPS_PER_UNIT,
  formatStroops,
  fromHex32,
  toHex,
  type EventStatus,
  type RecordState,
  type SterunCategory,
  type SterunEvent,
  type SterunRecord,
} from "./types.js";

export {
  EVENT_REGISTRY_ERRORS,
  NON_FUNGIBLE_TOKEN_ERRORS,
  RACE_RECORD_ERRORS,
  SterunContractError,
  SterunError,
  SterunNetworkError,
  SterunSignerError,
  asContractError,
  classifyContractError,
  parseContractErrorCode,
  type ContractErrorInfo,
  type ContractErrorSource,
  type ContractErrorVariant,
} from "./errors.js";

export { type SentResult } from "./tx.js";

export { FUTURENET, MAINNET, TESTNET, type SterunNetwork } from "./network.js";
