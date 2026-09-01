/**
 * STE-6 — one place that knows which network we are on and which addresses to
 * use, so nothing downstream has to guess.
 *
 * Precedence is deliberate: environment first, `docs/deployments.md` second.
 * The document is the default because it is the audited record; the env
 * override exists so a second testnet deploy, or eventually mainnet, does not
 * require editing code. Nothing here has a hardcoded address fallback — if the
 * document cannot be read and no env var is set, we fail at startup rather than
 * talk to the wrong contract.
 */
import { Networks } from "@stellar/stellar-sdk";
import { parseKeyring, type Keyring } from "./crypto/keyring.js";
import { loadDeployments, type Deployments } from "./deployments.js";

export interface Config {
  readonly env: "development" | "production" | "test";
  readonly host: string;
  readonly port: number;
  readonly network: {
    readonly name: string;
    readonly passphrase: string;
    readonly rpcUrl: string;
    readonly horizonUrl: string;
    readonly friendbotUrl: string;
  };
  readonly addresses: Deployments;
  /**
   * Secret key of the sUSD distributor. Present only where payouts happen —
   * absent in the API process, which never needs to move funds. Read from the
   * environment and never from a file in the repo.
   */
  readonly distributorSecret: string | undefined;
  /** Stroops of sUSD handed out per faucet claim. 1 sUSD = 10_000_000 stroops. */
  readonly faucetAmount: bigint;
  /**
   * The PII vault, or `undefined` when this process is not running one.
   *
   * Absent is a legitimate state — `pnpm dev` with no setup should still start
   * and serve /health — but a HALF-configured vault is not. A DATABASE_URL
   * without PII_KEYS would be a service that can reach a database and cannot
   * encrypt, and the only safe thing to do with that is refuse to start.
   */
  readonly vault:
    | {
        readonly databaseUrl: string;
        readonly keyring: Keyring;
      }
    | undefined;
}

const num = (v: string | undefined, fallback: number): number => {
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`expected an integer, got ${JSON.stringify(v)}`);
  return n;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const fromDoc = loadDeployments();

  const nodeEnv = env.NODE_ENV === "production" || env.NODE_ENV === "test" ? env.NODE_ENV : "development";

  return {
    env: nodeEnv,
    host: env.HOST ?? "127.0.0.1",
    port: num(env.PORT, 3001),
    network: {
      name: env.STELLAR_NETWORK ?? "testnet",
      passphrase: env.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET,
      rpcUrl: env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
      horizonUrl: env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
      friendbotUrl: env.STELLAR_FRIENDBOT_URL ?? "https://friendbot.stellar.org",
    },
    addresses: {
      susdIssuer: env.SUSD_ISSUER ?? fromDoc.susdIssuer,
      susdDistributor: env.SUSD_DISTRIBUTOR ?? fromDoc.susdDistributor,
      susdSac: env.SUSD_SAC ?? fromDoc.susdSac,
      eventRegistry: env.EVENT_REGISTRY ?? fromDoc.eventRegistry,
      raceRecord: env.RACE_RECORD ?? fromDoc.raceRecord,
    },
    distributorSecret: env.SUSD_DISTRIBUTOR_SECRET,
    faucetAmount: BigInt(env.FAUCET_AMOUNT_STROOPS ?? "500000000"), // 50 sUSD
    vault: loadVaultConfig(env),
  };
}

function loadVaultConfig(env: NodeJS.ProcessEnv): Config["vault"] {
  const databaseUrl = env.DATABASE_URL;
  const keys = env.PII_KEYS;

  if (!databaseUrl && !keys) return undefined;
  if (!databaseUrl) {
    throw new Error("PII_KEYS is set but DATABASE_URL is not — the vault has nowhere to store rows");
  }
  if (!keys) {
    throw new Error(
      "DATABASE_URL is set but PII_KEYS is not. Refusing to start a vault that can reach a " +
        "database and cannot encrypt: that configuration would store identity documents in the clear. " +
        "See be/OPERATIONS.md.",
    );
  }
  return { databaseUrl, keyring: parseKeyring(keys, env.PII_ACTIVE_KEY_ID ?? "") };
}

/** sUSD has 7 decimals, like every classic Stellar asset. */
export const STROOPS_PER_UNIT = 10_000_000n;

export const formatSusd = (stroops: bigint): string => {
  const sign = stroops < 0n ? "-" : "";
  const abs = stroops < 0n ? -stroops : stroops;
  const whole = abs / STROOPS_PER_UNIT;
  const frac = (abs % STROOPS_PER_UNIT).toString().padStart(7, "0").replace(/0+$/, "");
  return `${sign}${whole}${frac ? `.${frac}` : ""}`;
};
