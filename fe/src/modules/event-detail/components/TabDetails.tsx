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
  BadgeCheckIcon,
  TriangleAlertIcon,
  CalendarDaysIcon,
  GlobeIcon,
  MapPinIcon,
  SignatureIcon,
  WalletIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EXPLORER_BASE } from "@/lib/chain/env";
import type { Announcement } from "@/lib/event/announcements";
import { formatEventDateTime, shortAddress } from "@/utils/format";

/** An announcement, and whether this page could confirm the organiser signed it. */
export interface RaceUpdate {
  announcement: Announcement;
  signed: boolean;
}
import { openInMapsHref } from "@/utils/geo";
import type { EventMetadata } from "@/lib/event/metadata";

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
  updates = [],
}: {
  document: EventMetadata | undefined;
  organiser: string;
  startsAt: bigint;
  /** Newest first (STE-57). The section is not drawn at all without one. */
  updates?: RaceUpdate[];
}) {
  const place = [
    document?.location?.name,
    document?.location?.city,
    document?.location?.province,
    document?.location?.country,
  ]
    .filter(Boolean)
    .join(", ");
  // The organiser's own link when the document has one, which opens the place
  // by name; a pin from the coordinates for an older document that has only those.
  const pin = document?.location ? openInMapsHref(document.location) : undefined;

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

      {updates.length > 0 ? <Updates updates={updates} /> : null}

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

/**
 * What the organiser said after publishing (STE-57), newest first.
 *
 * Every announcement is shown, including one this page could not confirm:
 * hiding it would let a broken index silently take back what an organiser
 * said, and showing it as signed would let one put words in their mouth. So
 * the mark beside each says which it is, in words, and the sentence under the
 * list says what an update can and cannot change.
 */
function Updates({ updates }: { updates: RaceUpdate[] }) {
  return (
    <section>
      <h2 className="heading-strong text-lg text-foreground">Updates</h2>
      <ol className="mt-3 flex flex-col gap-5">
        {updates.map(({ announcement, signed }) => (
          <li key={announcement.id} className="border-l-2 border-teal-200 pl-4">
            <p className="numeric text-sm text-n-500">
              {formatEventDateTime(BigInt(Math.floor(Date.parse(announcement.publishedAt) / 1000)))}
            </p>
            {/* Plain text with its paragraphs kept, like the description. */}
            <p className="mt-1 max-w-2xl text-base whitespace-pre-line text-ink">{announcement.body}</p>
            {signed ? (
              <Badge variant="success" className="mt-2">
                <BadgeCheckIcon aria-hidden="true" />
                Signed by the organiser
              </Badge>
            ) : (
              <Badge variant="warning" className="mt-2">
                <TriangleAlertIcon aria-hidden="true" />
                Could not confirm the organiser signed this
              </Badge>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-4 max-w-2xl text-sm text-n-500">
        The race details on this page are what the organiser published when the race was created.
        Updates never change them. They are added beside them.
      </p>
    </section>
  );
}
