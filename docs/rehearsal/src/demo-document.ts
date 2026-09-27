/**
 * STE-68 — a demo race's event document, written by the console's own
 * `buildEventDocument`, so the page reads it exactly as it reads a document an
 * organiser published through the wizard. The bytes this returns are what is
 * uploaded, hashed and committed on chain as `metadata_hash`.
 */
import { buildEventDocument, type EventDocumentDraft } from "../../../fe/src/modules/organiser/create/lib/event-document";
import { localToUnix, raceDate, shiftDate, startsAt, type PlannedRace, type TimeZoneName } from "./demo-plan";

/**
 * Runs `fn` with the process in `zone`. `buildEventDocument` places the
 * category and pack-desk times with `new Date("YYYY-MM-DDTHH:mm")`, which is
 * local time — in the console that is the organiser's browser, here it must be
 * the race's own zone, or a Bali start at 05:00 WITA would be written as 05:00
 * wherever this laptop is.
 */
export function inZone<T>(zone: TimeZoneName, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

/** When entries stop on chain (`set_registration_closes`), or null for the race that has run. */
export function registrationClosesAt(r: PlannedRace, now: Date): number | null {
  if (r.registrationClosesDaysBefore === null) return null;
  return localToUnix(shiftDate(raceDate(r, now), -r.registrationClosesDaysBefore), "23:59", r.timeZone);
}

export function eventDocument(r: PlannedRace, now: Date, posterUrl: string): { text: string; closesAt: number | null } {
  const day = raceDate(r, now);
  const closesAt = registrationClosesAt(r, now);
  const draft: EventDocumentDraft = {
    startsAt: BigInt(startsAt(r, now)),
    raceDate: day,
    categories: r.categories.map((c) => ({ code: c.code, startTime: c.startTime, cutOff: c.cutOff })),
    description: r.description,
    locationName: r.venue.name,
    city: r.venue.city,
    province: r.venue.province,
    country: "Indonesia",
    countryCode: "ID",
    locationLink: `https://www.google.com/maps?q=${r.venue.lat},${r.venue.lng}`,
    posterUrl,
    waiverUrl: "",
    instagram: "",
    website: "",
    // Both ends or neither, as the wizard does. The race that has run was
    // entered on the day of the seed, after it, so it states no registration
    // window at all rather than one its own records contradict.
    registrationOpens: closesAt === null ? "" : now.toISOString(),
    registrationCloses: closesAt === null ? "" : new Date(closesAt * 1000).toISOString(),
    racepackFrom: shiftDate(day, -r.racepack.daysBefore),
    racepackTo: shiftDate(day, -1),
    racepackOpens: r.racepack.opens,
    racepackCloses: r.racepack.closes,
    racepackVenue: r.racepack.venue,
    racepackVenueLink: "",
    addOns: r.addOns.map((a) => ({ name: a.name, photoUrl: "", includedIn: a.includedIn, code: a.code, sizes: [] })),
    terms: r.terms,
  };
  return { text: inZone(r.timeZone, () => buildEventDocument(draft)), closesAt };
}
