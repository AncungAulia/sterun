/**
 * STE-15 (C5) — network presets.
 *
 * Only the two values that are genuinely properties of a *network*: the RPC
 * endpoint and the passphrase. Contract ids are deliberately **not** here.
 *
 * That is the same rule the backend enforces (be/src/deployments.ts): addresses
 * live in docs/deployments.md, which is the deploy evidence a grant reviewer
 * clicks through, and a second copy inside a published npm package would drift
 * from it the first time anything is redeployed — silently, and in whichever
 * direction is worse. v1 contracts are non-upgradeable, so a redeploy means a
 * *new pair of addresses*; a client that carried them as constants would keep
 * talking to the old pair until somebody cut a release.
 *
 * So the caller passes `contracts` explicitly. For this repo that means reading
 * docs/deployments.md or the env vars it documents; for a third party it means
 * whatever their organiser gave them.
 */
export interface SterunNetwork {
  rpcUrl: string;
  networkPassphrase: string;
}

/** Where the Instawards MVP lives. */
export const TESTNET: SterunNetwork = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
};

export const FUTURENET: SterunNetwork = {
  rpcUrl: "https://rpc-futurenet.stellar.org",
  networkPassphrase: "Test SDF Future Network ; October 2022",
};

/**
 * Public network. Nothing of Sterun's is deployed here yet — the preset exists
 * so that the day it is, the change is a config value and not a code edit.
 */
export const MAINNET: SterunNetwork = {
  rpcUrl: "https://mainnet.sorobanrpc.com",
  networkPassphrase: "Public Global Stellar Network ; September 2015",
};
