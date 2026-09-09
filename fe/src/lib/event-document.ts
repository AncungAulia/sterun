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

/** One distance, as the document records it. Times are `HH:mm` on the race day. */
export interface DocumentCategory {
  code: string;
  startTime: string;
  cutOff: string;
}

/**
 * One thing a runner receives, and the distances that receive it.
 *
 * Not a product with a price. `enter` moves exactly `category.price` once, so
 * an extra charge has nowhere to live; a jersey that costs more is a second
 * distance at a higher price, and this only records what that price includes.
 * The reasoning is in `modules/organiser/component/StepAddOns.tsx`.
 */
export interface DocumentAddOn {
  name: string;
  photoUrl: string;
  /** Distance codes. An add-on nobody receives is not written out. */
  includedIn: string[];
  /** Empty when the item has no sizes to pick, like a tumbler. */
  sizes: { label: string; chest: string; length: string }[];
}

/** Everything the wizard collects for the document. Empty string means absent. */
export interface EventDocumentDraft {
  /** Unix seconds, the same value that goes on chain as `starts_at`. */
  startsAt: bigint;
  /** `YYYY-MM-DD`, the day every category time is placed on. */
  raceDate: string;
  /**
   * The distances, in the order they were planned. They are here rather than
   * on chain because the contract has no field for a start time, and a 5K and
   * a half marathon on one morning do not start together.
   */
  categories: DocumentCategory[];
  description: string;
  /** The venue's own name, e.g. "Gelora Bung Karno". */
  locationName: string;
  /** Names, not codes: this file is read by people and by other clients. */
  city: string;
  province: string;
  country: string;
  /** ISO 3166-1 alpha-2, kept alongside the name so a filter has something exact. */
  countryCode: string;
  /**
   * A Google Maps URL as pasted. The pin is extracted from it; the URL itself
   * is not stored, because a link goes stale and two numbers do not.
   */
  locationLink: string;
  posterUrl: string;
  waiverUrl: string;
  /** Handle or profile url as pasted; only the handle is stored. */
  instagram: string;
  website: string;
  /** ISO 8601 strings, or empty. */
  registrationOpens: string;
  registrationCloses: string;
  /**
   * A range of days and the hours a desk is open on each of them, rather than
   * one continuous window. "1 August 09:00 to 9 August 21:00" claims the
   * collection desk is staffed overnight, and volunteers go home.
   */
  racepackFrom: string;
  racepackTo: string;
  racepackOpens: string;
  racepackCloses: string;
  racepackVenue: string;
  racepackVenueLink: string;
  /** What is in the race pack. Empty is normal and writes nothing. */
  addOns: DocumentAddOn[];
  /**
   * The rules a runner agrees to, as the organiser typed them.
   *
   * Here rather than on a page the organiser hosts, because being inside this
   * file is what makes them permanent: the hash on chain covers them, so the
   * terms somebody agreed to are provably the terms still being served.
   */
  terms: string;
}

interface Phase {
  phase: string;
  starts_at?: string;
  ends_at?: string;
  /** `HH:mm`, and only on a phase whose days are not continuous. */
  daily_opens?: string;
  daily_closes?: string;
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
  /**
   * The race day's own cut off is the last of the categories'. A day is over
   * for the event when it is over for its slowest distance.
   */
  const cutOffs = draft.categories
    .map((category) => instantOn(draft.raceDate, category.cutOff, category.startTime))
    .filter((value): value is string => value !== null);
  if (cutOffs.length > 0) raceDay.cut_off = cutOffs.sort().at(-1)!;

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
  const racepackStart = dayAt(draft.racepackFrom, draft.racepackOpens);
  const racepackEnd = dayAt(draft.racepackTo || draft.racepackFrom, draft.racepackCloses);
  if (racepackStart && racepackEnd) {
    const racepack: Phase = {
      phase: "racepack",
      // Kept, so a reader that knows nothing about daily hours still gets a
      // window covering the whole collection period.
      starts_at: racepackStart,
      ends_at: racepackEnd,
      daily_opens: draft.racepackOpens,
      daily_closes: draft.racepackCloses,
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
  /**
   * Every part is optional on its own, and any part is worth having. A race
   * with only a city is still placed; a race with only coordinates is still
   * findable. The pin is what a "races near me" search would use, and the names
   * are what a person reads.
   */
  const pin = parseCoordinates(draft.locationLink);
  const location: Record<string, unknown> = {};
  if (draft.locationName) location.name = draft.locationName;
  if (draft.city) location.city = draft.city;
  if (draft.province) location.province = draft.province;
  if (draft.country) {
    location.country = draft.country;
    if (draft.countryCode) location.country_code = draft.countryCode;
  }
  if (pin) {
    location.lat = pin.lat;
    location.lng = pin.lng;
  }
  if (Object.keys(location).length > 0) document.location = location;
  document.schedule = schedule;
  if (draft.description) document.description = draft.description;
  // Trailing whitespace trimmed but the line breaks kept: the shape of a terms
  // document is most of its readability, and a hash over a stray blank line at
  // the end is a different hash for the same rules.
  if (draft.terms.trim()) document.terms = draft.terms.trim();
  if (draft.waiverUrl) document.waiver_url = draft.waiverUrl;

  /**
   * Where the race actually talks to people. Worth having for its own sake,
   * and worth having *here*: these links are covered by the hash, so the
   * account an organiser named when the event was created cannot quietly
   * become a different one after people have entered.
   */
  /**
   * Written even though the contract stores the same codes and quotas, because
   * the times are here and nowhere else, and a client reading this file should
   * not have to join it against a contract call to know when a wave goes.
   */
  const categories = draft.categories
    .filter((category) => category.code)
    .map((category) => {
      const entry: Record<string, string> = { code: category.code };
      const start = instantOn(draft.raceDate, category.startTime, null);
      if (start) entry.start_time = start;
      const cutOff = instantOn(draft.raceDate, category.cutOff, category.startTime);
      if (cutOff) entry.cut_off = cutOff;
      return entry;
    });
  if (categories.length > 0) document.categories = categories;

  /**
   * What each ticket actually buys. Written here rather than left implied by
   * the price, because the price alone cannot tell a runner whether a shirt is
   * coming, and this file is the only permanent record either of them has.
   *
   * Measurements are numbers, not strings: a size chart is data a client can
   * lay out as a table or convert to inches, and "52 cm" would make both a
   * parsing job. A row that is only a label is still kept, because plenty of
   * races publish S/M/L with no chart at all and an empty chart says less than
   * a list of what exists.
   */
  const addOns = draft.addOns
    .filter((addOn) => addOn.name.trim() && addOn.includedIn.length > 0)
    .map((addOn) => {
      const entry: Record<string, unknown> = { name: addOn.name.trim() };
      if (addOn.photoUrl) entry.photo_url = addOn.photoUrl;
      entry.included_in = addOn.includedIn;
      const sizes = addOn.sizes
        .filter((size) => size.label.trim())
        .map((size) => {
          const row: Record<string, unknown> = { label: size.label.trim() };
          const chest = Number(size.chest);
          const length = Number(size.length);
          if (size.chest.trim() && Number.isFinite(chest)) row.chest_cm = chest;
          if (size.length.trim() && Number.isFinite(length)) row.length_cm = length;
          return row;
        });
      if (sizes.length > 0) entry.sizes = sizes;
      return entry;
    });
  if (addOns.length > 0) document.add_ons = addOns;

  const instagram = instagramHandle(draft.instagram);
  const links: Record<string, string> = {};
  if (instagram) links.instagram = instagram;
  if (draft.website) links.website = draft.website;
  if (Object.keys(links).length > 0) document.links = links;

  return `${JSON.stringify(document, null, 2)}\n`;
}

/** sha256 of the document, hex, which is exactly what goes on chain. */
export async function documentHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The handle out of whatever was pasted.
 *
 * The handle is stored rather than a url, because it is the durable half:
 * Instagram has changed its url shape before and this document can never be
 * edited. Accepting a pasted profile url anyway, because pasting the address
 * bar is what people do, and the alternative is an event page linking to
 * instagram.com/https://instagram.com/jakartarun.
 */
function instagramHandle(input: string): string | null {
  const text = input.trim().replace(/\/+$/, "");
  if (!text) return null;

  const fromUrl = /(?:instagram\.com|instagr\.am)\/([^/?#]+)/i.exec(text);
  const handle = (fromUrl ? fromUrl[1]! : text).replace(/^@/, "");

  // Instagram's own rule: letters, digits, dots and underscores, up to 30.
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null;
}

function toIso(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toISOString();
}

/**
 * An `HH:mm` placed on the race day, as an instant.
 *
 * `after` is the time it must not precede. A cut off earlier than its own start
 * is an overnight distance, not one that ended before it began, so it rolls to
 * the next day. A start time has nothing to be after and is taken as given.
 */
/** A `YYYY-MM-DD` and an `HH:mm` as one instant, or null if either is missing. */
function dayAt(day: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const moment = new Date(`${day}T${time}`);
  return Number.isNaN(moment.getTime()) ? null : moment.toISOString();
}

function instantOn(raceDate: string, time: string, after: string | null): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;

  const moment = new Date(`${raceDate}T${time}`);
  if (Number.isNaN(moment.getTime())) return null;

  if (after && /^\d{2}:\d{2}$/.test(after)) {
    const reference = new Date(`${raceDate}T${after}`);
    if (moment.getTime() <= reference.getTime()) moment.setDate(moment.getDate() + 1);
  }
  return moment.toISOString();
}
