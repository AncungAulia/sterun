/**
 * Who is running this, where, and what they say about it.
 *
 * All of it from the document, which is why the page keeps the verification
 * visible elsewhere: none of this is enforced by anything, it is simply
 * frozen. What the hash buys is not that the description is true, but that it
 * is the same description the organiser committed to before anybody paid.
 */
import {
  AtSignIcon,
  CalendarDaysIcon,
  GlobeIcon,
  MapPinIcon,
  SignatureIcon,
  WalletIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { EXPLORER_BASE } from "@/lib/env";
import { formatEventDateTime, shortAddress } from "@/utils/format";
import { mapsLink } from "@/utils/geo";
import type { EventMetadata } from "@/lib/metadata";

/**
 * One fact, with a glyph for the kind of fact it is.
 *
 * The icon is here to make the list scannable, not to decorate it: a runner
 * looking for the venue finds the pin before they finish reading the labels.
 * So it stays at `n-400`, a shade below the label it belongs to, and it never
 * appears without that label. An icon on its own is a guess.
 */
function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-n-200 py-3 last:border-b-0">
      <p className="flex w-44 shrink-0 items-center gap-2.5 text-sm text-n-500">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-n-400" />
        {label}
      </p>
      <div className="text-base text-foreground">{children}</div>
    </div>
  );
}

export function TabDetails({
  document,
  organiser,
  startsAt,
}: {
  document: EventMetadata | undefined;
  organiser: string;
  startsAt: bigint;
}) {
  const place = [
    document?.location?.name,
    document?.location?.city,
    document?.location?.province,
    document?.location?.country,
  ]
    .filter(Boolean)
    .join(", ");
  const pin =
    typeof document?.location?.lat === "number" && typeof document?.location?.lng === "number"
      ? mapsLink({ lat: document.location.lat, lng: document.location.lng })
      : undefined;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="heading-strong text-lg text-foreground">General information</h2>
        <div className="mt-2">
          <Row icon={WalletIcon} label="Organised by">
            {EXPLORER_BASE ? (
              <a
                href={`${EXPLORER_BASE}/account/${organiser}`}
                target="_blank"
                rel="noreferrer"
                className="numeric text-teal-500 underline underline-offset-4"
              >
                {shortAddress(organiser, 6, 6)}
              </a>
            ) : (
              <span className="numeric">{shortAddress(organiser, 6, 6)}</span>
            )}
          </Row>
          <Row icon={CalendarDaysIcon} label="Race day">
            <span className="numeric">{formatEventDateTime(startsAt)}</span>
          </Row>
          {place ? (
            <Row icon={MapPinIcon} label="Venue">
              {place}
              {pin ? (
                <>
                  {" "}
                  <a
                    href={pin}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-500 underline underline-offset-4"
                  >
                    Open in Maps
                  </a>
                </>
              ) : null}
            </Row>
          ) : null}
          {document?.waiverUrl ? (
            <Row icon={SignatureIcon} label="Waiver">
              <a
                href={document.waiverUrl}
                target="_blank"
                rel="noreferrer"
                className="text-teal-500 underline underline-offset-4"
              >
                Read the waiver
              </a>
            </Row>
          ) : null}
        </div>
      </section>

      {document?.links?.instagram || document?.links?.website ? (
        <section>
          <h2 className="heading-strong text-lg text-foreground">Socials</h2>
          <div className="mt-2">
            {document.links.instagram ? (
              <Row icon={AtSignIcon} label="Instagram">
                <a
                  href={`https://www.instagram.com/${document.links.instagram}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-500 underline underline-offset-4"
                >
                  @{document.links.instagram}
                </a>
              </Row>
            ) : null}
            {document.links.website ? (
              <Row icon={GlobeIcon} label="Official website">
                <a
                  href={document.links.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-500 underline underline-offset-4"
                >
                  {document.links.website}
                </a>
              </Row>
            ) : null}
          </div>
        </section>
      ) : null}

      {document?.description ? (
        <section>
          <h2 className="heading-strong text-lg text-foreground">Description</h2>
          {/* `whitespace-pre-line`: an organiser typed paragraphs, and running
              them together is losing something the hash went to the trouble of
              preserving. */}
          <p className="mt-2 max-w-2xl text-base whitespace-pre-line text-n-700">
            {document.description}
          </p>
        </section>
      ) : null}
    </div>
  );
}
