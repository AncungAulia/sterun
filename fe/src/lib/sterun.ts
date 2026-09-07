/**
 * STE-13 — the one `SterunClient` the public pages read through.
 *
 * Read-only on purpose, and that is a property worth protecting rather than a
 * detail of how it happens to be constructed. Every view method on the SDK is a
 * simulation, so the directory, an event page and a runner profile all work
 * with nothing connected: no wallet, no funded account, no signature. A shared
 * client carrying a signer would quietly turn "look at this race" into "connect
 * your wallet first", and there is a test that fails if this file ever learns
 * about the wallet.
 *
 * Writes are not built on this. They take the wallet's own address and
 * `signTransaction` per call, because the actor changes several times within
 * one race day (ARCHITECTURE.md §5.2).
 *
 * One module-level instance rather than one per component: the client holds an
 * RPC connection and no request-specific state, and rebuilding it per render
 * would throw away nothing useful while making the config live in two places.
 */
import { SterunClient } from "@sterun/sdk";

import { CONTRACTS, NETWORK } from "./env";

export const readClient = new SterunClient({
  rpcUrl: NETWORK.rpcUrl,
  networkPassphrase: NETWORK.networkPassphrase,
  contracts: {
    eventRegistry: CONTRACTS.eventRegistry,
    raceRecord: CONTRACTS.raceRecord,
  },
});
