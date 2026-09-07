/**
 * STE-17 — writing the off-chain event document the event page verifies.
 *
 * The other half of `lib/metadata.ts`. That module downloads a document,
 * hashes its bytes and compares them against `metadata_hash`; this one produces
 * the bytes in the first place. They are two ends of one convention, and there
 * is a test that runs a generated document straight through the reader rather
 * than letting each side check itself against its own idea of the format.
 *
 * ## The rule this file has to honour
 *
 * `metadata_hash = sha256(the exact bytes served at uri)` (WEB_APP_IA.md §6).
 * So the string built here is the artefact: it is what the organiser publishes,
 * what gets hashed, and what the page will fetch back. It must serialise
 * identically every time, which is why the shape is written out by hand in a
 * fixed order rather than assembled from an object whose key order depends on
 * how it was built.
 *
 * ## Why events cannot be edited later, and what that costs here
 *
 * There is no `update_event` on the contract, so a document with a typo cannot
 * be fixed: republishing changes the bytes, the hash stops matching, and the
 * event page will refuse to show it from then on (WEB_APP_IA.md §2.2). The
 * wizard therefore shows the finished document before anything is signed.
 */
import { parseCoordinates } from "@/utils/geo";

/** Everything the wizard collects for the document. Empty string means absent. */
export interface EventDocumentDraft {
  /** Unix seconds, the same value that goes on chain as `starts_at`. */
  startsAt: bigint;
  description: string;
  locationName: string;
  /**
   * A Google Maps URL as pasted. The pin is extracted from it; the URL itself
   * is not stored, because a link goes stale and two numbers do not.
   */
  locationLink: string;
  posterUrl: string;
  waiverUrl: string;
  /** ISO 8601 strings, or empty. */
  registrationOpens: string;
  registrationCloses: string;
  racepackStarts: string;
  racepackEnds: string;
  racepackVenue: string;
  racepackVenueLink: string;
  /**
   * `HH:mm`, not a full date. A cut off is a time on the race day, and asking
   * for the day again would be asking the same question twice.
   */
  cutOff: string;
}

interface Phase {
  phase: string;
  starts_at?: string;
  ends_at?: string;
  venue?: string;
  venue_lat?: number;
  venue_lng?: number;
  gun_start?: string;
  cut_off?: string;
}

/**
 * The document, as the exact text to publish.
 *
 * `gun_start` is derived from `startsAt` rather than typed a second time.
 * They are two records of one fact, and deriving both from one input is the
 * only way they cannot disagree. The event page has a warning banner for when
 * they do, and this is the writer making sure it never has to show it.
 *
 * Written in UTC (`Z`) rather than with a local offset. Both parse to the same
 * instant, and a fixed representation means the document a person generates in
 * Jakarta is byte-identical to the one they would generate on a laptop still
 * set to a Californian timezone.
 */
export function buildEventDocument(draft: EventDocumentDraft): string {
  const raceDay: Phase = { phase: "race_day", gun_start: toIso(draft.startsAt) };
  const cutOff = cutOffInstant(draft.startsAt, draft.cutOff);
  if (cutOff) raceDay.cut_off = cutOff;

  const schedule: Phase[] = [];
  // Both ends or neither: a window with one side missing says less than no
  // window at all, and it is permanent once published.
  if (draft.registrationOpens && draft.registrationCloses) {
    schedule.push({
      phase: "registration",
      starts_at: draft.registrationOpens,
      ends_at: draft.registrationCloses,
    });
  }
  if (draft.racepackStarts && draft.racepackEnds) {
    const racepack: Phase = {
      phase: "racepack",
      starts_at: draft.racepackStarts,
      ends_at: draft.racepackEnds,
    };
    if (draft.racepackVenue) racepack.venue = draft.racepackVenue;
    const venuePin = parseCoordinates(draft.racepackVenueLink);
    if (venuePin) {
      racepack.venue_lat = venuePin.lat;
      racepack.venue_lng = venuePin.lng;
    }
    schedule.push(racepack);
  }
  schedule.push(raceDay);

  // Assembled in a fixed order, and empty fields left out entirely rather than
  // written as "". A published document is permanent, and `"waiver_url": ""`
  // is a broken link that reads as an oversight forever.
  const document: Record<string, unknown> = {};
  if (draft.posterUrl) document.poster_url = draft.posterUrl;
  if (draft.locationName) {
    // The pin is optional even when the name is not. A link with no
    // coordinates in it (a shortened maps URL, say) loses the map, and losing
    // the place name over that would be the worse trade.
    const pin = parseCoordinates(draft.locationLink);
    document.location = pin
      ? { name: draft.locationName, lat: pin.lat, lng: pin.lng }
      : { name: draft.locationName };
  }
  document.schedule = schedule;
  if (draft.description) document.description = draft.description;
  if (draft.waiverUrl) document.waiver_url = draft.waiverUrl;

  return `${JSON.stringify(document, null, 2)}\n`;
}

/** sha256 of the document, hex, which is exactly what goes on chain. */
export async function documentHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toIso(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toISOString();
}

/**
 * A cut off time, placed on the right day.
 *
 * The organiser gives an hour, not a date, because a cut off belongs to the
 * race day by definition. Almost always that is the start's own day. When the
 * hour is earlier than the start, the only reading that makes sense is the
 * following day: a race starting at 22:00 with a 06:00 cut off is an overnight
 * one, not a race that ended sixteen hours before it began.
 */
function cutOffInstant(startsAt: bigint, time: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;

  const start = new Date(Number(startsAt) * 1000);
  const [hours, minutes] = time.split(":").map(Number);
  const cutOff = new Date(start);
  cutOff.setHours(hours!, minutes!, 0, 0);
  if (cutOff.getTime() <= start.getTime()) cutOff.setDate(cutOff.getDate() + 1);

  return cutOff.toISOString();
}
