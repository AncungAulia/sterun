/**
 * STE-68 — test sUSD from the web app's faucet route (`POST /faucet`), with
 * every refusal named.
 *
 * The route answers 429 for three different reasons, and they need three
 * different reactions (be/src/routes/faucet.ts):
 *
 *   ip-limit        the per-client limiter (6/min). Wait a minute, as a person
 *                   would, and ask again.
 *   address-window  this wallet was already paid inside its window. A fresh
 *                   wallet cannot hit it; if one does, something is wrong.
 *   daily-cap       the whole faucet has handed out `dailyCapStroops` in the
 *                   last 24 hours. Nothing a script does helps until
 *                   `retry_at`, so it stops with that time rather than
 *                   retrying into the same wall — the cap is 100 payouts a
 *                   day, and a seed run needs a sixth of it.
 *
 * The body's `error` is "rate-limited" for the last two; only its message
 * tells them apart. That is brittle, and it is the only signal the route
 * gives, so the words matched are the route's own and a test pins them.
 */
/** One `POST /faucet` for one wallet, as the web app sends it (harness.ts `postFaucet`). */
export type FaucetRequest = () => Promise<{ status: number; body: unknown }>;

export type FaucetReply =
  | { kind: "paid"; txHash: string; paidStroops: bigint }
  | { kind: "ip-limit" }
  | { kind: "address-window"; retryAt: string | null; message: string }
  | { kind: "daily-cap"; retryAt: string | null; message: string }
  | { kind: "empty"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "no-trustline"; message: string }
  | { kind: "other"; status: number; message: string };

interface FaucetBody {
  tx_hash?: string;
  paid_stroops?: string;
  error?: string;
  message?: string;
  retry_at?: string;
}

/** What a `POST /faucet` answer means. Pure, so the wording it depends on is tested. */
export function classifyFaucetReply(status: number, raw: unknown): FaucetReply {
  const body: FaucetBody = raw && typeof raw === "object" ? (raw as FaucetBody) : {};
  const message = body.message ?? (typeof raw === "string" ? raw : JSON.stringify(raw));
  if (status === 200 && body.tx_hash) {
    return { kind: "paid", txHash: body.tx_hash, paidStroops: BigInt(body.paid_stroops ?? "0") };
  }
  if (status === 429 && body.error === "rate-limited") {
    const retryAt = body.retry_at ?? null;
    if (/today's limit/i.test(message)) return { kind: "daily-cap", retryAt, message };
    if (/already received/i.test(message)) return { kind: "address-window", retryAt, message };
    return { kind: "other", status, message };
  }
  // Fastify's own limiter answers before the route runs, in its own words.
  if (status === 429) return { kind: "ip-limit" };
  if (body.error === "faucet-empty") return { kind: "empty", message };
  if (body.error === "faucet-unavailable") return { kind: "unavailable", message };
  if (body.error === "no-trustline") return { kind: "no-trustline", message };
  return { kind: "other", status, message };
}

/**
 * The faucet will not pay: the daily cap, a dry float, or no faucet at all.
 * Thrown so the step fails with this sentence, and the run stops asking.
 */
export class FaucetStoppedError extends Error {
  constructor(
    readonly reply: Extract<FaucetReply, { kind: "daily-cap" | "empty" | "unavailable" }>,
    readonly paidSoFar: number,
  ) {
    super(
      reply.kind === "daily-cap"
        ? `the faucet's daily cap is reached (${paidSoFar} wallet(s) paid by this run before it): "${reply.message}". ` +
            `Nothing more can be paid until ${reply.retryAt ?? "the oldest payout of the last 24 hours ages out"}; ` +
            "run again after that — do not loop"
        : reply.kind === "empty"
          ? `the faucet's float is empty: "${reply.message}" — top up the faucet account, then run again`
          : `the faucet is not available on this deployment: "${reply.message}"`,
    );
    this.name = reply.kind === "daily-cap" ? "FaucetDailyCapReached" : reply.kind === "empty" ? "FaucetEmpty" : "FaucetUnavailable";
  }
}

/**
 * How many payouts a run needs against how many the cap allows in 24 hours.
 * Read from `GET /config` before a single wallet is funded, so a run that
 * cannot fit fails before it has spent any of the day's cap.
 */
export function payoutBudget(route: { dailyCapStroops: string }, amountStroops: string, needed: number) {
  const cap = BigInt(route.dailyCapStroops);
  const amount = BigInt(amountStroops);
  const perDay = amount > 0n ? Number(cap / amount) : 0;
  return { perDay, needed, fits: needed <= perDay };
}

/**
 * Pays one wallet, waiting out the per-client limiter once. Throws on every
 * other refusal. The request and the wait are passed in so this is tested
 * without a network (and without the ESM-only SDK harness.ts pulls in).
 */
export async function fundFromFaucet(
  request: FaucetRequest,
  who: string,
  paidSoFar: number,
  wait: (ms: number) => Promise<unknown> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Extract<FaucetReply, { kind: "paid" }>> {
  const ask = async () => {
    const res = await request();
    return classifyFaucetReply(res.status, res.body);
  };
  let reply = await ask();
  if (reply.kind === "ip-limit") {
    await wait(65_000);
    reply = await ask();
  }
  switch (reply.kind) {
    case "paid":
      return reply;
    case "daily-cap":
    case "empty":
    case "unavailable":
      throw new FaucetStoppedError(reply, paidSoFar);
    case "ip-limit":
      throw new Error("the faucet's per-client limit still refused after a 65-second wait");
    case "address-window":
    case "no-trustline":
      throw new Error(`the faucet refused ${who}: ${reply.message}`);
    case "other":
      throw new Error(`the faucet answered ${reply.status}: ${reply.message}`);
  }
}
