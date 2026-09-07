/**
 * The off-chain half of an event: poster, description, location, schedule.
 *
 * Three outcomes, and which one is showing matters more than the content:
 *
 *   verified     the bytes hash to what the organiser committed to on chain
 *   modified     they do not, so nothing from the document is rendered
 *   unavailable  there was nothing to check
 *
 * "Modified" withholds the content rather than showing it under a warning. A
 * document that fails its own commitment is exactly the thing this product
 * exists to catch, and putting it on screen next to a caution label still puts
 * unverifiable claims on the page.
 *
 * "Unavailable" is the common case today, not the exotic one: every event on
 * testnet points its uri at a host that serves nothing.
 */
import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { gunStartConflict, type MetadataResult } from "@/lib/metadata";
import { mapsLink } from "@/utils/geo";
import { formatEventDateTime } from "@/utils/format";

interface EventDocumentProps {
  result: MetadataResult | undefined;
  isPending: boolean;
  /** `starts_at` from the chain, to check the document against. */
  startsAt: bigint;
}

export function EventDocument({ result, isPending, startsAt }: EventDocumentProps) {
  if (isPending) {
    return <p className="text-sm text-n-500">Checking the event document...</p>;
  }
  if (!result) return null;

  if (result.status === "unavailable") {
    return (
      <div className="rounded-lg border border-n-200 bg-n-50 px-5 py-4">
        <p className="text-base text-n-600">
          The event document could not be read, so this page shows only what is on chain. The race
          itself, its categories and their quotas are unaffected.
        </p>
        <p className="mt-1 text-sm text-n-500">{result.reason}</p>
      </div>
    );
  }

  if (result.status === "modified") {
    return (
      <div
        role="alert"
        className="rounded-lg border border-danger-border bg-danger-surface px-5 py-4"
      >
        <p className="heading-strong text-lg text-danger">The event document has been changed</p>
        <p className="mt-1 text-base text-n-700">
          What the organiser committed to on chain and what is served today are not the same bytes,
          so the document is not shown. Everything below comes from the contract.
        </p>
        <dl className="mt-3 grid gap-x-4 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-n-500">On chain</dt>
          <dd className="numeric break-all text-n-700">{result.expectedHash}</dd>
          <dt className="text-n-500">Served now</dt>
          <dd className="numeric break-all text-n-700">{result.actualHash}</dd>
        </dl>
      </div>
    );
  }

  const { document } = result;
  const conflict = gunStartConflict(document, startsAt);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Badge variant="success">Document verified</Badge>
        <p className="text-sm text-n-500">
          The document served at this event&apos;s uri matches the hash stored on chain.
        </p>
      </div>

      {document.posterUrl ? (
        <Image
          src={document.posterUrl}
          alt=""
          width={1200}
          height={630}
          unoptimized
          // Capped and contained rather than cover: the poster is whatever the
          // organiser linked to, at whatever aspect ratio they had, and a
          // portrait one at full width pushes the entry options off the screen.
          className="max-h-96 w-full rounded-lg border border-n-200 object-contain"
        />
      ) : null}

      {document.description ? (
        <p className="text-base text-n-700">{document.description}</p>
      ) : null}

      {document.location?.name ? (
        <p className="text-base text-n-600">
          {document.location.name}
          {typeof document.location.lat === "number" && typeof document.location.lng === "number" ? (
            <>
              {" "}
              <a
                href={mapsLink({ lat: document.location.lat, lng: document.location.lng })}
                target="_blank"
                rel="noreferrer"
                className="text-teal-500 underline underline-offset-4"
              >
                Open in Maps
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      {document.links?.instagram || document.links?.website ? (
        <div className="flex flex-wrap items-center gap-4">
          {document.links.instagram ? (
            <a
              href={`https://www.instagram.com/${document.links.instagram}`}
              target="_blank"
              rel="noreferrer"
              className="text-base text-teal-500 underline underline-offset-4"
            >
              @{document.links.instagram}
            </a>
          ) : null}
          {document.links.website ? (
            <a
              href={document.links.website}
              target="_blank"
              rel="noreferrer"
              className="text-base text-teal-500 underline underline-offset-4"
            >
              Race website
            </a>
          ) : null}
        </div>
      ) : null}

      {conflict && document.gunStart ? (
        <div className="rounded-lg border border-warning-border bg-warning-surface px-5 py-4">
          <p className="heading-strong text-base text-warning">
            The document disagrees with the chain about the start time
          </p>
          <p className="mt-1 text-base text-n-700">
            The contract says {formatEventDateTime(startsAt)}. The document says{" "}
            {document.gunStart}. One of the two is wrong, and this page cannot tell which, so it
            shows both.
          </p>
        </div>
      ) : null}
    </section>
  );
}
