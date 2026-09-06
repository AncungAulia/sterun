/**
 * Stellar addresses for tests, derived from fixed seeds.
 *
 * Not invented by hand: a strkey carries a CRC16 checksum, so a plausible
 * 56-character string that starts with G passes a regex and then fails inside
 * `nativeToScVal` with "Unsupported address type", four frames from wherever it
 * was written. Deriving them from a seed makes every address here real, stable
 * across runs, and readable in a failure message.
 *
 * The contract addresses are the live testnet ones from docs/deployments.md.
 * Using the real pair means a test that ever accidentally talked to a network
 * would talk to the right contracts, and it keeps the fixtures recognisable
 * next to the deploy evidence.
 */
import { Keypair } from "@stellar/stellar-sdk";

function fromLabel(label: string): string {
  const seed = Buffer.alloc(32);
  Buffer.from(label, "utf8").copy(seed);
  return Keypair.fromRawEd25519Seed(seed).publicKey();
}

export const ORGANISER = fromLabel("organiser");
export const RUNNER = fromLabel("runner-a");
export const RUNNER_B = fromLabel("runner-b");
export const SCANNER = fromLabel("scanner");
export const STRANGER = fromLabel("stranger");

/** Keypairs, for the routes that need a signature rather than just an address. */
export const keypairFor = (label: string): Keypair => {
  const seed = Buffer.alloc(32);
  Buffer.from(label, "utf8").copy(seed);
  return Keypair.fromRawEd25519Seed(seed);
};

/** docs/deployments.md — the contracts that are actually live on testnet. */
export const EVENT_REGISTRY = "CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64";
export const RACE_RECORD = "CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4";
export const SUSD_SAC = "CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU";

export const ADDRESSES = { eventRegistry: EVENT_REGISTRY, raceRecord: RACE_RECORD };
