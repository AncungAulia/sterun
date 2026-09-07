/**
 * Where the numbers on this page came from.
 *
 * Every public page in this app makes the same claim, that what it shows was
 * read from a contract rather than from a database of ours. A claim like that
 * is worth nothing without the address to check it against, so the registry
 * contract, the network and the RPC node are printed at the bottom of the
 * pages that make it, with a link to an explorer that is not us.
 *
 * This replaces the STE-8 connection panel, which said the same thing about
 * the network while a wallet was connected. It is not wallet state: a visitor
 * who never connects anything is exactly the person who needs to be able to
 * verify what they are reading.
 */
import { CONTRACTS, EXPLORER_BASE, NETWORK } from "@/lib/env";
import { shortAddress } from "@/utils/format";

export function ChainSource() {
  return (
    <footer className="border-t border-n-200 pt-6 text-sm text-n-500">
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt>Registry contract</dt>
        <dd className="numeric text-n-700">
          {EXPLORER_BASE ? (
            <a
              href={`${EXPLORER_BASE}/contract/${CONTRACTS.eventRegistry}`}
              target="_blank"
              rel="noreferrer"
              // The visible text is a truncated address, which reads as noise
              // out of context. The label says what it is.
              aria-label="Registry contract on stellar.expert"
              className="text-teal-500 underline underline-offset-4"
            >
              {shortAddress(CONTRACTS.eventRegistry, 6, 6)}
            </a>
          ) : (
            shortAddress(CONTRACTS.eventRegistry, 6, 6)
          )}
        </dd>
        <dt>Network</dt>
        <dd className="numeric text-n-700">{NETWORK.networkPassphrase}</dd>
        <dt>RPC</dt>
        <dd className="numeric break-all text-n-700">{NETWORK.rpcUrl}</dd>
      </dl>
    </footer>
  );
}
