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
import { DEFAULT_PAGE_LIMIT } from "./indexer/indexer.js";
import { DEFAULT_EXTEND_TO_LEDGERS, DEFAULT_THRESHOLD_LEDGERS } from "./keeper/ttl.js";

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
   * Browser origins allowed to call this API.
   *
   * An allow-list, never `*`. Authenticated requests carry a wallet signature
   * in a header, and `*` would let any page a runner happens to visit ask their
   * browser to send one. Empty means no browser may call it at all, which is
   * the right default for a deployment that has not been told about its web
   * app yet.
   */
  readonly webOrigins: readonly string[];
  /**
   * STE-16. The indexer and the TTL keeper. Always present — running them is
   * decided by which process you start, not by whether they are configured,
   * and a status endpoint that cannot say what the poll interval is is worse
   * than one that always can.
   */
  readonly indexer: {
    /**
     * Any account that exists on the network. It signs nothing: view calls are
     * simulated, and a simulation still needs a source account to build an
     * envelope around. Defaults to the sUSD distributor, which
     * docs/deployments.md proves exists.
     */
    readonly simulationSource: string;
    /** 5-10s is the ticket's recommendation; 7s sits in the middle of it. */
    readonly pollIntervalMs: number;
    readonly pageLimit: number;
    /**
     * Where a first-ever poll starts. Undefined means "as far back as RPC still
     * retains", which is the most complete answer available and the right
     * default for a chain that is days old.
     */
    readonly startLedger: number | undefined;
  };
  /**
   * STE-16. Rent for the TTL keeper. Absent in the API process, which never
   * submits anything — the same split as the faucet's distributor secret.
   */
  readonly keeper: {
    readonly secret: string | undefined;
    readonly thresholdLedgers: number;
    readonly extendToLedgers: number;
  };
  /**
   * Event metadata files (posters + the JSON document `metadata_hash` commits
   * to on-chain). Always present: storing them needs no credential and no
   * database, so there is no half-configured state to guard against, unlike
   * the vault.
   */
  readonly files: {
    /** Directory the content-addressed tree lives in. */
    readonly root: string;
    /** Hard ceiling on the whole store. Bounds growth; a hit is a 507. */
    readonly maxTotalBytes: number;
    /**
     * Origin to build returned URLs from, e.g. `https://api-sterun.jameshub.fun`.
     *
     * Undefined falls back to deriving it from the request, which is right for
     * `pnpm dev` and wrong for the deployed box: `Host` is attacker-controlled,
     * and the URL this endpoint returns is one the organiser then commits
     * on-chain. Production sets it.
     */
    readonly publicBaseUrl: string | undefined;
  };
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
    // Two names accepted, and the reason is worth a line. be/.env carries the
    // whole Sterun identity set under a STERUN_ prefix — issuer, distributor,
    // admin, organiser, runners — which is a better scheme than the bare name
    // this file originally read, because it namespaces them away from anything
    // else in the environment. Rather than making that file wrong, both work;
    // the prefixed one wins where both are set.
    distributorSecret: env.STERUN_SUSD_DISTRIBUTOR_SECRET ?? env.SUSD_DISTRIBUTOR_SECRET,
    faucetAmount: BigInt(env.FAUCET_AMOUNT_STROOPS ?? "500000000"), // 50 sUSD
    webOrigins: (env.STERUN_WEB_ORIGIN ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    indexer: {
      simulationSource:
        env.INDEXER_SOURCE_ACCOUNT ?? env.SUSD_DISTRIBUTOR ?? fromDoc.susdDistributor,
      pollIntervalMs: num(env.INDEXER_POLL_INTERVAL_MS, 7_000),
      pageLimit: num(env.INDEXER_PAGE_LIMIT, DEFAULT_PAGE_LIMIT),
      startLedger: env.INDEXER_START_LEDGER ? num(env.INDEXER_START_LEDGER, 0) : undefined,
    },
    keeper: {
      secret: env.STERUN_TTL_KEEPER_SECRET ?? env.TTL_KEEPER_SECRET,
      thresholdLedgers: num(env.TTL_THRESHOLD_LEDGERS, DEFAULT_THRESHOLD_LEDGERS),
      extendToLedgers: num(env.TTL_EXTEND_TO_LEDGERS, DEFAULT_EXTEND_TO_LEDGERS),
    },
    files: {
      root: env.STERUN_FILES_ROOT ?? "./data/files",
      maxTotalBytes: num(env.STERUN_FILES_MAX_BYTES, 512 * 1024 * 1024),
      publicBaseUrl: normaliseBaseUrl(env.STERUN_PUBLIC_BASE_URL),
    },
    vault: loadVaultConfig(env),
  };
}

/**
 * Validated at startup rather than at the first upload.
 *
 * A typo'd base URL does not break anything visible here — it produces a
 * perfectly successful 201 carrying a URL that goes nowhere, which the
 * organiser then writes into `create_event`'s `uri` permanently. Failing to
 * boot is far cheaper than that.
 */
function normaliseBaseUrl(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error(
      `STERUN_PUBLIC_BASE_URL is not a valid URL: ${JSON.stringify(raw)}. ` +
        `Expected something like https://api-sterun.jameshub.fun`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `STERUN_PUBLIC_BASE_URL must be http or https, got ${JSON.stringify(parsed.protocol)}`,
    );
  }
  // No trailing slash, so callers can join with `/files/...` without producing
  // a double slash that some caches treat as a different resource.
  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
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
