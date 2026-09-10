/**
 * What can be checked, and where to check it.
 *
 * This tab is the product's actual claim. Everything else on the page is a
 * race describing itself, which any website can do; this is the part that says
 * the description cannot have changed since people paid, and hands over the
 * pieces to verify it without trusting this page at all.
 *
 * Three states, and which one is showing matters more than anything in it:
 *
 *   verified     the bytes served hash to what was committed on chain
 *   modified     they do not, and the document is withheld everywhere
 *   unavailable  there was nothing to check
 *
 * The hashes are printed in full for the modified case rather than summarised.
 * Somebody reading that is about to compare them by hand, and half a hash is
 * no use for that.
 */
import { Badge } from "@/components/ui/badge";
import { CONTRACTS, EXPLORER_BASE } from "@/lib/env";
import { gunStartConflict, type MetadataResult } from "@/lib/metadata";

function Contract({ label, id }: { label: string; id: string }) {
  if (!id) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-n-200 py-3 last:border-b-0">
      <p className="w-40 shrink-0 text-sm text-n-500">{label}</p>
      {EXPLORER_BASE ? (
        <a
          href={`${EXPLORER_BASE}/contract/${id}`}
          target="_blank"
          rel="noreferrer"
          className="numeric text-sm break-all text-teal-500 underline underline-offset-4"
        >
          {id}
        </a>
      ) : (
        <span className="numeric text-sm break-all text-foreground">{id}</span>
      )}
    </div>
  );
}

export function TabProofs({
  result,
  uri,
  metadataHash,
  startsAt,
}: {
  result: MetadataResult | undefined;
  uri: string;
  metadataHash: string;
  /** `starts_at` from the chain, to check the document's own claim against. */
  startsAt: bigint;
}) {
  /*
    A document can pass its hash and still contradict the chain. `gun_start`
    is the only field with a counterpart in the contract, so it is the only one
    that can be checked this way, and a mismatch is worth saying: it means the
    organiser published a start time and then created the event with another.
    Not a forgery, and not withheld like a broken hash, but not something to
    let a runner discover on race morning either.
  */
  const conflict =
    result?.status === "verified" && gunStartConflict(result.document, startsAt);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="heading-strong text-lg text-foreground">The event document</h2>

        {result?.status === "verified" ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Badge variant="success">Document verified</Badge>
            <p className="text-base text-n-600">
              The file served at this race{"'"}s address hashes to exactly what the organiser
              committed to on chain.
            </p>
          </div>
        ) : null}

        {conflict ? (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-warning-border bg-warning-surface px-5 py-4"
          >
            <p className="heading-strong text-base text-warning">
              The document disagrees with the chain about the start
            </p>
            <p className="mt-1 text-base text-n-700">
              Its schedule names a different gun start from the one the contract holds. The
              contract is what this page shows, because it is the one nobody can rewrite.
            </p>
          </div>
        ) : null}

        {result?.status === "modified" ? (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-danger-border bg-danger-surface px-5 py-4"
          >
            <p className="heading-strong text-base text-danger">This document has been changed</p>
            <p className="mt-1 text-base text-n-700">
              What was committed on chain and what is served today are not the same bytes, so
              nothing from the document is shown anywhere on this page.
            </p>
            <dl className="mt-3 grid gap-x-4 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-n-500">On chain</dt>
              <dd className="numeric break-all text-n-700">{result.expectedHash}</dd>
              <dt className="text-n-500">Served now</dt>
              <dd className="numeric break-all text-n-700">{result.actualHash}</dd>
            </dl>
          </div>
        ) : null}

        {result === undefined || result.status === "unavailable" ? (
          <div className="mt-3 rounded-lg border border-n-200 bg-n-50 px-5 py-4">
            <p className="text-base text-n-600">
              The document could not be read, so this page shows only what is on chain. The race,
              its distances and their quotas are unaffected.
            </p>
            {result?.status === "unavailable" ? (
              <p className="mt-1 text-sm text-n-500">{result.reason}</p>
            ) : null}
          </div>
        ) : null}

        <dl className="mt-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-n-200 py-3">
            <dt className="w-40 shrink-0 text-sm text-n-500">Committed hash</dt>
            <dd className="numeric text-sm break-all text-foreground">{metadataHash}</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
            <dt className="w-40 shrink-0 text-sm text-n-500">Served at</dt>
            <dd className="text-sm break-all">
              <a
                href={uri}
                target="_blank"
                rel="noreferrer"
                className="text-teal-500 underline underline-offset-4"
              >
                {uri}
              </a>
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="heading-strong text-lg text-foreground">The contracts</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Everything above that is not the document was read from these. They are public, so none
          of it has to be taken on this page{"'"}s word.
        </p>
        <div className="mt-2">
          <Contract label="EventRegistry" id={CONTRACTS.eventRegistry} />
          <Contract label="RaceRecord" id={CONTRACTS.raceRecord} />
        </div>
      </section>
    </div>
  );
}
