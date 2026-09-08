/**
 * STE-16 (C8) — the network side of the TTL keeper, behind one interface.
 *
 * Everything that signs or submits lives here, and nothing else in the keeper
 * does, so `keeper.run()` can be exercised end to end against a fake that
 * returns TTLs and transaction hashes.
 */
import {
  BASE_FEE,
  Keypair,
  Operation,
  SorobanDataBuilder,
  TransactionBuilder,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { DEFAULT_KEYS_PER_QUERY, batch, type KeyTtl } from "./ttl.js";

/** Five minutes for an extension to make it into a ledger. */
const TIMEOUT_SECONDS = 300;
/** ~30s of polling at the SDK's default backoff. Extensions are not urgent. */
const POLL_ATTEMPTS = 15;

export interface SubmittedTransaction {
  hash: string;
  status: string;
  keys: number;
}

export interface TtlRpc {
  latestLedger(): Promise<number>;
  /** TTL for each key, in the order given. */
  liveUntil(keys: xdr.LedgerKey[]): Promise<KeyTtl[]>;
  /** One `ExtendFootprintTTLOp` over `keys`. */
  extend(keys: xdr.LedgerKey[], extendToLedgers: number): Promise<SubmittedTransaction>;
  /** One `RestoreFootprintOp` over `keys` — the runbook's last step. */
  restore(keys: xdr.LedgerKey[]): Promise<SubmittedTransaction>;
}

export class RpcTtlKeeperClient implements TtlRpc {
  private readonly server: rpc.Server;
  private readonly keypair: Keypair;

  constructor(
    rpcUrl: string,
    private readonly networkPassphrase: string,
    /**
     * The account that pays the rent. It needs XLM and nothing else: extending
     * a TTL requires no authorization from anybody, which is the whole point of
     * rent being permissionless.
     */
    keeperSecret: string,
    private readonly keysPerQuery = DEFAULT_KEYS_PER_QUERY,
  ) {
    this.server = new rpc.Server(rpcUrl);
    this.keypair = Keypair.fromSecret(keeperSecret);
  }

  get publicKey(): string {
    return this.keypair.publicKey();
  }

  async latestLedger(): Promise<number> {
    return (await this.server.getLatestLedger()).sequence;
  }

  /**
   * `getLedgerEntries` answers with the entries it has and simply **omits** the
   * ones it does not — an archived or never-written entry is a gap, not an
   * error. Matching the response back onto the request by key XDR is what turns
   * that gap into an explicit `null` the keeper can log and act on.
   */
  async liveUntil(keys: xdr.LedgerKey[]): Promise<KeyTtl[]> {
    const found = new Map<string, number | null>();
    for (const chunk of batch(keys, this.keysPerQuery)) {
      const response = await this.server.getLedgerEntries(...chunk);
      for (const entry of response.entries) {
        found.set(entry.key.toXdr("base64"), entry.liveUntilLedgerSeq ?? null);
      }
    }
    return keys.map((key) => {
      const id = key.toXdr("base64");
      return { id, key, liveUntilLedgerSeq: found.get(id) ?? null };
    });
  }

  async extend(keys: xdr.LedgerKey[], extendToLedgers: number): Promise<SubmittedTransaction> {
    // The keys to extend go in the READ-ONLY footprint; the operation itself
    // carries only the target TTL.
    return this.submit(
      Operation.extendFootprintTtl({ extendTo: extendToLedgers }),
      new SorobanDataBuilder().setReadOnly(keys).build(),
      keys.length,
    );
  }

  async restore(keys: xdr.LedgerKey[]): Promise<SubmittedTransaction> {
    // Restore is the mirror image: the keys go in the READ-WRITE footprint, and
    // the operation takes no parameters at all.
    return this.submit(
      Operation.restoreFootprint(),
      new SorobanDataBuilder().setReadWrite(keys).build(),
      keys.length,
    );
  }

  private async submit(
    operation: xdr.Operation,
    sorobanData: xdr.SorobanTransactionData,
    keyCount: number,
  ): Promise<SubmittedTransaction> {
    const account = await this.server.getAccount(this.keypair.publicKey());
    const built = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setSorobanData(sorobanData)
      .setTimeout(TIMEOUT_SECONDS)
      .build();

    // prepareTransaction simulates and fills in the resource fee. Skipping it
    // sends a transaction with BASE_FEE and no resources, which is refused.
    const prepared = await this.server.prepareTransaction(built);
    prepared.sign(this.keypair);

    const sent = await this.server.sendTransaction(prepared);
    if (sent.status === "ERROR") {
      // The useful part is the OPERATION result, not the transaction one:
      // `txFailed` on its own says nothing a person can act on, while
      // `opExtendFootprintTtlInsufficientRefundableFee` says exactly what to do.
      throw new Error(
        `TTL transaction rejected on submission: ${describeSubmitFailure(sent)}`,
      );
    }

    const final = await this.server.pollTransaction(sent.hash, { attempts: POLL_ATTEMPTS });
    return { hash: sent.hash, status: final.status, keys: keyCount };
  }
}

/**
 * A submission failure, rendered so the message names the actual cause.
 *
 * Horizon and RPC both bury the operation-level code inside the transaction
 * result. `txFailed` is true and useless; the operation result underneath is
 * what distinguishes "the fee was short" from "that TTL is above the network
 * maximum", and those have completely different fixes.
 */
export function describeSubmitFailure(sent: rpc.Api.SendTransactionResponse): string {
  const result = sent.errorResult;
  if (!result) return sent.status;
  try {
    return `${result.result.type} ${JSON.stringify(result.result.toJson())}`;
  } catch {
    return result.result.type;
  }
}
