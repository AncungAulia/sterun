/**
 * STE-8 — public configuration, read once and validated at module load.
 *
 * Contract addresses are deliberately not constants in the source. v1 contracts
 * are non-upgradeable, so a redeploy produces a *new pair* of addresses rather
 * than a new version of the old pair; a hardcoded address would keep talking to
 * the dead pair until somebody noticed. The same rule is enforced in
 * `@sterun/sdk` (see sdk/src/network.ts) and in the backend
 * (be/src/deployments.ts). docs/deployments.md is the source of truth.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time, so these must be
 * written out in full rather than looked up dynamically.
 */

/** A Soroban contract id: `C` followed by 55 base32 characters. */
const CONTRACT_ID = /^C[A-Z2-7]{55}$/;

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. It ships in fe/.env; check that file, or your fe/.env.local override, against docs/deployments.md.`,
    );
  }
  return value;
}

function contractId(name: string, value: string | undefined): string {
  const raw = required(name, value);
  if (!CONTRACT_ID.test(raw)) {
    throw new Error(`${name} is not a contract id (expected C… of 56 characters, got "${raw}").`);
  }
  return raw;
}

export const NETWORK = {
  rpcUrl: required("NEXT_PUBLIC_RPC_URL", process.env.NEXT_PUBLIC_RPC_URL),
  networkPassphrase: required(
    "NEXT_PUBLIC_NETWORK_PASSPHRASE",
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE,
  ),
} as const;

export const CONTRACTS = {
  eventRegistry: contractId("NEXT_PUBLIC_EVENT_REGISTRY", process.env.NEXT_PUBLIC_EVENT_REGISTRY),
  raceRecord: contractId("NEXT_PUBLIC_RACE_RECORD", process.env.NEXT_PUBLIC_RACE_RECORD),
  susdSac: contractId("NEXT_PUBLIC_SUSD_SAC", process.env.NEXT_PUBLIC_SUSD_SAC),
} as const;

/** Backend base URL (be/). Optional until the first ticket that calls it. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Reown (WalletConnect) project id. Optional on purpose: the relay refuses
 * pairings from an app it does not know, so without one WalletConnect is left
 * out of the picker rather than offered as a button that can only fail.
 */
export const WALLET_CONNECT_PROJECT_ID = (
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? ""
).trim();

/**
 * Explorer base for the configured network. Only the testnet and the public
 * network have a stellar.expert instance; anything else gets an empty string so
 * callers can hide the link rather than render a dead one.
 */
export const EXPLORER_BASE =
  NETWORK.networkPassphrase === "Test SDF Network ; September 2015"
    ? "https://stellar.expert/explorer/testnet"
    : NETWORK.networkPassphrase === "Public Global Stellar Network ; September 2015"
      ? "https://stellar.expert/explorer/public"
      : "";
