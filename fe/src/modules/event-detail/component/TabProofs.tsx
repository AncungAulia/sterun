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
 * The wording is a runner's, not a developer's (2026-09-11: no page shows
 * technical wording). What a runner needs from this tab is the verdict, and
 * every verdict here is a plain sentence. The raw material behind it, the
 * fingerprints and the file itself, sits in a disclosure below: it is what
 * somebody auditing the race compares by hand, and half of them would not
 * recognise a hash, so it is one press away rather than in the way.
 *
 * The fingerprints are printed in full for the modified case rather than
 * summarised. Somebody reading that is about to compare them by hand, and half
 * a fingerprint is no use for that.
 */
import type { ReactNode } from "react";

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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-n-200 py-3 last:border-b-0">
      <dt className="w-40 shrink-0 text-sm text-n-500">{label}</dt>
      <dd className="text-sm break-all">{children}</dd>
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
        <h2 className="heading-strong text-lg text-foreground">Race details</h2>

        {result?.status === "verified" ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Badge variant="success">Details verified</Badge>
            <p className="text-base text-n-600">
              These race details are exactly what the organiser published when the race was
              created. Nothing has been changed.
            </p>
          </div>
        ) : null}

        {conflict ? (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-warning-border bg-warning-surface px-5 py-4"
          >
            <p className="heading-strong text-base text-warning">
              The schedule shows a different start time
            </p>
            <p className="mt-1 text-base text-n-700">
              The schedule lists a different start time from the one saved when the race was
              created. This page shows the saved time, because it cannot be changed.
            </p>
          </div>
        ) : null}

        {result?.status === "modified" ? (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-danger-border bg-danger-surface px-5 py-4"
          >
            <p className="heading-strong text-base text-danger">
              These race details have been changed
            </p>
            <p className="mt-1 text-base text-n-700">
              The details online today are not the ones the organiser published, so none of them
              are shown on this page.
            </p>
          </div>
        ) : null}

        {result === undefined || result.status === "unavailable" ? (
          <div className="mt-3 rounded-lg border border-n-200 bg-n-50 px-5 py-4">
            {/*
              Two different things, and saying the wrong one is a small lie. A
              race with no `uri` published nothing, so nothing was ever tried;
              telling that reader the details "could not be loaded" invites them
              to come back later for a file that does not exist.
            */}
            {uri ? (
              <>
                <p className="text-base text-n-600">
                  The race details could not be loaded, so this page shows only the basics. The
                  race, its distances and places left are not affected.
                </p>
                {result?.status === "unavailable" ? (
                  <p className="mt-1 text-sm text-n-500">{result.reason}</p>
                ) : null}
              </>
            ) : (
              <p className="text-base text-n-600">
                This race published no details, so this page shows only the basics. The race, its
                distances and places left are not affected.
              </p>
            )}
          </div>
        ) : null}

        {/*
          A native <details>: it opens with a keyboard, it is in the tab order
          without anything being wired up, and a page that prints fingerprints
          is the last place to reimplement a disclosure badly.
        */}
        <details className="mt-4 rounded-lg border border-n-200 px-5 py-3">
          <summary className="cursor-pointer text-sm text-n-600">Show technical details</summary>
          <dl className="mt-2">
            {/*
              One fingerprint per line and no line that repeats another. The
              published fingerprint IS `metadataHash`, so drawing the generic
              row as well put the same 64 characters on screen twice under two
              different labels, in the one state where somebody is comparing
              them by hand and has no way to tell what the third row was.
            */}
            {result?.status === "modified" ? (
              <>
                <Row label="Published fingerprint">
                  <span className="numeric text-n-700">{result.expectedHash}</span>
                </Row>
                <Row label="Current fingerprint">
                  <span className="numeric text-n-700">{result.actualHash}</span>
                </Row>
              </>
            ) : (
              <Row label="Fingerprint">
                <span className="numeric text-foreground">{metadataHash}</span>
              </Row>
            )}
            {uri ? (
              <Row label="Details file">
                <a
                  href={uri}
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-500 underline underline-offset-4"
                >
                  {uri}
                </a>
              </Row>
            ) : null}
          </dl>
        </details>
      </section>

      <section>
        <h2 className="heading-strong text-lg text-foreground">Public records</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Anyone can check this race independently with the links below.
        </p>
        <div className="mt-2">
          <Contract label="Race listing" id={CONTRACTS.eventRegistry} />
          <Contract label="Race records" id={CONTRACTS.raceRecord} />
        </div>
      </section>
    </div>
  );
}
